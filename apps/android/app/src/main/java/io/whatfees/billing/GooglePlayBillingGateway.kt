package io.whatfees.billing

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams

class GooglePlayBillingGateway(context: Context) : PlayBillingGateway {
    private val billingClient = BillingClient.newBuilder(context)
        .setListener(::onPurchasesUpdated)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
        )
        .enableAutoServiceReconnection()
        .build()

    private var activePurchase: PlayBillingGateway.ResultCallback<PlayBillingResult>? = null
    private var activeProductId: String? = null
    private var connectionStarting = false

    override fun isAvailable(callback: PlayBillingGateway.ResultCallback<Boolean>) {
        withReady(object : PlayBillingGateway.ResultCallback<Unit> {
            override fun success(value: Unit) = callback.success(true)
            override fun failure(code: String, message: String) = callback.success(false)
        })
    }

    override fun listPurchases(callback: PlayBillingGateway.ResultCallback<List<PlayBillingResult>>) {
        withReady(object : PlayBillingGateway.ResultCallback<Unit> {
            override fun success(value: Unit) {
                val params = QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
                billingClient.queryPurchasesAsync(params) { result, purchases ->
                    if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                        callback.failure(
                            PlayBillingResultMapper.errorCode(result.responseCode),
                            result.debugMessage
                        )
                        return@queryPurchasesAsync
                    }
                    callback.success(purchases.mapNotNull { normalize(it) })
                }
            }

            override fun failure(code: String, message: String) = callback.failure(code, message)
        })
    }

    @Synchronized
    override fun purchase(
        activity: Activity,
        productId: String,
        callback: PlayBillingGateway.ResultCallback<PlayBillingResult>
    ) {
        if (activePurchase != null) {
            callback.failure("purchase_in_flight", "Another Google Play purchase is already active.")
            return
        }
        activePurchase = callback
        activeProductId = productId
        withReady(object : PlayBillingGateway.ResultCallback<Unit> {
            override fun success(value: Unit) = queryAndLaunch(activity, productId)
            override fun failure(code: String, message: String) = failActive(code, message)
        })
    }

    private fun queryAndLaunch(activity: Activity, productId: String) {
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId)
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(listOf(product))
            .build()

        billingClient.queryProductDetailsAsync(params) { result, detailsResult ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                failActive(PlayBillingResultMapper.errorCode(result.responseCode), result.debugMessage)
                return@queryProductDetailsAsync
            }
            val details = detailsResult.productDetailsList.firstOrNull()
            if (details == null) {
                failActive("product_unavailable", "The Google Play product is unavailable.")
                return@queryProductDetailsAsync
            }
            val selected = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
            details.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken?.let(selected::setOfferToken)
            val flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(selected.build()))
                .build()
            val launch = billingClient.launchBillingFlow(activity, flow)
            if (launch.responseCode != BillingClient.BillingResponseCode.OK) {
                failActive(PlayBillingResultMapper.errorCode(launch.responseCode), launch.debugMessage)
            }
        }
    }

    @Synchronized
    private fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        if (activePurchase == null) return
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            failActive(PlayBillingResultMapper.errorCode(result.responseCode), result.debugMessage)
            return
        }
        val purchase = purchases.orEmpty()
            .mapNotNull { normalize(it, activeProductId) }
            .firstOrNull()
        if (purchase == null) {
            failActive("unknown", "Google Play returned no matching purchase.")
            return
        }
        val callback = activePurchase ?: return
        clearActive()
        callback.success(purchase)
    }

    private fun normalize(purchase: Purchase, preferredProductId: String? = null): PlayBillingResult? {
        val state = PlayBillingResultMapper.purchaseState(purchase.purchaseState) ?: return null
        val productId = purchase.products.firstOrNull {
            preferredProductId == null || it == preferredProductId
        } ?: return null
        return PlayBillingResult(productId, purchase.purchaseToken, state)
    }

    @Synchronized
    private fun withReady(callback: PlayBillingGateway.ResultCallback<Unit>) {
        if (billingClient.isReady) {
            callback.success(Unit)
            return
        }
        if (connectionStarting) {
            callback.failure("disconnected", "Google Play billing connection is starting.")
            return
        }
        connectionStarting = true
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                synchronized(this@GooglePlayBillingGateway) { connectionStarting = false }
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    callback.success(Unit)
                } else {
                    callback.failure(
                        PlayBillingResultMapper.errorCode(result.responseCode),
                        result.debugMessage
                    )
                }
            }

            override fun onBillingServiceDisconnected() {
                synchronized(this@GooglePlayBillingGateway) { connectionStarting = false }
                failActive("disconnected", "Google Play billing disconnected.")
            }
        })
    }

    @Synchronized
    private fun failActive(code: String, message: String) {
        val callback = activePurchase ?: return
        clearActive()
        callback.failure(code, message)
    }

    private fun clearActive() {
        activePurchase = null
        activeProductId = null
    }

    override fun close() = billingClient.endConnection()
}

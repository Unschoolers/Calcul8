package io.whatfees.billing

import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.Purchase

object PlayBillingResultMapper {
    fun errorCode(responseCode: Int): String = when (responseCode) {
        BillingClient.BillingResponseCode.USER_CANCELED -> "cancelled"
        BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> "already_owned"
        BillingClient.BillingResponseCode.SERVICE_DISCONNECTED -> "disconnected"
        BillingClient.BillingResponseCode.BILLING_UNAVAILABLE -> "not_available"
        BillingClient.BillingResponseCode.ITEM_UNAVAILABLE -> "product_unavailable"
        else -> "unknown"
    }

    fun purchaseState(purchaseState: Int): String? = when (purchaseState) {
        Purchase.PurchaseState.PURCHASED -> "purchased"
        Purchase.PurchaseState.PENDING -> "pending"
        else -> null
    }
}

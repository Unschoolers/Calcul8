package io.whatfees.billing

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WhatFeesPlayBilling")
class WhatFeesPlayBillingPlugin : Plugin() {
    private lateinit var gateway: PlayBillingGateway

    override fun load() {
        gateway = GooglePlayBillingGateway(context)
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        gateway.isAvailable(callback(call) { JSObject().put("available", it) })
    }

    @PluginMethod
    fun listPurchases(call: PluginCall) {
        gateway.listPurchases(callback(call) { purchases ->
            JSObject().put("purchases", JSArray(purchases.map(::encodePurchase)))
        })
    }

    @PluginMethod
    fun purchase(call: PluginCall) {
        val productId = call.getString("productId", "").orEmpty().trim()
        if (productId.isEmpty()) {
            call.reject("A product id is required.", "product_unavailable")
            return
        }
        gateway.purchase(activity, productId, callback(call) {
            JSObject().put("purchase", encodePurchase(it))
        })
    }

    override fun handleOnDestroy() {
        if (::gateway.isInitialized) gateway.close()
        super.handleOnDestroy()
    }

    private fun encodePurchase(purchase: PlayBillingResult) = JSObject()
        .put("productId", purchase.productId)
        .put("purchaseToken", purchase.purchaseToken)
        .put("state", purchase.state)

    private fun <T> callback(
        call: PluginCall,
        encode: (T) -> JSObject
    ) = object : PlayBillingGateway.ResultCallback<T> {
        override fun success(value: T) = call.resolve(encode(value))
        override fun failure(code: String, message: String) = call.reject(message, code)
    }
}

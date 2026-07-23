package io.whatfees.billing

import android.app.Activity

interface PlayBillingGateway {
    fun isAvailable(callback: ResultCallback<Boolean>)
    fun listPurchases(callback: ResultCallback<List<PlayBillingResult>>)
    fun purchase(activity: Activity, productId: String, callback: ResultCallback<PlayBillingResult>)
    fun close()

    interface ResultCallback<T> {
        fun success(value: T)
        fun failure(code: String, message: String)
    }
}

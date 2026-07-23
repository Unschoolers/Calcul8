package io.whatfees.billing

data class PlayBillingResult(
    val productId: String,
    val purchaseToken: String,
    val state: String
)

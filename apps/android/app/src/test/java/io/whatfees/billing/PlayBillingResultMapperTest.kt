package io.whatfees.billing

import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.Purchase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlayBillingResultMapperTest {
    @Test
    fun mapsStableBillingErrors() {
        assertEquals(
            "cancelled",
            PlayBillingResultMapper.errorCode(BillingClient.BillingResponseCode.USER_CANCELED)
        )
        assertEquals(
            "already_owned",
            PlayBillingResultMapper.errorCode(BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED)
        )
        assertEquals(
            "disconnected",
            PlayBillingResultMapper.errorCode(BillingClient.BillingResponseCode.SERVICE_DISCONNECTED)
        )
        assertEquals(
            "not_available",
            PlayBillingResultMapper.errorCode(BillingClient.BillingResponseCode.BILLING_UNAVAILABLE)
        )
        assertEquals(
            "product_unavailable",
            PlayBillingResultMapper.errorCode(BillingClient.BillingResponseCode.ITEM_UNAVAILABLE)
        )
    }

    @Test
    fun mapsOnlyActionablePurchaseStates() {
        assertEquals(
            "purchased",
            PlayBillingResultMapper.purchaseState(Purchase.PurchaseState.PURCHASED)
        )
        assertEquals(
            "pending",
            PlayBillingResultMapper.purchaseState(Purchase.PurchaseState.PENDING)
        )
        assertNull(
            PlayBillingResultMapper.purchaseState(Purchase.PurchaseState.UNSPECIFIED_STATE)
        )
    }
}

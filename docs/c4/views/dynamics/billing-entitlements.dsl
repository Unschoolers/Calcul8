dynamic calcul8 "BillingEntitlementsFlow" {
    title "Billing and entitlement verification"
    seller -> calcul8.web "Starts checkout or an Android purchase."
    calcul8.web -> calcul8.android "Requests product details, purchase, or restore through the typed billing port."
    calcul8.android -> googlePlay "Uses BillingClient 8.3.0 and returns a purchase token without granting access."
    calcul8.web -> calcul8.api "Requests checkout or submits the purchase token."
    calcul8.api -> stripe "Creates checkout session or receives webhook facts."
    calcul8.api -> googlePlay "Verifies the Android purchase token."
    calcul8.api -> calcul8.cosmos "Conditionally stores versioned provider facts and projects access."
    calcul8.api -> calcul8.cosmos "Records webhook completion after all deterministic writes succeed."
    calcul8.api -> calcul8.web "Returns derived access state."
    autoLayout lr
}

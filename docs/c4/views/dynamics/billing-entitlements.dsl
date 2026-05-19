dynamic calcul8 "BillingEntitlementsFlow" {
    title "Billing and entitlement verification"
    seller -> calcul8.web "Starts checkout or purchase verification."
    calcul8.web -> calcul8.api "Requests checkout or submits purchase token."
    calcul8.api -> stripe "Creates checkout session or receives webhook facts."
    calcul8.api -> googlePlay "Verifies Android/TWA purchase token."
    calcul8.api -> calcul8.cosmos "Stores provider-specific entitlement facts."
    calcul8.api -> calcul8.web "Returns derived access state."
    autoLayout lr
}


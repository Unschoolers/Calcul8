package io.whatfees

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import io.whatfees.billing.WhatFeesPlayBillingPlugin
import io.whatfees.identity.WhatFeesGoogleIdentityPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WhatFeesPlayBillingPlugin::class.java)
        registerPlugin(WhatFeesGoogleIdentityPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}

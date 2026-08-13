package io.whatfees

import android.os.Bundle
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import com.getcapacitor.BridgeActivity
import io.whatfees.billing.WhatFeesPlayBillingPlugin
import io.whatfees.identity.WhatFeesGoogleIdentityPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WhatFeesPlayBillingPlugin::class.java)
        registerPlugin(WhatFeesGoogleIdentityPlugin::class.java)
        super.onCreate(savedInstanceState)
        applyNavigationBarPolicy()
    }

    override fun onResume() {
        super.onResume()
        applyNavigationBarPolicy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            applyNavigationBarPolicy()
        }
    }

    private fun applyNavigationBarPolicy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val controller = window.insetsController ?: return
            controller.hide(WindowInsets.Type.navigationBars())
            controller.show(WindowInsets.Type.statusBars())
            controller.systemBarsBehavior =
                WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                )
        }
    }
}

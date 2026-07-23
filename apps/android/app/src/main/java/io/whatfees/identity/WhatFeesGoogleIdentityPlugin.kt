package io.whatfees.identity

import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import io.whatfees.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "WhatFeesGoogleIdentity")
class WhatFeesGoogleIdentityPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var credentialManager: CredentialManager

    override fun load() {
        credentialManager = CredentialManager.create(context)
    }

    @PluginMethod
    fun requestCredential(call: PluginCall) {
        val clientId = context.getString(R.string.google_web_client_id).trim()
        if (clientId.isEmpty()) {
            call.reject("Google identity is not configured.", "identity_not_configured")
            return
        }
        val option = if (call.getString("mode", "interactive") == "automatic") {
            GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(true)
                .setAutoSelectEnabled(true)
                .setServerClientId(clientId)
                .build()
        } else {
            GetSignInWithGoogleOption.Builder(clientId).build()
        }
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()

        scope.launch {
            try {
                val result = credentialManager.getCredential(activity, request)
                val credential = result.credential
                if (
                    credential !is CustomCredential
                    || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    call.reject("Google returned an unsupported credential.", "invalid_credential")
                    return@launch
                }
                val google = GoogleIdTokenCredential.createFrom(credential.data)
                call.resolve(
                    JSObject()
                        .put("idToken", google.idToken)
                        .put("displayName", google.displayName?.toString())
                        .put("photoUrl", google.profilePictureUri?.toString())
                )
            } catch (error: GetCredentialCancellationException) {
                call.reject("Google sign-in was cancelled.", "cancelled", error)
            } catch (error: NoCredentialException) {
                call.reject("No Google credential is available.", "no_credential", error)
            } catch (error: GoogleIdTokenParsingException) {
                call.reject("Google returned a malformed credential.", "invalid_credential", error)
            } catch (error: Exception) {
                call.reject("Google identity is unavailable.", "identity_unavailable", error)
            }
        }
    }

    @PluginMethod
    fun clearCredentialState(call: PluginCall) {
        scope.launch {
            try {
                credentialManager.clearCredentialState(ClearCredentialStateRequest())
                call.resolve()
            } catch (error: Exception) {
                call.reject("Could not clear Google credential state.", "identity_unavailable", error)
            }
        }
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }
}

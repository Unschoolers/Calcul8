# Local OAuth PKCE connection test

This development tool checks the first real Auth0 connection gate in the [OAuth plan](../superpowers/plans/2026-10-22-oauth-public-api.md). It uses Node builtins and the API's existing `jose` dependency. It creates no WhatFees session, local account link, external grant or public API authority. Refresh/revocation, resource-bound access and Free-plan lifecycle compatibility remain separate activation gates.

## Development registration

Tenant issuer: `https://whatfees.ca.auth0.com/`. Public Native client: `iJ91FR4M6AIgD8P68qPQ8Zpo3BgO8Qhe`. The user confirmed saving Native; effective authentication and grants are still checked by the real exchange.

In this development client's Auth0 settings:

- Add exactly `http://127.0.0.1:8787/callback` to Allowed Callback URLs.
- Enable Authorization Code for this connection test; leave other grants, including Refresh Token, disabled for now.
- Token endpoint authentication must be `none`; a hidden field is not evidence of the effective setting.
- Enable a suitable login connection for the test account and save the settings.

This callback is local desktop loopback. It is not an Android redirect or a deployed WhatFees route. Use a browser on the **same desktop** as the command. A phone's `127.0.0.1` points to the phone. Do not open the callback directly or start login before the tool is listening.

## Run

Use Node22 or newer and the branch containing this tool. From the repository root, install existing API dependencies if necessary, then run:

```sh
npm --prefix apps/api ci
node apps/api/scripts/check-external-oauth-login.mjs
```

The tool binds only to `127.0.0.1:8787` and prints an Auth0 authorization URL after the listener is ready. Open that URL in the desktop browser and sign in. A fresh transaction is generated on every invocation. The browser returns to the local listener; no authorization code, password, verifier or token needs to be pasted into a terminal or chat.

The listener validates state and exact issuer, exchanges the single-use code with S256 PKCE and no client secret, then verifies the issuer's RS256 signature, client audience, expiry, fresh issuance and original nonce. Only pinned Auth0 token/JWKS endpoints are contacted. Requests and actual response bodies are bounded; redirects are refused. Tokens are used in memory, without explicit persistence or logs. The fixed success output is:

```json
{"status":"pkce_login_verified","activationReady":false}
```

A successful result proves this connection test, not an API access token, protected data access, account linking, refresh or revocation. The underlying Google account is not inferred to be an existing WhatFees account. No provider access token is sent to WhatFees.

The tool exits after success/failure or a five-minute overall timeout and closes its listener. Ctrl+C aborts the test. It emits a fixed redacted failure message, without callback URLs, provider pages or token claims. `--help` prints usage without opening a port. It accepts no issuer, secret, token or callback overrides; changing the pinned development registration requires a reviewed edit.

## If blocked

A provider Callback URL mismatch page means the exact callback was not accepted; check the saved application and callback. It is not a successful PKCE test. The developer must have port8787 available on loopback. Browser and listener must share a computer. For a redacted failure, use the Auth0 development tenant's own logs locally; do not paste tokens or provider logs containing identity data into an issue.

The earlier anonymous preflight and tenant evidence are recorded in [Auth0 Free evaluation](auth0-free-evaluation.md). The pending lifecycle/security gates remain binding. This CLI is not shipped as an application OAuth route and does not select production clients or resources.

Sources: [Auth0 code+PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce/add-login-using-the-authorization-code-flow-with-pkce), [ID-token validation](https://auth0.com/docs/secure/tokens/id-tokens/validate-id-tokens), [native loopback RFC8252](https://www.rfc-editor.org/rfc/rfc8252#section-7.3).

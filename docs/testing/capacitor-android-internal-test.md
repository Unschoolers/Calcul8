# Capacitor Android internal-testing acceptance

Artifact version: _not yet uploaded_  
Play version code: _not yet uploaded_  
Source revision: _not yet recorded_  
Tester/date: _not yet executed_

This matrix is the device acceptance gate for replacing the Bubblewrap TWA. Automated
tests do not mark these rows as passed.

| Area | Case | Expected result | Status |
|---|---|---|---|
| Install | Install from Play Internal testing | `io.whatfees` opens without a browser toolbar | Not run |
| Startup | Cold and returning start | Shared Vue app loads once and restores safe local state | Not run |
| Offline | Start offline, then reconnect | Local work remains available and sync recovers safely | Not run |
| Identity | Automatic Google credential | Cookie session enters the app without a second login click | Not run |
| Identity | Explicit Google button | One tap completes sign-in | Not run |
| Identity | Profile image | Google image loads or the fallback renders cleanly | Not run |
| Identity | Sign out/account switch | App session and provider credential state clear | Not run |
| Billing | Product query | Active product and localized price display | Not run |
| Billing | Successful licensed purchase | Server verifies the token before access appears | Not run |
| Billing | Cancelled/pending/failed purchase | State remains safe and the message is actionable | Not run |
| Billing | Repeated purchase tap | Only one native purchase flow starts | Not run |
| Billing | Restore after reinstall | Owned purchase restores the server entitlement | Not run |
| Navigation | Back, deep link, external link | Navigation is predictable and external links are safe | Not run |
| Files/media | App-used picker/download/media paths | Required paths work with current permissions | Not run |
| Layout | Phone/tablet, light/dark, rotation | No clipping, unsafe insets, or theme-only colors | Not run |
| Stability | Play pre-launch report | No blocking crash, ANR, login, or billing regression | Not run |

## Acceptance rule

Record the artifact and evidence, then change rows only after observing the result.
Remove legacy TWA rollback inputs only when every required row passes and Google Play
accepts the Capacitor artifact. Any failure blocks production promotion.

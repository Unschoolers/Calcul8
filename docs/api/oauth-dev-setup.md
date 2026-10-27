# External OAuth development setup

Auth0 is the conditional development issuer candidate. No tenant, client, or route is provisioned by this repository. A successful metadata check is **not** authorization readiness: discovery advertises capabilities, not proof that a particular client, resource, token, hook, or lifecycle meets the [P0 contracts](../superpowers/specs/2026-10-25-oauth-p0-contracts.md). No external OAuth routes are enabled by this check.

## Offline metadata check

Obtain the real dev tenant's public OpenID Connect discovery document manually from the provider, verify its provenance, and save it as a local JSON file. Do not put secrets, tokens, or private client credentials in either file. Copy the public configuration below to a local JSON file and replace every placeholder with values established for the actual dev environment. The issuer and JWKS URI must be the exact canonical values; REST and MCP resources must be distinct. The `clientIds` list is the explicit allowlist of external clients. These example hosts and IDs are placeholders, not proposed provider settings.

```json
{
  "issuer": "https://REPLACE-ISSUER.example/",
  "jwksUri": "https://REPLACE-ISSUER.example/REPLACE-JWKS-PATH",
  "resources": {
    "rest": "https://REPLACE-API.example/REPLACE-REST-RESOURCE",
    "mcp": "https://REPLACE-API.example/REPLACE-MCP-RESOURCE"
  },
  "clientIds": ["REPLACE-EXTERNAL-CLIENT-ID"]
}
```

From the repository root, build and run the offline check:

```sh
npm --prefix apps/api run build
node apps/api/scripts/check-external-oauth-provider.mjs --config /path/to/public-config.json --metadata /path/to/discovery.json
```

Both inputs must be regular JSON files of at most 64 KiB. The command makes no network requests. It prints fixed check IDs and booleans only: `metadata_consistent` exits 0, `metadata_incompatible` exits 1, and invocation, configuration, file, JSON, or build errors exit 2 with a fixed error. `activationReady` is always false. Resolve failed checks against the actual issuer documentation and configuration; do not treat extra advertised capabilities as authorization to use them.

## Tenant and client evidence still required

Record the actual tenant/domain, exact issuer and JWKS URI, distinct REST/MCP resource identifiers, external client IDs, feature eligibility, residency, and costs. These values are currently unknown. External clients own their own exact registered redirect URIs. A future WhatFees account-linking client is a separate registration with its own exact callback; it must prove both the existing WhatFees cookie session with CSRF protection and the separately verified issuer subject. Do not infer that subject from email or a Google ID. No linking flow is enabled here.

Before enabling anything, establish and test:

- Authorization code with PKCE S256, exact redirects, state, nonce and issuer binding, single-use transaction and explicit least-privilege consent. See [Auth0's authorization code with PKCE guide](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce).
- The [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068.html) access-token profile and the [Auth0 access-token profiles](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles), including a real RS256 token with the required claims and exact singleton audience. Verify resource and client binding during code and refresh exchanges, including conflicting audience/resource parameters. Evaluate the [resource parameter compatibility profile](https://auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile) for actual clients; availability and compatibility remain unproved.
- A reviewed provider-side hook that alone assigns the trusted `whatfees_grant_id` for each local consent generation. Prove durable grant and account lifecycle, revocation, erasure and authoritative read consistency. The discovery document cannot establish these properties.
- Actual callback and code replay rejection, refresh rotation and reuse detection including concurrency, key rotation, provider outage, revocation and logout. See [Auth0 refresh token rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation). Metadata consistency cannot substitute for these end-to-end tests.
- Resource scope boundaries, protected-resource discovery, real REST/MCP interoperability, security review, operational rollback and explicit release authorization, as specified in P0.

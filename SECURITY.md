# Security Notes

This is a public repository. Treat all committed data as public forever.

## Do not commit

- Keystores or signing keys (`*.jks`, `*.keystore`, `*.pem`, `*.p12`, `*.key`)
- Credentials (`.env`, `service-account*.json`, `play-credentials.json`)
- API secrets, tokens, private keys

## Mandatory checks before push

Run:

```bash
npm run security:scan
```

Then run full verification:

```bash
npm run verify
```

## Android / Play signing

- Keep upload keystore offline (password manager + secure backup).
- Never store key passwords in source files.
- If a key leaks, rotate immediately and regenerate trust files as needed.

## Digital Asset Links

`public/.well-known/assetlinks.json` is public by design.  
It should contain:

- Android package name
- SHA-256 certificate fingerprint

No private key material should ever appear in this file.

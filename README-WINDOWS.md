# InspectIQ Windows build and licensing

The existing Android project is retained. The new Windows desktop packaging lives in `desktop/`; the licensing API and admin console live in `licensing/`.

## Windows installer
GitHub Actions workflow **Build InspectIQ Windows Installer** runs on pushes to the Windows development branch and can be started manually. It packages the current inspection interface and uploads an NSIS `.exe` installer as an artifact.

## Licensing service deployment
1. Create a Cloudflare account and create a D1 database named `inspectiq-licenses`.
2. Apply `licensing/schema.sql` to the database.
3. Put the actual database ID in `licensing/wrangler.toml`.
4. Generate an Ed25519 key pair. Keep the private key outside GitHub and set it as the Cloudflare Worker secret named `SIGNING_PRIVATE_KEY` (PEM PKCS#8).
5. Set a long random `ADMIN_TOKEN` secret in the Worker.
6. From the `licensing/` directory, deploy with Wrangler. Confirm `GET /health` returns ok.
7. Copy the Worker URL into `desktop/license-config.json`.
8. The public key corresponding to the private key must replace `PUBLIC_KEY_PEM` in `desktop/main.cjs`, then rebuild the installer.

## Admin
Open `licensing/admin.html` in a browser, enter the Worker URL and admin token, create customer accounts and issue 1-, 2-, 3- or 5-year licenses. The desktop login form also supports self-service 7-day trial registration.

## Current release status
This is the first Windows/licensing implementation scaffold. It is not production-ready until the Worker is deployed, the signing-key pair is configured on both sides, the API URL is set, and end-to-end activation/offline/expiry/device-lock tests pass. Do not sell or distribute it as a finished commercial release before those checks.

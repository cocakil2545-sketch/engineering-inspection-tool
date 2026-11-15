# InspectIQ Windows desktop

This folder packages the existing PDF inspection interface as a native Windows desktop application.

## Build locally
1. Install Node.js 20 LTS or newer on Windows.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start` for development.
5. Run `npm run dist:win` to create the Windows NSIS installer in `dist/`.

The GitHub Actions workflow also builds the installer and publishes it as a workflow artifact.

## Licensing configuration
Edit `license-config.json` and replace the placeholder with the deployed Cloudflare Worker URL. The desktop app requires internet for first activation and renewal. It stores a Windows-encrypted, Ed25519-signed activation certificate and verifies it locally on every launch, so drawing inspection works offline until the certificate expiry.

The embedded public key in `main.cjs` must match the private signing key configured as the Cloudflare Worker secret `SIGNING_PRIVATE_KEY`. Never put the private key in this repository.

## Device rule
The server binds each license to a SHA-256 fingerprint derived from the Windows machine identifier. Reinstalling Windows or changing the motherboard can change the fingerprint; an administrator can release the previous activation before moving a license.

## Important
The licensing service must be deployed and its signing key configured before commercial activation can work. Do not distribute a production installer while the API URL is still the placeholder.

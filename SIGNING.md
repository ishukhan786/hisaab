# Hisaab Windows signing

Signing setup is prepared for Ishtiaq Uddin. No public certificate has been
issued or installed, and the existing 1.4.3 installers remain unsigned.

## Obtain and activate a certificate

Azure Artifact Signing currently supports individual public-trust applicants
only in the USA and Canada, so it is not an option for UAE/Pakistan residence.
Certum Standard Code Signing offers individual certificates. Before paying,
confirm with the provider that it accepts your actual country of residence and
identity/address documents. Do not select a country simply to bypass eligibility.

Use your legal name exactly as shown on your ID. Complete payment and identity
verification directly on the provider's site; do not put ID scans, passwords,
OTP codes or private keys into this repository or chat. The provider may require
an identity document and a utility bill in your name. Issuance is its decision.

For Certum cloud signing, activate SimplySign and its Windows desktop client;
log in when signing so its certificate/private-key provider is available in the
Windows certificate store. A hardware certificate requires its token and driver.
The private key stays with the signing provider/token.

## Build after activation

Run `npm run signing:check` to check for a current certificate with a private key
and the exact publisher name `Ishtiaq Uddin`.

Run `npm run dist:signed` to build. If the issued name differs or there are multiple
certificates, use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-signed.ps1 -Publisher "Exact issued name" -Thumbprint "CERTIFICATE_THUMBPRINT"
```

The commands allow this local build script for that PowerShell process only;
they do not change the computer's saved execution policy.
The signed build uses SHA-256 and an RFC3161 timestamp, requires signing to
succeed, and writes separately to `dist/signed`. It then verifies Windows trust,
the selected signer and a timestamp on the packaged app, installer and portable
executable. Do not distribute output from a failed build or verification.
`signing:check` checks certificate availability only; successful signing and
trust validation still require the actual signed build.

Regular `npm run dist` remains available for ordinary local builds. No certificate
is generated or added to a trusted root store by these scripts. Signing does not
guarantee immediate SmartScreen reputation or remove Windows elevation prompts.

## Provider question (ready to send yourself)

I am Ishtiaq Uddin, an individual developer making a Windows Electron app for
personal use. I have connections to the UAE and Pakistan and will apply using
my actual current residential address and matching documents. Do you issue a
publicly trusted Standard Code Signing cloud certificate to individuals resident
in these countries? Please confirm accepted ID/address documents, the exact
publisher name format, the total certificate and cloud-signing cost including
renewals, and compatibility with Windows SignTool through SimplySign Desktop.

## References checked 2026-10-19

- https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
- https://support.certum.eu/en/code-signing-required-documents/
- https://support.certum.eu/en/how-to-activate-code-signing-simplysign/
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation

param(
    [string]$Publisher = 'Ishtiaq Uddin',
    [string]$Thumbprint = '',
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$projectRoot = Split-Path $PSScriptRoot -Parent
$now = Get-Date
$availableCertificates = @(Get-ChildItem Cert:\CurrentUser\My) +
    @(Get-ChildItem Cert:\LocalMachine\My)
$certificates = @($availableCertificates |
    Where-Object {
        ($_.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3') -and
        $_.HasPrivateKey -and $_.NotBefore -le $now -and $_.NotAfter -gt $now -and
        $_.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -ceq $Publisher -and
        (!$Thumbprint -or $_.Thumbprint -eq ($Thumbprint -replace '\s', ''))
    } | Sort-Object Thumbprint -Unique)
if ($certificates.Count -ne 1) {
    throw "Expected one valid code-signing certificate for '$Publisher'; found $($certificates.Count). Activate your provider's signing client/token first. If multiple certificates exist, supply -Thumbprint. No installer was built."
}
$certificate = $certificates[0]
if ($certificate.Subject -eq $certificate.Issuer) { throw 'A self-signed certificate cannot be used for this public signing build.' }
Write-Host "Signing certificate found for $Publisher; expires $($certificate.NotAfter)."
if ($CheckOnly) { return }
$oldThumbprint = $env:HISAAB_SIGNING_THUMBPRINT
$oldPublisher = $env:HISAAB_SIGNING_PUBLISHER
Push-Location $projectRoot
try {
    $env:HISAAB_SIGNING_THUMBPRINT = $certificate.Thumbprint
    $env:HISAAB_SIGNING_PUBLISHER = $Publisher
    & node node_modules/electron-builder/cli.js --config electron-builder.signed.cjs --win --publish never
    if ($LASTEXITCODE -ne 0) { throw 'Signed build failed. Do not distribute its output.' }
    $package = Get-Content package.json -Raw | ConvertFrom-Json
    $artifacts = @(
        "dist/signed/Hisaab-Setup-$($package.version).exe",
        "dist/signed/Hisaab-Portable-$($package.version).exe",
        "dist/signed/win-unpacked/$($package.build.productName).exe"
    )
    foreach ($artifact in $artifacts) {
        $signature = Get-AuthenticodeSignature -LiteralPath $artifact
        if ($signature.Status -ne 'Valid' -or
            $signature.SignerCertificate.Thumbprint -ne $certificate.Thumbprint -or
            !$signature.TimeStamperCertificate) {
            throw "Signature, signer or timestamp verification failed: $artifact. Do not distribute this build."
        }
        Write-Host "Verified signed and timestamped: $artifact"
    }
} finally {
    $env:HISAAB_SIGNING_THUMBPRINT = $oldThumbprint
    $env:HISAAB_SIGNING_PUBLISHER = $oldPublisher
    Pop-Location
}

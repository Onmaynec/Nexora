param(
  [Parameter(Mandatory = $true)][string[]]$Path,
  [Parameter(Mandatory = $true)][string]$ExpectedSubject,
  [Parameter(Mandatory = $true)][string]$ExpectedThumbprint
)

$ErrorActionPreference = "Stop"
$normalizedThumbprint = ($ExpectedThumbprint -replace '\s+', '').ToUpperInvariant()
if ($normalizedThumbprint -notmatch '^[A-F0-9]{40}$') {
  throw "Expected thumbprint must contain exactly 40 hexadecimal characters."
}

$results = @()
foreach ($item in $Path) {
  if (-not (Test-Path -LiteralPath $item -PathType Leaf)) {
    throw "Signed artifact is missing: $item"
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $item
  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    throw "Authenticode verification failed for $item: $($signature.Status) $($signature.StatusMessage)"
  }
  if (-not $signature.SignerCertificate) {
    throw "Signer certificate is missing for $item"
  }
  if ($signature.SignerCertificate.Subject -notlike "*$ExpectedSubject*") {
    throw "Unexpected certificate subject for $item"
  }
  if (($signature.SignerCertificate.Thumbprint -replace '\s+', '').ToUpperInvariant() -ne $normalizedThumbprint) {
    throw "Unexpected certificate thumbprint for $item"
  }
  if (-not $signature.TimeStamperCertificate) {
    throw "RFC3161/Authenticode timestamp is missing for $item"
  }
  $results += [PSCustomObject]@{
    Path = (Resolve-Path -LiteralPath $item).Path
    Status = $signature.Status.ToString()
    Subject = $signature.SignerCertificate.Subject
    Thumbprint = $signature.SignerCertificate.Thumbprint
    TimestampSubject = $signature.TimeStamperCertificate.Subject
    TimestampNotBefore = $signature.TimeStamperCertificate.NotBefore.ToUniversalTime().ToString('o')
    TimestampNotAfter = $signature.TimeStamperCertificate.NotAfter.ToUniversalTime().ToString('o')
  }
}

$results | ConvertTo-Json -Depth 4

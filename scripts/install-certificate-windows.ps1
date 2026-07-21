param(
  [Parameter(Mandatory = $true)]
  [string]$CertificatePath
)

$ErrorActionPreference = "Stop"
$resolved = Resolve-Path -LiteralPath $CertificatePath

if ([System.IO.Path]::GetExtension($resolved.Path) -notin ".crt", ".cer") {
  throw "Ожидался сертификат .crt или .cer."
}

Write-Host "Будет установлен корневой сертификат Nexora:" -ForegroundColor Magenta
Write-Host $resolved.Path
Write-Host "Устанавливайте его только если получили непосредственно от владельца Nexora Server." -ForegroundColor Yellow

$answer = Read-Host "Продолжить? (yes/no)"
if ($answer -ne "yes") {
  Write-Host "Отменено."
  exit 0
}

Import-Certificate -FilePath $resolved.Path -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
Write-Host "Сертификат установлен для текущего пользователя Windows." -ForegroundColor Green

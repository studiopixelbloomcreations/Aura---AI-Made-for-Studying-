$ErrorActionPreference = "Stop"

$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "AuraAICloudSyncMonitor.cmd"

if (Test-Path $launcherPath) {
  Remove-Item -Path $launcherPath -Force
  Write-Host "Removed startup launcher:"
  Write-Host $launcherPath
} else {
  Write-Host "Startup launcher not found:"
  Write-Host $launcherPath
}

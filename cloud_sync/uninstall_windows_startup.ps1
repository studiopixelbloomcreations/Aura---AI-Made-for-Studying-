$ErrorActionPreference = "Stop"
$taskName = "AevraCloudRepoMonitor"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Write-Host "Removed startup task: $taskName"

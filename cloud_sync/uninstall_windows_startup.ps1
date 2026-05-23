$ErrorActionPreference = "Stop"
$taskName = "AuraAICloudRepoMonitor"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Write-Host "Removed startup task: $taskName"

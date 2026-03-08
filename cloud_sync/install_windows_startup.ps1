$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$taskName = "TutorCloudRepoMonitor"
$nodeCmd = "node"
$scriptPath = Join-Path $repoRoot "cloud_sync\run_monitor.js"
$workDir = $repoRoot

$action = New-ScheduledTaskAction -Execute $nodeCmd -Argument "`"$scriptPath`"" -WorkingDirectory $workDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

try {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Continuously sync local repo from cloud changes for Tutor." | Out-Null
Write-Host "Installed startup task: $taskName"

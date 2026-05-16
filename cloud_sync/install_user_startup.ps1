$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$startupDir = [Environment]::GetFolderPath("Startup")
$launcherPath = Join-Path $startupDir "AevraAICloudSyncMonitor.cmd"
$runnerPath = Join-Path $repoRoot "cloud_sync\run_monitor.js"

$cmd = @"
@echo off
cd /d "$repoRoot"
node "$runnerPath"
"@

Set-Content -Path $launcherPath -Value $cmd -Encoding ASCII -Force
Write-Host "Installed startup launcher:"
Write-Host $launcherPath

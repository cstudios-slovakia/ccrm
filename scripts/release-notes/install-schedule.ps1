<#
.SYNOPSIS
  Registers (or removes) the Windows scheduled task that runs the release-notes
  pipeline twice a day on this PC.

.EXAMPLE
  pwsh -File scripts\release-notes\install-schedule.ps1                    # 09:00 and 15:00
  pwsh -File scripts\release-notes\install-schedule.ps1 -At 08:30,14:00
  pwsh -File scripts\release-notes\install-schedule.ps1 -Uninstall
  Start-ScheduledTask -TaskName 'CCRM Release Notes'                        # run it now

.NOTES
  The task runs as you, only while you are logged on (it needs your Claude Code
  login), and catches up on a missed time at the next logon. Re-run this script
  after pulling changes to run.ps1 — it copies the runner to .release-notes\.
#>
param(
    [string[]]$At = @('09:00', '15:00'),
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$TaskName = 'CCRM Release Notes'

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'."
    return
}

$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$HomeDir = Join-Path $Repo '.release-notes'
New-Item -ItemType Directory -Force $HomeDir | Out-Null

# The runner lives outside the working tree, so a branch switch cannot remove it.
Copy-Item (Join-Path $PSScriptRoot 'run.ps1') (Join-Path $HomeDir 'run.ps1') -Force
$envFile = Join-Path $HomeDir '.env'
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $PSScriptRoot 'release-notes.env.example') $envFile
    Write-Host "Created $envFile — put the Craft token in it before the first run."
}

$shell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $shell) { $shell = (Get-Command powershell).Source }

$action = New-ScheduledTaskAction -Execute $shell -WorkingDirectory $Repo `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$HomeDir\run.ps1`" -Repo `"$Repo`""
$triggers = $At | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal `
    -Description 'Checks origin/main for a new CCRM version and publishes the release article to Craft CMS. docs/RELEASE-NOTES.md' -Force | Out-Null

Write-Host "Scheduled '$TaskName' daily at $($At -join ' and '). Logs: $HomeDir\logs"

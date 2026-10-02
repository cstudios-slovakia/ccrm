<#
.SYNOPSIS
  One scheduled run of the CCRM release-notes pipeline (docs/RELEASE-NOTES.md).

.DESCRIPTION
  1. fetch origin/main into a dedicated, detached worktree (.claude/worktrees/release-notes)
     — your own checkout and branch are never touched
  2. detect.mjs: has main reached a new version since the last handled release?
     Nothing new → exit, no AI involved.
  3. claude -p with the ccrm-release-notes skill: classify, screenshot, write the article
  4. validate.mjs: the gate
  5. publish.mjs: upload screenshots and the entry to Craft (live, or draft per .env)
  6. finish.mjs: move the baseline, or count the failure

  install-schedule.ps1 copies this file to .release-notes\run.ps1 and runs it from
  there, so switching branches in the main checkout cannot break the schedule.

.EXAMPLE
  pwsh -File .release-notes\run.ps1 -Repo C:\path\to\ccrm            # what the schedule runs
  pwsh -File scripts\release-notes\run.ps1 -DryRun                     # everything except the upload
#>
param(
    [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [switch]$DryRun,
    [switch]$Force
)

# Native tools write progress to stderr; Windows PowerShell would turn that into
# terminating errors under 'Stop'. Exit codes are checked explicitly instead.
$ErrorActionPreference = 'Continue'

$HomeDir = Join-Path $Repo '.release-notes'
$Worktree = Join-Path $Repo '.claude\worktrees\release-notes'
New-Item -ItemType Directory -Force (Join-Path $HomeDir 'logs') | Out-Null
$LogFile = Join-Path $HomeDir ('logs\' + (Get-Date -Format 'yyyy-MM-dd') + '.log')

function Log([string]$Message) {
    $line = '{0} {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line -Encoding utf8
    Write-Host $line
}

function Invoke-Logged([string]$Exe, [string[]]$Arguments) {
    & $Exe @Arguments 2>&1 | ForEach-Object { Log "  $_" }
    return $LASTEXITCODE
}

function Notify([string]$Text) {
    # Optional desktop toast: Install-Module BurntToast -Scope CurrentUser
    if (Get-Module -ListAvailable -Name BurntToast) {
        Import-Module BurntToast
        New-BurntToastNotification -Text 'CCRM novinky', $Text | Out-Null
    }
}

# .release-notes\.env → environment (only what is not already set).
$EnvFile = Join-Path $HomeDir '.env'
if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$' -and -not $line.TrimStart().StartsWith('#')) {
            if (-not [Environment]::GetEnvironmentVariable($Matches[1])) {
                [Environment]::SetEnvironmentVariable($Matches[1], ($Matches[2] -replace '^([''"])(.*)\1$', '$2'))
            }
        }
    }
}
$env:RELEASE_NOTES_HOME = $HomeDir

# One run at a time: a long article run must not be joined by the next trigger.
$LockFile = Join-Path $HomeDir 'run.lock'
if (Test-Path $LockFile) {
    $otherPid = Get-Content $LockFile -ErrorAction SilentlyContinue
    if ($otherPid -and (Get-Process -Id $otherPid -ErrorAction SilentlyContinue)) {
        Log "Another run (PID $otherPid) is still going. Skipping."
        exit 0
    }
}
Set-Content -Path $LockFile -Value $PID

function Invoke-ReleaseNotesRun {
    $RunDir = $null
    Log "=== release-notes run (repo $Repo$(if ($DryRun) { ', DRY RUN' })) ==="

    # 1. origin/main in its own worktree --------------------------------------
    if ((Invoke-Logged git @('-C', $Repo, 'fetch', 'origin', 'main', '--quiet')) -ne 0) { Log 'FAILED: git fetch failed'; return 1 }
    if (-not (Test-Path (Join-Path $Worktree '.git'))) {
        if ((Invoke-Logged git @('-C', $Repo, 'worktree', 'add', '--quiet', '--detach', $Worktree, 'origin/main')) -ne 0) { Log 'FAILED: git worktree add failed'; return 1 }
    } else {
        if ((Invoke-Logged git @('-C', $Worktree, 'checkout', '--quiet', '--detach', '--force', 'origin/main')) -ne 0) { Log 'FAILED: git checkout failed'; return 1 }
        Invoke-Logged git @('-C', $Worktree, 'clean', '-fdq') | Out-Null
    }
    $head = (git -C $Worktree rev-parse --short HEAD)
    Log "main is at $head"

    if (-not (Test-Path (Join-Path $Worktree 'scripts\release-notes\detect.mjs'))) {
        Log 'The release-notes tooling is not on main yet — nothing to do until it is merged.'
        return 0
    }

    # Dependencies, only when the lockfile changed.
    $lockHash = (Get-FileHash (Join-Path $Worktree 'package-lock.json')).Hash
    $hashFile = Join-Path $HomeDir 'npm-lock.hash'
    if (-not (Test-Path (Join-Path $Worktree 'node_modules')) -or (Get-Content $hashFile -ErrorAction SilentlyContinue) -ne $lockHash) {
        Log 'Installing dependencies (npm ci)…'
        Push-Location $Worktree
        $code = Invoke-Logged npm @('ci', '--no-audit', '--no-fund')
        Pop-Location
        if ($code -ne 0) { Log 'FAILED: npm ci failed'; return 1 }
        Set-Content -Path $hashFile -Value $lockHash
    }

    Push-Location $Worktree
    try {
        # 2. detect ------------------------------------------------------------
        $detectArgs = @('scripts/release-notes/detect.mjs')
        if ($Force) { $detectArgs += '--force' }
        $code = Invoke-Logged node $detectArgs
        if ($code -eq 0) { return 0 }
        if ($code -ne 10) { Notify "Release notes need attention (detect exit $code). See .release-notes\logs."; return $code }
        $RunDir = (Get-Content (Join-Path $HomeDir 'current-run.txt')).Trim()
        Log "Run directory: $RunDir"

        # 3. the agent ---------------------------------------------------------
        $claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
        if (-not $claude) { $claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe' }
        $prompt = @"
Unattended release-notes run. Read .agents/skills/ccrm-release-notes/SKILL.md first and follow it exactly.
RUN_DIR=$RunDir
Begin with $RunDir/context.md. You are done only when ``node scripts/release-notes/validate.mjs $RunDir`` prints "Valid." and $RunDir/report.md exists.
"@
        $claudeArgs = @(
            '-p', $prompt,
            '--permission-mode', 'dontAsk',
            '--add-dir', $HomeDir,
            '--allowedTools',
            'Read', 'Write', 'Edit', 'Glob', 'Grep',
            'Bash(git log *)', 'Bash(git show *)', 'Bash(git diff *)', 'Bash(git rev-parse *)', 'Bash(ls *)',
            'Bash(node scripts/release-notes/shoot.mjs *)', 'Bash(node scripts/release-notes/validate.mjs *)'
        )
        if ($env:RELEASE_NOTES_MODEL) { $claudeArgs += @('--model', $env:RELEASE_NOTES_MODEL) }
        Log 'Starting the release-notes agent (output: claude.log in the run directory)…'
        & $claude @claudeArgs *> (Join-Path $RunDir 'claude.log')
        Log "Agent finished with exit code $LASTEXITCODE."

        # 4. gate --------------------------------------------------------------
        $validation = & node scripts/release-notes/validate.mjs $RunDir 2>&1
        $validCode = $LASTEXITCODE
        $validation | ForEach-Object { Log "  $_" }
        if ($validCode -ne 0) {
            Invoke-Logged node @('scripts/release-notes/finish.mjs', $RunDir, '--outcome', 'failed', '--note', 'validation failed') | Out-Null
            Notify "Article for $(Split-Path $RunDir -Leaf) failed validation — see report in .release-notes\runs."
            return 1
        }
        if ($validation -match 'DECISION=skip') {
            Invoke-Logged node @('scripts/release-notes/finish.mjs', $RunDir, '--outcome', 'skipped') | Out-Null
            Log 'Nothing user-visible in this release — no article.'
            return 0
        }

        # 5. publish -----------------------------------------------------------
        $publishArgs = @('scripts/release-notes/publish.mjs', $RunDir)
        if ($DryRun) { $publishArgs += '--dry-run' }
        if ((Invoke-Logged node $publishArgs) -ne 0) {
            Invoke-Logged node @('scripts/release-notes/finish.mjs', $RunDir, '--outcome', 'failed', '--note', 'publish failed') | Out-Null
            Notify 'Publishing the article to Craft failed — see .release-notes\logs.'
            return 1
        }
        if ($DryRun) {
            Log 'Dry run: nothing uploaded, baseline unchanged.'
            return 0
        }

        # 6. done --------------------------------------------------------------
        Invoke-Logged node @('scripts/release-notes/finish.mjs', $RunDir, '--outcome', 'published') | Out-Null
        Notify "Published: $(Split-Path $RunDir -Leaf)"
    } finally {
        Pop-Location
    }
    return 0
}

$exitCode = 1
try {
    $exitCode = Invoke-ReleaseNotesRun
} catch {
    Log "FAILED: $_"
    Notify "Release-notes run failed: $_"
} finally {
    Remove-Item $LockFile -ErrorAction SilentlyContinue
    Log '=== end ==='
}
exit $exitCode

#Requires -Version 5.1
<#
  나라장터 알림: 작업 스케줄러가 "매일 15:00" 이 스크립트를 호출하고,
  마지막 성공 실행으로부터 3일이 지난 경우에만 pnpm run g2b:watch 를 실행합니다.
  직전 실행이 실패한 경우에는 간격과 관계없이 다음 날(다음 호출)에 재시도합니다.

  등록: scripts/Register-G2bWatchScheduledTask.ps1 (관리자 권한이 필요할 수 있음)

  상태: scripts/.g2b-watch-schedule-marker.json (git 제외)
  Node 20.6+ 이면 루트 .env 를 NODE_OPTIONS --env-file 로 로드 시도
#>
$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$StatePath = Join-Path $ScriptDir ".g2b-watch-schedule-marker.json"
$IntervalDays = 3

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath)) { return $null }
  try {
    return Get-Content -LiteralPath $StatePath -Raw -Encoding utf8 | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Write-State($obj) {
  $obj | ConvertTo-Json -Compress | Set-Content -LiteralPath $StatePath -Encoding utf8 -NoNewline
}

function Test-ShouldRun {
  $s = Read-State
  if (-not $s) { return $true }
  $lastExit = if ($null -eq $s.lastExitCode) { 0 } else { [int]$s.lastExitCode }
  if ($lastExit -ne 0) { return $true }

  $ls = $s.lastSuccess
  if (-not $ls) { return $true }
  try {
    $lastSuccess = [DateTimeOffset]::Parse([string]$ls, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
  } catch {
    return $true
  }
  $elapsed = [DateTimeOffset]::Now - $lastSuccess
  return $elapsed.TotalDays -ge $IntervalDays
}

$prev = Read-State
$lastSuccessStr = $null
if ($prev -and $null -ne $prev.lastSuccess) { $lastSuccessStr = [string]$prev.lastSuccess }

if (-not (Test-ShouldRun)) {
  exit 0
}

Set-Location -LiteralPath $RepoRoot

$envFile = Join-Path $RepoRoot ".env"
if (Test-Path -LiteralPath $envFile) {
  $env:NODE_OPTIONS = "--env-file=$envFile"
}

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
  Write-Error "pnpm 이 PATH 에 없습니다. Node/pnpm 설치 후 다시 시도하세요."
  $attempt = [DateTimeOffset]::Now.ToString("o")
  Write-State @{ lastSuccess = $lastSuccessStr; lastAttempt = $attempt; lastExitCode = 127 }
  exit 127
}

& pnpm run g2b:watch
$code = $LASTEXITCODE
$attempt = [DateTimeOffset]::Now.ToString("o")

if ($code -eq 0) {
  Write-State @{ lastSuccess = $attempt; lastAttempt = $attempt; lastExitCode = 0 }
  exit 0
}

Write-State @{ lastSuccess = $lastSuccessStr; lastAttempt = $attempt; lastExitCode = $code }
exit $code

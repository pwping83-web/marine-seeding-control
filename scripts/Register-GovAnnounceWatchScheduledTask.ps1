#Requires -Version 5.1
<#
  Windows 작업 스케줄러: 매일 아침 공고 모니터 스크립트 실행 (신규만).
  웹훅/ntfy는 시스템 환경 변수 또는 .env 를 Node에서 읽도록 별도 설정하세요.

  제거: Unregister-ScheduledTask -TaskName "MarineSeedingControl-GovAnnounceWatch" -Confirm:$false
#>
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$NodeScript = Join-Path $RepoRoot "scripts\gov-announce-watch.mjs"
if (-not (Test-Path -LiteralPath $NodeScript)) {
  Write-Error "스크립트 없음: $NodeScript"
  exit 1
}

$TaskName = "MarineSeedingControl-GovAnnounceWatch"
$Arg = "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location -LiteralPath '$RepoRoot'; node scripts/gov-announce-watch.mjs --new-only`""
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arg
$Trigger = New-ScheduledTaskTrigger -Daily -At "8:30AM"
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$userId = if ($env:USERDOMAIN -and $env:USERNAME) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
$Principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Description "해상종자살포: K-Startup·NGII·KIMST·해수부·국해원 공고 — 신규만 (GOV_ANNOUNCE_NOTIFY_WEBHOOK_URL 등 설정)"

Write-Host "등록 완료: '$TaskName' — 매일 08:30, 저장소: $RepoRoot"
Write-Host "알림을 쓰려면 사용자/시스템 환경 변수에 GOV_ANNOUNCE_NOTIFY_WEBHOOK_URL 또는 GOV_ANNOUNCE_NTFY_TOPIC 을 설정하세요."

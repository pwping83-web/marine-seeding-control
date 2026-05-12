#Requires -Version 5.1
<#
  Windows 작업 스케줄러: 매주 월요일 09:00 성장 어드바이저 (질문 MD + 선택적 grant:watch)
  질문만: 노드 인자 없음
  실행 포함: 환경 변수 GROWTH_ADVISOR_EXECUTE=1 설정 후 동일 스크립트 재등록

  제거: Unregister-ScheduledTask -TaskName "MarineSeedingControl-GrowthAdvisor" -Confirm:$false
#>
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$RunScript = Join-Path $RepoRoot "scripts\growth-advisor\run.mjs"
if (-not (Test-Path -LiteralPath $RunScript)) {
  Write-Error "스크립트 없음: $RunScript"
  exit 1
}

$TaskName = "MarineSeedingControl-GrowthAdvisor"
$doExecute = $env:GROWTH_ADVISOR_EXECUTE -eq "1"
$extra = if ($doExecute) { " --execute" } else { "" }
$Arg = "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location -LiteralPath '$RepoRoot'; node scripts/growth-advisor/run.mjs$extra`""
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arg
$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "9:00AM"
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
  -Description "해상종자살포: 성장·IP·지원사업 점검 MD 생성$(if ($doExecute) { ' + grant:watch 등' } else { '' })"

Write-Host "등록 완료: '$TaskName' — 매주 월요일 09:00, 저장소: $RepoRoot"
if (-not $doExecute) {
  Write-Host "팁: grant:watch까지 자동 실행하려면 GROWTH_ADVISOR_EXECUTE=1 로 이 스크립트를 다시 실행하세요."
}

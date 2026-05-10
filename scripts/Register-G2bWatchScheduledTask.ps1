#Requires -Version 5.1
<#
  Windows 작업 스케줄러에 "매일 15:00" 실행 작업을 등록합니다.
  실제 나라장터 조회는 g2b-watch-scheduled-wrapper.ps1 이 3일 간격으로만 수행합니다.

  관리자 권한이 필요할 수 있습니다. 실패 시 "작업 스케줄러"에서 수동으로 동일 설정을 추가하세요.

  제거: Unregister-ScheduledTask -TaskName "MarineSeedingControl-G2B-BidWatch" -Confirm:$false
#>
$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$Wrapper = Join-Path $ScriptDir "g2b-watch-scheduled-wrapper.ps1"
if (-not (Test-Path -LiteralPath $Wrapper)) {
  Write-Error "래퍼 스크립트를 찾을 수 없습니다: $Wrapper"
  exit 1
}

$TaskName = "MarineSeedingControl-G2B-BidWatch"
$Arg = "-NoProfile -ExecutionPolicy Bypass -File `"$Wrapper`""
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arg
$Trigger = New-ScheduledTaskTrigger -Daily -At "3:00PM"
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
  -Description "해상종자살포: 나라장터 g2b:watch — 매일 15시 호출, 3일마다만 실제 조회"

Write-Host "등록 완료: 작업 이름 '$TaskName' — 매일 오후 3시에 래퍼 실행(내부에서 3일 간격)."
Write-Host "작업 스케줄러(taskschd.msc)에서 '마지막 실행 결과'를 확인하세요."

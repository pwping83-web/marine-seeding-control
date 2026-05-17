param([string]$Text)

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

foreach ($v in $synth.GetInstalledVoices()) {
    if ($v.VoiceInfo.Culture.Name -eq "ko-KR") {
        $synth.SelectVoice($v.VoiceInfo.Name)
        break
    }
}

if (-not $Text -or -not $Text.Trim()) {
    $Text = Get-Clipboard -Raw
}

$Text = ($Text -replace "\s+", " ").Trim()
if (-not $Text) {
    Write-Error "No text. Select lines, Ctrl+C, then run again."
    exit 1
}

Write-Host "Speaking..."
$synth.Speak($Text)
Write-Host "Done."

# Generates voice-command WAV fixtures (16 kHz, 16-bit, mono) with Windows' built-in voices, for
# the end-to-end latency bench in src-tauri/src/voice/mod.rs (voice::bench).
#
#   powershell -ExecutionPolicy Bypass -File scripts\voice\make-fixtures.ps1 -Out C:\temp\lens-voice-fixtures
#
# Each file is named "<expected command id>--<slug>.wav".
param([string]$Out = "$env:TEMP\lens-voice-fixtures")

Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$phrases = @(
  @("window_action", "Lens, minimise this"),
  @("window_action", "Pin this on top"),
  @("snap_window", "Snap left"),
  @("move_window", "Move this to the next monitor"),
  @("show_desktop", "Show desktop"),
  @("open_app", "Open Notepad"),
  @("switch_app", "Switch to Chrome"),
  @("switch_workspace", "Workspace two"),
  @("open_overview", "Show all windows"),
  @("set_color_mode", "Dark mode"),
  @("set_theme_pack", "Theme Tokyo Night"),
  @("set_accent", "Accent purple"),
  @("set_dock_style", "Make the dock slim"),
  @("set_volume", "Volume thirty percent"),
  @("set_mute", "Mute"),
  @("set_dnd", "Do not disturb"),
  @("start_timer", "Timer for five minutes"),
  @("shelf_add", "Add this to the shelf"),
  @("summarize", "Summarise this page"),
  @("undo", "Undo"),
  @("confirm", "Yes"),
  @("help", "What can I say")
)

$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$voices = (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
foreach ($v in $voices) {
  foreach ($p in $phrases) {
    $slug = ($p[1].ToLower() -replace "[^a-z0-9]+", "-").Trim("-")
    $vs = ($v -replace "[^A-Za-z0-9]+", "")
    $file = Join-Path $Out ("{0}--{1}-{2}.wav" -f $p[0], $slug, $vs)
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $s.SelectVoice($v)
    $s.SetOutputToWaveFile($file, $fmt)
    $s.Speak($p[1])
    $s.Dispose()
  }
}
Write-Host "Wrote $((Get-ChildItem $Out -Filter *.wav).Count) fixtures to $Out"

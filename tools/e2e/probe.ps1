# Windows state probe for the end-to-end tests (docs/TESTING.md › End-to-end).
#
#   pwsh tools/e2e/probe.ps1 snapshot <file.json>   # before Lens starts
#   pwsh tools/e2e/probe.ps1 compare  <file.json>   # after Lens quit: fails on anything not restored
#
# Checks what AGENTS.md promises Lens puts back on exit: the Windows taskbar is visible again, the
# taskbar / Explorer / pointer / mouse settings Lens may change are back to their old values, and no
# Lens process or window is left behind. HKCU\...\Run is reported but not compared: "Start with
# Windows" is a setting the user keeps, not a temporary change.
param(
  [Parameter(Mandatory)][ValidateSet("snapshot", "compare")][string]$Mode,
  [Parameter(Mandatory)][string]$File
)
$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class LensProbe {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@

$Keys = @(
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3",
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced",
  "HKCU:\Software\Microsoft\Windows\DWM",
  "HKCU:\Control Panel\Cursors",
  "HKCU:\Control Panel\Mouse",
  "HKCU:\Control Panel\Desktop",
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
)
# Values Windows itself rewrites while the desktop runs; not Lens's doing.
$Volatile = @("WallpaperOriginX", "WallpaperOriginY", "TranscodedImageCache", "TranscodedImageCount", "LastUpdated", "ColorizationAfterglowBalance", "ColorizationBlurBalance")

function Read-Keys {
  $out = [ordered]@{}
  foreach ($k in $Keys) {
    if (-not (Test-Path $k)) { $out[$k] = $null; continue }
    $props = Get-ItemProperty -Path $k
    $vals = [ordered]@{}
    foreach ($p in $props.PSObject.Properties) {
      if ($p.Name -like "PS*" -or $Volatile -contains $p.Name) { continue }
      $v = $p.Value
      if ($v -is [byte[]]) { $v = [Convert]::ToBase64String($v) }
      elseif ($v -is [array]) { $v = ($v -join "|") }
      $vals[$p.Name] = "$v"
    }
    $out[$k] = $vals
  }
  $out
}

function Lens-Windows {
  $pids = @(Get-Process lens-ui -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  $found = New-Object System.Collections.ArrayList
  if ($pids.Count -eq 0) { return $found }
  $cb = [LensProbe+EnumProc]{
    param($h, $l)
    [uint32]$procId = 0
    [void][LensProbe]::GetWindowThreadProcessId($h, [ref]$procId)
    if ($pids -contains [int]$procId) {
      $c = New-Object System.Text.StringBuilder 256; [void][LensProbe]::GetClassName($h, $c, 256)
      $t = New-Object System.Text.StringBuilder 256; [void][LensProbe]::GetWindowText($h, $t, 256)
      [void]$found.Add("$($c.ToString()) '$($t.ToString())'")
    }
    return $true
  }
  [void][LensProbe]::EnumWindows($cb, [IntPtr]::Zero)
  $found
}

function State {
  $tray = [LensProbe]::FindWindow("Shell_TrayWnd", $null)
  [ordered]@{
    taskbarVisible = ($tray -ne [IntPtr]::Zero) -and [LensProbe]::IsWindowVisible($tray)
    registry = Read-Keys
    run = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue | Select-Object -Property * -ExcludeProperty PS* | ConvertTo-Json -Compress)
  }
}

if ($Mode -eq "snapshot") {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $File) | Out-Null
  State | ConvertTo-Json -Depth 6 | Set-Content -Path $File -Encoding utf8
  Write-Host "[probe] snapshot written to $File"
  exit 0
}

# compare
$before = Get-Content $File -Raw | ConvertFrom-Json
# Explorer shows the taskbar asynchronously; give it up to 10 s before calling it a failure.
$now = State
for ($i = 0; $i -lt 20 -and $before.taskbarVisible -and -not $now.taskbarVisible; $i++) {
  Start-Sleep -Milliseconds 500
  $now = State
}
$problems = New-Object System.Collections.ArrayList

$left = @(Get-Process lens-ui -ErrorAction SilentlyContinue)
if ($left.Count) { [void]$problems.Add("$($left.Count) lens-ui process(es) still running") }
$wins = Lens-Windows
if ($wins.Count) { [void]$problems.Add("Lens windows left behind: $($wins -join '; ')") }
$forced = Test-Path (Join-Path (Split-Path -Parent $File) "forced-kill.txt")
if ($before.taskbarVisible -and -not $now.taskbarVisible) {
  if ($forced) { Write-Host "[probe] taskbar hidden after a forced kill (Lens never got to restore it; the e2e step already failed)" }
  else { [void]$problems.Add("the Windows taskbar is still hidden") }
}

foreach ($k in $Keys) {
  $b = $before.registry.$k
  $a = $now.registry[$k]
  if ($null -eq $b -and $null -eq $a) { continue }
  if ($null -eq $b) { [void]$problems.Add("$k was created"); continue }
  if ($null -eq $a) { [void]$problems.Add("$k was deleted"); continue }
  $names = @($b.PSObject.Properties.Name) + @($a.Keys) | Sort-Object -Unique
  foreach ($n in $names) {
    $bv = $b.$n
    $av = $a[$n]
    if ("$bv" -ne "$av") { [void]$problems.Add("$k\$n changed: '$bv' -> '$av'") }
  }
}
if ($before.run -ne $now.run) { Write-Host "[probe] note: HKCU Run changed (Start with Windows) — reported, not a failure" }

if ($problems.Count) {
  Write-Host "[probe] NOT restored after quit:"
  $problems | ForEach-Object { Write-Host "  - $_" }
  exit 1
}
Write-Host "[probe] Windows state restored: taskbar visible, $($Keys.Count) settings keys unchanged, no Lens process or window left"
exit 0

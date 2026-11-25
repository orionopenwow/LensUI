# Spike (not part of Lens): can a normal, unelevated process style another app's window with DWM
# attributes alone, no injection? See docs/WINDHAWK_REPLACEMENT.md, phase 0.
#
# Run on Windows 11 (22H2 or later) from a normal PowerShell:
#   powershell -ExecutionPolicy Bypass -File tools\spikes\dwm-foreign-window.ps1
# Optional: -Process "notepad" (default), -Elevated to also try an elevated target you started yourself.
#
# It starts (or finds) the target, sets the same five attributes the Windhawk mod sets in-process,
# reads them back, waits for you to look, then restores the defaults. It prints one line per
# attribute: the HRESULT of the set, and whether the value read back matches.
param([string]$Process = "notepad", [int]$HoldSeconds = 6)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Dwm {
  [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);
}
"@

$attrs = [ordered]@{
  "USE_IMMERSIVE_DARK_MODE (20)" = @{ id = 20; value = 1;          reset = 0 }
  "WINDOW_CORNER_PREFERENCE (33)" = @{ id = 33; value = 1;         reset = 0 }           # 1 = square, very visible
  "BORDER_COLOR (34)"            = @{ id = 34; value = 0x0000FF;   reset = -1 }          # red border; -1 = DWMWA_COLOR_DEFAULT
  "CAPTION_COLOR (35)"           = @{ id = 35; value = 0x000F0C0C; reset = -1 }          # Lens obsidian (BGR)
  "TEXT_COLOR (36)"              = @{ id = 36; value = 0x00FAFAFA; reset = -1 }
  "SYSTEMBACKDROP_TYPE (38)"     = @{ id = 38; value = 2;          reset = 0 }           # 2 = Mica
}

$p = Get-Process $Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Start-Process $Process; Start-Sleep 2; $p = Get-Process $Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
if (-not $p) { throw "No window for '$Process'." }
$h = $p.MainWindowHandle
"Target: $($p.ProcessName) pid $($p.Id) hwnd 0x{0:X}" -f [int64]$h

foreach ($k in $attrs.Keys) {
  $a = $attrs[$k]; $v = [int]$a.value
  $hr = [Dwm]::DwmSetWindowAttribute($h, $a.id, [ref]$v, 4)
  $back = 0; $hr2 = [Dwm]::DwmGetWindowAttribute($h, $a.id, [ref]$back, 4)
  $match = if ($hr2 -eq 0) { ($back -eq $v) } else { "n/a (get hr 0x{0:X8})" -f $hr2 }
  "{0,-32} set hr 0x{1:X8}   read back matches: {2}" -f $k, $hr, $match
}
"Look at the window now (square corners, red border, dark caption). Restoring in $HoldSeconds s..."
Start-Sleep $HoldSeconds
foreach ($k in $attrs.Keys) { $a = $attrs[$k]; $v = [int]$a.reset; [void][Dwm]::DwmSetWindowAttribute($h, $a.id, [ref]$v, 4) }
"Restored. Record: Windows build, target, which lines succeeded, and whether the look survived focusing another window and back."

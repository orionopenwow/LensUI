# Checks Lens's window-button overlay against a real window's caption buttons.
#   pwsh tools/e2e/caption-probe.ps1 <pid> [move|maximize|restore|snap|none]
# Performs the action on the process's main window, waits for it to settle, then prints JSON:
#   { win: {l,t,r,b}, overlay: {l,t,r,b} | null, buttonPoints, uncovered: [[x,y],...] }
# "uncovered" lists points where the window answers WM_NCHITTEST with a caption button
# (min / max / close / help) that no visible Lens overlay covers: the native button would show
# through there. Used by the caption-overlay scenario in tests/e2e/run.mjs.
param([int]$ProcId, [string]$Action = "none")
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace L -Name U -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int l, t, r, b; }
[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint f);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
[DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint ms, out IntPtr res);
[DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
'@
# Newer Windows starts Notepad through a stub that exits: fall back to any Notepad window.
$p = Get-Process -Id $ProcId -ErrorAction SilentlyContinue
$h = if ($p) { $p.MainWindowHandle } else { [IntPtr]::Zero }
if ($h -eq [IntPtr]::Zero) {
  $p = Get-Process notepad -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
  if (-not $p) { throw "no Notepad window" }
  $h = $p.MainWindowHandle
}
[L.U]::SetForegroundWindow($h) | Out-Null
switch ($Action) {
  "move"     { [L.U]::SetWindowPos($h, [IntPtr]::Zero, 220, 160, 900, 600, 0x0014) | Out-Null }
  "maximize" { [L.U]::ShowWindow($h, 3) | Out-Null }
  "restore"  { [L.U]::ShowWindow($h, 9) | Out-Null }
  # A snap to the left half of the primary screen, the way Win+Left places it.
  "snap"     {
    [L.U]::ShowWindow($h, 9) | Out-Null
    $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    [L.U]::SetWindowPos($h, [IntPtr]::Zero, $wa.X, $wa.Y, [int]($wa.Width / 2), $wa.Height, 0x0014) | Out-Null
  }
}
Start-Sleep -Milliseconds 1800

$win = New-Object L.U+RECT
if ([L.U]::DwmGetWindowAttribute($h, 9, [ref]$win, 16) -ne 0) { [L.U]::GetWindowRect($h, [ref]$win) | Out-Null }

$overlays = @()
$o = [IntPtr]::Zero
while ($true) {
  $o = [L.U]::FindWindowEx([IntPtr]::Zero, $o, "LensNativeCaptionOverlay", $null)
  if ($o -eq [IntPtr]::Zero) { break }
  if (-not [L.U]::IsWindowVisible($o)) { continue }
  $r = New-Object L.U+RECT
  [L.U]::GetWindowRect($o, [ref]$r) | Out-Null
  $overlays += ,$r
}
# The overlay for this window: the visible one at its top-right corner.
$mine = $overlays | Where-Object { [math]::Abs($_.r - $win.r) -le 2 -and [math]::Abs($_.t - $win.t) -le 2 } | Select-Object -First 1

$uncovered = @()
$buttonPoints = 0
for ($dy = 0; $dy -lt 70; $dy += 2) {
  for ($dx = 1; $dx -lt 240; $dx += 3) {
    $x = $win.r - $dx; $y = $win.t + $dy
    $lp = [IntPtr]([long](($y -band 0xFFFF) * 65536 + ($x -band 0xFFFF)))
    $res = [IntPtr]::Zero
    [L.U]::SendMessageTimeout($h, 0x84, [IntPtr]::Zero, $lp, 2, 200, [ref]$res) | Out-Null
    $code = $res.ToInt64()
    if ($code -in 8, 9, 20, 21) {
      $buttonPoints++
      $inside = $mine -and $x -ge $mine.l -and $x -lt $mine.r -and $y -ge $mine.t -and $y -lt $mine.b
      if (-not $inside) { $uncovered += ,@($x, $y) }
    }
  }
}
$ov = if ($mine) { @{ l = $mine.l; t = $mine.t; r = $mine.r; b = $mine.b } } else { $null }
@{ action = $Action; win = @{ l = $win.l; t = $win.t; r = $win.r; b = $win.b }; overlay = $ov; buttonPoints = $buttonPoints; uncovered = $uncovered | Select-Object -First 12 } | ConvertTo-Json -Depth 5 -Compress

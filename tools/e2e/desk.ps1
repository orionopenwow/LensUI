# Desktop helper for the auto-hide E2E (tests/e2e/autohide.mjs). Reads one command per line on
# stdin and answers one JSON line per command, so the test can move the real cursor and read real
# window state without starting PowerShell for every step.
#
#   screen                      -> {"x":..,"y":..,"w":..,"h":..} (primary monitor)
#   move X Y                    -> {"ok":true}
#   click X Y                   -> left click at X,Y
#   win TITLE                   -> {"found":true,"visible":..,"transparent":..,"x":..,"y":..,"w":..,"h":..}
#   watch TITLE MS              -> samples the window every 16 ms for MS and returns
#                                  {"samples":n,"transitions":k,"states":"..."} where the state is
#                                  "T" (click-through, i.e. hidden by Lens) or "S" (shown)
#   slide X Y1 Y2 STEP DELAYMS  -> moves the cursor from (X,Y1) to (X,Y2) in STEP px steps
#   notepad max|normal|close    -> opens Notepad (maximised or normal) and focuses it, or closes it
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Desk {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowW(string c, string t);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetWindowLongW(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public static void Click(int x, int y) { SetCursorPos(x, y); mouse_event(2, 0, 0, 0, IntPtr.Zero); mouse_event(4, 0, 0, 0, IntPtr.Zero); }
  public static string Info(string title) {
    IntPtr h = FindWindowW(null, title);
    if (h == IntPtr.Zero) return "{\"found\":false}";
    RECT r; GetWindowRect(h, out r);
    int ex = GetWindowLongW(h, -20);
    bool t = (ex & 0x20) != 0;
    return "{\"found\":true,\"visible\":" + (IsWindowVisible(h) ? "true" : "false") + ",\"transparent\":" + (t ? "true" : "false")
      + ",\"x\":" + r.L + ",\"y\":" + r.T + ",\"w\":" + (r.R - r.L) + ",\"h\":" + (r.B - r.T) + "}";
  }
  public static string Watch(string title, int ms) {
    IntPtr h = FindWindowW(null, title);
    if (h == IntPtr.Zero) return "{\"found\":false}";
    var sw = System.Diagnostics.Stopwatch.StartNew();
    var sb = new StringBuilder(); int n = 0, k = 0; char last = ' ';
    while (sw.ElapsedMilliseconds < ms) {
      char c = (!IsWindowVisible(h) || (GetWindowLongW(h, -20) & 0x20) != 0) ? 'T' : 'S';
      if (last != ' ' && c != last) k++;
      last = c; sb.Append(c); n++;
      System.Threading.Thread.Sleep(16);
    }
    return "{\"found\":true,\"samples\":" + n + ",\"transitions\":" + k + ",\"states\":\"" + sb.ToString() + "\"}";
  }
}
"@
$notepad = $null
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $a = $line.Trim().Split(" ", 3)
  try {
    switch ($a[0]) {
      "screen" { $out = "{`"x`":0,`"y`":0,`"w`":$([Desk]::GetSystemMetrics(0)),`"h`":$([Desk]::GetSystemMetrics(1))}" }
      "move" { [void][Desk]::SetCursorPos([int]$a[1], [int]$a[2]); $out = '{"ok":true}' }
      "click" { [Desk]::Click([int]$a[1], [int]$a[2]); $out = '{"ok":true}' }
      "win" { $out = [Desk]::Info($line.Substring(4)) }
      "watch" {
        $i = $line.LastIndexOf(" ")
        $out = [Desk]::Watch($line.Substring(6, $i - 6), [int]$line.Substring($i + 1))
      }
      "slide" {
        $p = $line.Split(" ")
        $x = [int]$p[1]; $y1 = [int]$p[2]; $y2 = [int]$p[3]; $step = [int]$p[4]; $d = [int]$p[5]
        $dir = if ($y2 -ge $y1) { 1 } else { -1 }
        for ($y = $y1; ($dir -gt 0 -and $y -le $y2) -or ($dir -lt 0 -and $y -ge $y2); $y += $dir * $step) {
          [void][Desk]::SetCursorPos($x, $y); Start-Sleep -Milliseconds $d
        }
        $out = '{"ok":true}'
      }
      "notepad" {
        if ($a[1] -eq "close") {
          if ($notepad) { Stop-Process -Id $notepad.Id -Force -ErrorAction SilentlyContinue; $notepad = $null }
          Get-Process notepad -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
          $out = '{"ok":true}'
        } else {
          $notepad = Start-Process notepad -PassThru
          $h = [IntPtr]::Zero
          for ($i = 0; $i -lt 50 -and $h -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 100; $notepad.Refresh(); $h = $notepad.MainWindowHandle }
          if ($h -eq [IntPtr]::Zero) {
            # Windows 11 Notepad hands its window to another process: find any Notepad window.
            $g = Get-Process notepad -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
            if ($g) { $h = $g.MainWindowHandle }
          }
          if ($h -ne [IntPtr]::Zero) {
            [void][Desk]::ShowWindow($h, $(if ($a[1] -eq "max") { 3 } else { 1 }))
            [void][Desk]::SetForegroundWindow($h)
            $out = '{"ok":true}'
          } else { $out = '{"ok":false,"error":"no notepad window"}' }
        }
      }
      default { $out = "{`"ok`":false,`"error`":`"unknown command`"}" }
    }
  } catch { $out = "{`"ok`":false,`"error`":`"$($_.Exception.Message -replace '"', "'")`"}" }
  [Console]::Out.WriteLine($out)
  [Console]::Out.Flush()
}

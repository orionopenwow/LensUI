@echo off
rem ============================================================================
rem  Uninstall-Lens-UI.bat - removes every change Lens made to Windows.
rem  Works with Lens not running (or not even starting). Safe to run twice.
rem  The PowerShell part below the #PS_BEGIN line does the work.
rem ============================================================================
title Remove Lens changes
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-Content -Raw -LiteralPath '%~f0'; $i = $s.IndexOf('#PS_' + 'BEGIN'); & ([scriptblock]::Create($s.Substring($i)))"
echo.
pause
exit /b
#PS_BEGIN
$ErrorActionPreference = 'Continue'
function Say($t) { Write-Host "  $t" }
function Step($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }

Write-Host ""
Write-Host "This removes the changes Lens made to Windows:" -ForegroundColor White
Say "folder icons, Explorer folder-icon override, shell mode, start-with-Windows,"
Say "the hidden taskbar, and Lens' Windhawk mod. Your files are not touched."
$go = Read-Host "Continue? (Y/N)"
if ($go -notmatch '^[Yy]') { Say "Nothing changed."; return }

$data = Join-Path $env:APPDATA 'LensUI'

Step "Stopping Lens"
Get-Process -Name 'lens-ui' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 600
Say "Done."

Step "Shell mode"
$winlogon = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon'
$shell = (Get-ItemProperty -Path $winlogon -Name Shell -ErrorAction SilentlyContinue).Shell
if ($shell -and $shell -match 'lens') {
  Remove-ItemProperty -Path $winlogon -Name Shell -ErrorAction SilentlyContinue
  Say "Windows Explorer is the shell again from the next sign-in."
} elseif ($shell) { Say "Left alone (points at something other than Lens: $shell)." }
else { Say "Was not enabled." }

Step "Start with Windows"
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (Get-ItemProperty -Path $run -Name LensUI -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $run -Name LensUI
  Say "Removed."
} else { Say "Was not set." }
$approved = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
if (Get-ItemProperty -Path $approved -Name LensUI -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $approved -Name LensUI
  Say "Removed its Task Manager startup switch."
}

Step "Explorer folder icons"
$icons = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Icons'
foreach ($n in '3', '4') {
  $v = (Get-ItemProperty -Path $icons -Name $n -ErrorAction SilentlyContinue).$n
  if ($v -and $v -match 'lens_glass_folder_') { Remove-ItemProperty -Path $icons -Name $n; Say "Restored default icon $n." }
}

Step "Folder icons"
# Same name Lens uses for each folder's desktop.ini backup: FNV-1a 64 of the lower-cased path
# without trailing slashes ("C:\x" -> 7f89e591ebb8e85c).
function BackupName([string]$p) {
  $s = $p.TrimEnd('\', '/').ToLowerInvariant()
  $h = [System.Numerics.BigInteger]::Parse('14695981039346656037')
  $prime = [System.Numerics.BigInteger]::Parse('1099511628211')
  $mod = [System.Numerics.BigInteger]::Pow(2, 64)
  foreach ($b in [Text.Encoding]::UTF8.GetBytes($s)) {
    $h = [System.Numerics.BigInteger]::op_ExclusiveOr($h, [System.Numerics.BigInteger]$b)
    $h = [System.Numerics.BigInteger]::Remainder([System.Numerics.BigInteger]::Multiply($h, $prime), $mod)
  }
  $hex = $h.ToString('x')
  if ($hex.Length -gt 16) { $hex = $hex.Substring($hex.Length - 16) }
  return $hex.PadLeft(16, '0') + '.ini'
}
$folders = New-Object System.Collections.Generic.List[string]
$cfgPath = Join-Path $data 'config.json'
if (Test-Path $cfgPath) {
  try { (Get-Content -Raw $cfgPath | ConvertFrom-Json).styledFolders | ForEach-Object { if ($_.path) { $folders.Add($_.path) } } } catch { Say "config.json could not be read; checking the usual folders only." }
}
foreach ($f in 'Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos') { $folders.Add((Join-Path $env:USERPROFILE $f)) }
$done = @{}
$restored = 0
foreach ($folder in $folders) {
  $key = $folder.TrimEnd('\', '/').ToLowerInvariant()
  if ($done.ContainsKey($key) -or -not (Test-Path -LiteralPath $folder -PathType Container)) { continue }
  $done[$key] = $true
  $ini = Join-Path $folder 'desktop.ini'
  if (-not (Test-Path -LiteralPath $ini)) { continue }
  $text = Get-Content -Raw -LiteralPath $ini -ErrorAction SilentlyContinue
  if ($text -notmatch 'lens_glass_folder_') { continue }
  attrib -s -h "$ini" | Out-Null
  $backup = Join-Path (Join-Path $data 'folder-backups') (BackupName $folder)
  if (Test-Path -LiteralPath $backup) {
    Copy-Item -LiteralPath $backup -Destination $ini -Force
    attrib +s +h "$ini" | Out-Null
    Remove-Item -LiteralPath $backup -Force
  } else {
    Remove-Item -LiteralPath $ini -Force
    attrib -r "$folder" | Out-Null
  }
  $restored++
  Say "Restored $folder"
}
Say "$restored folder(s) restored."

Step "Windows taskbar"
Add-Type @'
using System; using System.Runtime.InteropServices;
public class LensTB {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, R2, B; }
  [StructLayout(LayoutKind.Sequential)] public struct ABD { public int cb; public IntPtr hw; public uint cbMsg; public uint edge; public R rc; public IntPtr lp; }
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string t);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("shell32.dll")] public static extern uint SHAppBarMessage(uint m, ref ABD d);
  public static void Restore() {
    var h = FindWindow("Shell_TrayWnd", null);
    if (h != IntPtr.Zero) { var d = new ABD { cb = Marshal.SizeOf(typeof(ABD)), hw = h, lp = IntPtr.Zero }; SHAppBarMessage(10, ref d); ShowWindow(h, 5); }
    IntPtr p = IntPtr.Zero;
    while ((p = FindWindowEx(IntPtr.Zero, p, "Shell_SecondaryTrayWnd", null)) != IntPtr.Zero) ShowWindow(p, 5);
  }
}
'@
[LensTB]::Restore()
Say "Taskbar shown and auto-hide turned off."

Step "Windhawk mod"
$wh = 'C:\ProgramData\Windhawk\ModsSource\lens-window-style.wh.cpp'
if (Test-Path -LiteralPath $wh) {
  Remove-Item -LiteralPath $wh -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $wh) { Say "Could not remove $wh (try again as administrator)." } else { Say "Removed." }
} else { Say "Not installed." }

Step "Not changed"
Say "Your Windows accent colour and the 'Show accent colour on title bars' setting were left as they are."

Write-Host ""
$r = Read-Host "Restart Windows Explorer now to refresh desktop icons, folder icons and window borders? (Y/N)"
if ($r -match '^[Yy]') {
  Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }
  Say "Explorer restarted."
}

if (Test-Path -LiteralPath $data) {
  $d = Read-Host "Also delete Lens's settings, themes and training data in $data ? (Y/N)"
  if ($d -match '^[Yy]') { Remove-Item -LiteralPath $data -Recurse -Force; Say "Deleted." } else { Say "Kept." }
}
Write-Host ""
Write-Host "Lens's changes have been removed. You can now delete the Lens folder or uninstall the app." -ForegroundColor Green

# Installer smoke test on a clean Windows machine (.github/workflows/installer.yml).
#
#   pwsh tools/installer/smoke.ps1 -Setup <Lens UI_x.y.z_x64-setup.exe> [-Msi <.msi>] [-Out dir]
#
# What a first-time user does, end to end, with Windows' state compared before and after:
#   1. silent install            files, Start menu entry and uninstall entry exist
#   2. first launch              Lens starts, stays up, writes its config; screenshot
#   3. install over a running Lens (an upgrade): the installer closes it and gives the taskbar back
#   4. uninstall with Lens running: everything installed is gone, the uninstaller ran
#      `--remove-changes` without a failed step, and tools/e2e/probe.ps1 finds Windows as it was
#   5. (optional) the MSI: install, launch, uninstall
# Exit code 1 if any check failed. Screenshots and logs land in -Out.
param(
  [Parameter(Mandatory)][string]$Setup,
  [string]$Msi,
  [string]$Out = "installer-out"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Out = (Resolve-Path $Out).Path
$Setup = (Resolve-Path $Setup).Path

$Product = "Lens UI"
$Exe = "lens-ui.exe"
$InstallDir = Join-Path $env:LOCALAPPDATA $Product
$UninstKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$Product"
$StartMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$Product.lnk"
$DataDir = Join-Path $env:APPDATA "LensUI"
$UninstLog = Join-Path $env:TEMP "LensUI-uninstall.log"
$Probe = Join-Path $PSScriptRoot "..\e2e\probe.ps1"
$env:LENS_SAFE_MODE_CHOICE = "normal"

$results = New-Object System.Collections.Generic.List[object]
function Check([string]$name, [bool]$ok, [string]$detail = "") {
  $results.Add([pscustomobject]@{ Check = $name; Ok = $ok; Detail = $detail })
  $mark = if ($ok) { "PASS" } else { "FAIL" }
  $color = if ($ok) { "Green" } else { "Red" }
  Write-Host ("[{0}] {1} {2}" -f $mark, $name, $detail) -ForegroundColor $color
}
function Wait-Until([scriptblock]$cond, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) { if (& $cond) { return $true }; Start-Sleep -Milliseconds 500 }
  return [bool](& $cond)
}
function Running { [bool](Get-Process -Name "lens-ui" -ErrorAction SilentlyContinue) }
function Shot([string]$name) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $Out "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  } catch { Write-Host "screenshot $name failed: $_" }
}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SmokeTray {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
"@
function TaskbarVisible {
  $h = [SmokeTray]::FindWindow("Shell_TrayWnd", $null)
  return ($h -eq [IntPtr]::Zero) -or [SmokeTray]::IsWindowVisible($h)  # no Explorer taskbar: nothing to hide
}
function Install-Silent([string]$label) {
  $p = Start-Process -FilePath $Setup -ArgumentList "/S" -PassThru -Wait
  Check "$label exits 0" ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
}
function Start-Lens {
  Start-Process -FilePath (Join-Path $InstallDir $Exe) -WorkingDirectory $InstallDir | Out-Null
  return (Wait-Until { Running } 20)
}

# ------------------------------------------------------------------------------------------------
Write-Host "== Windows state before install"
pwsh -NoProfile -File $Probe snapshot (Join-Path $Out "before.json")
Remove-Item $UninstLog -Force -ErrorAction SilentlyContinue

Write-Host "== 1. Silent install"
Install-Silent "install"
Check "lens-ui.exe installed" (Test-Path (Join-Path $InstallDir $Exe)) $InstallDir
Check "uninstaller installed" (Test-Path (Join-Path $InstallDir "uninstall.exe"))
Check "Start menu entry" (Test-Path $StartMenu) $StartMenu
Check "Apps & features entry" (Test-Path $UninstKey)
$ver = (Get-ItemProperty $UninstKey -ErrorAction SilentlyContinue).DisplayVersion
Check "entry has a version" ([bool]$ver) "$ver"

Write-Host "== 2. First launch"
Check "Lens starts" (Start-Lens)
Start-Sleep -Seconds 25
Check "Lens still running after 25 s" (Running)
Check "config written to %APPDATA%\LensUI" (Test-Path (Join-Path $DataDir "config.json"))
Shot "first-launch"

Write-Host "== 3. Install again over a running Lens (upgrade path)"
Install-Silent "reinstall over running Lens"
Check "installer closed Lens" (Wait-Until { -not (Running) } 15)
Check "taskbar visible after the upgrade" (Wait-Until { TaskbarVisible } 10)
Check "lens-ui.exe still installed" (Test-Path (Join-Path $InstallDir $Exe))
Check "Lens starts again" (Start-Lens)
Start-Sleep -Seconds 10
Check "Lens still running" (Running)
Shot "after-upgrade"

Write-Host "== 4. Uninstall with Lens running"
# The NSIS uninstaller copies itself to %TEMP% and returns at once: wait for its work instead.
Start-Process -FilePath (Join-Path $InstallDir "uninstall.exe") -ArgumentList "/S" | Out-Null
Check "uninstall removes the Apps & features entry" (Wait-Until { -not (Test-Path $UninstKey) } 120)
Check "uninstall removes lens-ui.exe" (Wait-Until { -not (Test-Path (Join-Path $InstallDir $Exe)) } 30)
Check "uninstall removes the Start menu entry" (-not (Test-Path $StartMenu))
Check "no Lens process left" (Wait-Until { -not (Running) } 10)
Check "taskbar visible" (TaskbarVisible)
$hasLog = Wait-Until { Test-Path $UninstLog } 10
Check "uninstaller ran --remove-changes" $hasLog $UninstLog
if ($hasLog) {
  $log = Get-Content $UninstLog -Raw
  Copy-Item $UninstLog (Join-Path $Out "uninstall.log")
  Write-Host $log
  Check "every undo step succeeded" (-not ($log -match "\[FAILED\]"))
}
$run = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue)
Check "no Start-with-Windows entry left" (-not ($run.LensUI -or $run.$Product))
Shot "after-uninstall"
pwsh -NoProfile -File $Probe compare (Join-Path $Out "before.json")
Check "Windows state matches the snapshot (tools/e2e/probe.ps1)" ($LASTEXITCODE -eq 0)

# ------------------------------------------------------------------------------------------------
if ($Msi) {
  Write-Host "== 5. MSI install, launch, uninstall"
  $Msi = (Resolve-Path $Msi).Path
  $p = Start-Process msiexec.exe -ArgumentList "/i", "`"$Msi`"", "/qn", "/norestart", "/l*v", "`"$(Join-Path $Out 'msi-install.log')`"" -Wait -PassThru
  Check "msiexec /i exits 0" ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
  $msiExe = @("$env:ProgramFiles\$Product\$Exe", "$env:LOCALAPPDATA\Programs\$Product\$Exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  Check "MSI installed lens-ui.exe" ([bool]$msiExe) "$msiExe"
  if ($msiExe) {
    Start-Process -FilePath $msiExe | Out-Null
    Check "MSI build starts" (Wait-Until { Running } 20)
    Start-Sleep -Seconds 15
    Check "MSI build still running after 15 s" (Running)
    Shot "msi-launch"
    Get-Process -Name "lens-ui" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1
  }
  $p = Start-Process msiexec.exe -ArgumentList "/x", "`"$Msi`"", "/qn", "/norestart", "/l*v", "`"$(Join-Path $Out 'msi-uninstall.log')`"" -Wait -PassThru
  Check "msiexec /x exits 0" ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
  if ($msiExe) { Check "MSI uninstall removes lens-ui.exe" (-not (Test-Path $msiExe)) }
}

# ------------------------------------------------------------------------------------------------
if (Test-Path $DataDir) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Out "appdata") | Out-Null
  Get-ChildItem $DataDir -Recurse -Include *.log, *.txt -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -lt 2MB } | Copy-Item -Destination (Join-Path $Out "appdata") -Force
}
$results | Export-Csv (Join-Path $Out "results.csv") -NoTypeInformation
$failed = @($results | Where-Object { -not $_.Ok })
if ($env:GITHUB_STEP_SUMMARY) {
  $md = @("## Installer smoke test", "", "| Check | Result | Detail |", "|---|---|---|")
  $md += $results | ForEach-Object { "| $($_.Check) | $(if ($_.Ok) { 'pass' } else { '**FAIL**' }) | $($_.Detail -replace '\|','/') |" }
  $md -join "`n" | Add-Content $env:GITHUB_STEP_SUMMARY
}
Write-Host ""
Write-Host ("{0} checks, {1} failed" -f $results.Count, $failed.Count)
if ($failed.Count) { exit 1 }

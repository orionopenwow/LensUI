<#
.SYNOPSIS
  Builds Lens from source with a prerequisite check, a full log and a plain-English diagnosis
  when something fails. Build-Lens-UI.bat runs this.

.DESCRIPTION
  Most people don't need this: the installer on GitHub Releases is the easy way to get Lens.

  1. Checks Windows, Bun, Rust (MSVC), the Visual C++ Build Tools, the Windows SDK, WebView2,
     free disk space and memory, and says exactly what to install when something is missing.
  2. Builds the NSIS installer (add -Msi for the .msi too) and writes every line to
     build-logs\build-<time>.log, so the real error is never lost.
  3. Keeps talking during the long final step (compiling lens-ui, "530/532"), which can be
     quiet for many minutes but is not stuck.
  4. On failure, matches the log against known problems (missing linker, out of memory, a running
     Lens locking the exe, no disk space, network, WiX/VBScript) and prints the fix.

.PARAMETER CheckOnly   Only run the prerequisite check.
.PARAMETER Msi         Also build the .msi (needs WiX, which Tauri downloads, and VBScript).
.PARAMETER Full        Use the release profile exactly as CI ships it (fat LTO, one codegen unit):
                       smallest exe, slowest build, most memory.
.PARAMETER LowMemory   Fewer parallel jobs and lighter optimisation. Picked automatically on PCs
                       with less than 12 GB of RAM.
#>
[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$Msi,
    [switch]$Full,
    [switch]$LowMemory
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root

function Say([string]$t, [string]$c = 'Gray') { Write-Host "  $t" -ForegroundColor $c }
function Head([string]$t) { Write-Host ''; Write-Host "[Lens] $t" -ForegroundColor Cyan }
$script:problems = @()
$script:warnings = @()
function Ok([string]$what) { Say "OK    $what" 'Green' }
function Warn([string]$what, [string]$fix) { Say "WARN  $what" 'Yellow'; if ($fix) { Say "      $fix" 'Yellow' }; $script:warnings += $what }
function Bad([string]$what, [string]$fix) { Say "NEED  $what" 'Red'; if ($fix) { Say "      $fix" 'Red' }; $script:problems += $what }
function Has([string]$cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ---------------------------------------------------------------------------------------------
Head 'Checking what the build needs'
# ---------------------------------------------------------------------------------------------

$os = [Environment]::OSVersion.Version
if ($os.Major -lt 10 -or $os.Build -lt 17763) {
    Bad "Windows 10 1809 or newer (this is $os)" 'Lens needs Windows 10 version 1809 or Windows 11.'
} else { Ok "Windows $($os.Major) build $($os.Build)" }

if (Has 'bun') { Ok "Bun $(bun --version | Select-Object -Last 1)" }
else { Bad 'Bun (JavaScript tooling)' 'Install: powershell -c "irm bun.sh/install.ps1 | iex"   then open a new window.' }

$rustOk = $false
if ((Has 'rustc') -and (Has 'cargo')) {
    $vv = (rustc -vV) -join "`n"
    $ver = [regex]::Match($vv, 'release: (\d+)\.(\d+)')
    $host_ = [regex]::Match($vv, 'host: (\S+)').Groups[1].Value
    if ($host_ -notlike '*-pc-windows-msvc') {
        Bad "Rust's MSVC toolchain (yours is $host_)" 'Run: rustup default stable-x86_64-pc-windows-msvc'
    } elseif ([int]$ver.Groups[1].Value -eq 1 -and [int]$ver.Groups[2].Value -lt 80) {
        Bad "Rust 1.80 or newer (yours is $($ver.Value -replace 'release: ',''))" 'Run: rustup update stable'
    } else { Ok "Rust $($ver.Value -replace 'release: ','') ($host_)"; $rustOk = $true }
} else {
    Bad 'Rust (rustup, stable, MSVC)' 'Install from https://rustup.rs (pick the default MSVC option), then open a new window.'
}

# The MSVC linker and the Windows SDK come with the Visual Studio C++ Build Tools.
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vc = $null
if (Test-Path $vswhere) {
    $vc = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1
}
$buildToolsFix = 'Install: winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"'
if ($vc) { Ok "Visual C++ Build Tools ($vc)" }
else { Bad 'Visual C++ Build Tools (the MSVC linker, link.exe)' $buildToolsFix }

$sdkRoot = $null
foreach ($k in 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Microsoft SDKs\Windows\v10.0', 'HKLM:\SOFTWARE\Microsoft\Microsoft SDKs\Windows\v10.0') {
    $p = (Get-ItemProperty -Path $k -ErrorAction SilentlyContinue).InstallationFolder
    if ($p -and (Test-Path (Join-Path $p 'Lib'))) { $sdkRoot = $p; break }
}
if ($sdkRoot) { Ok "Windows 10/11 SDK ($sdkRoot)" }
else { Bad 'Windows 10/11 SDK (kernel32.lib and friends)' "$buildToolsFix  (the VCTools workload with --includeRecommended adds the SDK)" }

$wv = $null
foreach ($k in 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
               'HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') {
    $v = (Get-ItemProperty -Path $k -ErrorAction SilentlyContinue).pv
    if ($v -and $v -ne '0.0.0.0') { $wv = $v; break }
}
if ($wv) { Ok "WebView2 Runtime $wv" }
else { Warn 'WebView2 Runtime not found (needed to run Lens, not to build it)' 'Get it from https://developer.microsoft.com/microsoft-edge/webview2/ (Evergreen). The installer adds it automatically.' }

$drive = (Get-Item $Root).PSDrive
$freeGb = [math]::Round($drive.Free / 1GB, 1)
if ($freeGb -lt 4) { Bad "Free disk space on $($drive.Name): (only $freeGb GB)" 'A first build needs about 8 GB in src-tauri\target. Free some space.' }
elseif ($freeGb -lt 10) { Warn "Free disk space on $($drive.Name): is $freeGb GB" 'A first build uses about 8 GB; it may run out.' }
else { Ok "Free disk space $freeGb GB" }

$ramGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
$freeRamGb = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 1)
if ($ramGb -lt 12 -and -not $Full) { $LowMemory = $true }
if ($ramGb -lt 8) { Warn "Memory: $ramGb GB" 'Building may fail with "out of memory". Close other apps; the build uses low-memory settings.' }
else { Ok "Memory $ramGb GB ($freeRamGb GB free)" }

if ($Root -match 'OneDrive') {
    Warn 'The folder is inside OneDrive' 'OneDrive syncing locks build files and slows the build. Clone into a folder like C:\src\LensUI instead.'
}
if ($Root.Length -gt 120) {
    Warn "The folder path is long ($($Root.Length) characters)" 'Deep build paths can hit the Windows 260-character limit. A shorter folder like C:\src\LensUI is safer.'
}

if ($script:problems.Count -gt 0) {
    Head "Install the $($script:problems.Count) item(s) marked NEED above, open a new window, and run Build-Lens-UI.bat again."
    Say 'Or skip building: download the installer from https://github.com/orionopenwow/LensUI/releases' 'White'
    exit 2
}
if ($CheckOnly) { Head 'Everything the build needs is here.'; exit 0 }

# ---------------------------------------------------------------------------------------------
Head 'Building Lens'
# ---------------------------------------------------------------------------------------------

# A Lens started from this folder's build locks src-tauri	argetelease\lens-ui.exe and the link
# step fails. Ask before closing it; an installed Lens elsewhere doesn't get in the way.
$target = Join-Path $Root 'src-tauri	arget'
$running = @(Get-Process -Name 'lens-ui' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($target, [StringComparison]::OrdinalIgnoreCase) })
if ($running.Count) {
    Say "Lens is running from this folder's build ($($running[0].Path)). It has to close so the new build can replace it." 'Yellow'
    $answer = if ([Environment]::UserInteractive -and -not $env:CI) { Read-Host '  Close it now? (Y/N)' } else { 'Y' }
    if ($answer -notmatch '^[Yy]') { Say 'Close Lens and run the build again.' 'Yellow'; exit 3 }
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
    # Lens gives the taskbar back when it exits normally; a forced close doesn't.
    $restore = Join-Path $Root 'Restore-Windows-Taskbar.bat'
    if (Test-Path $restore) { & cmd.exe /d /c "`"$restore`"" | Out-Null }
}

$env:CARGO_TERM_COLOR = 'never'
$env:CARGO_TERM_PROGRESS_WHEN = 'never'
if ($Full) {
    Say 'Profile: release exactly as shipped (fat LTO). Slowest; needs the most memory.'
} elseif ($LowMemory) {
    # Thin LTO and several codegen units: a fraction of the memory of the shipping profile.
    $env:CARGO_PROFILE_RELEASE_LTO = 'thin'
    $env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = '16'
    $env:CARGO_BUILD_JOBS = [string][math]::Max(1, [math]::Min(4, [Environment]::ProcessorCount / 2))
    Say "Profile: low memory (thin LTO, $($env:CARGO_BUILD_JOBS) parallel jobs). The exe is a little bigger; it works the same."
} else {
    $env:CARGO_PROFILE_RELEASE_LTO = 'thin'
    $env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = '16'
    Say 'Profile: local (thin LTO, parallel codegen). Much faster than the shipping profile; same features. -Full builds exactly what CI ships.'
}

$logDir = Join-Path $Root 'build-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("build-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Say "Full log: $log"

$bundles = if ($Msi) { 'nsis,msi' } else { 'nsis' }
$steps = @(
    @{ name = 'Installing JavaScript dependencies'; cmd = 'bun install --frozen-lockfile || bun install' },
    @{ name = "Compiling Lens and building the installer ($bundles)"; cmd = "bun run tauri build --bundles $bundles" }
)

$started = Get-Date
foreach ($s in $steps) {
    Head $s.name
    if ($s.cmd -like '*tauri build*') {
        Say 'The first build compiles about 530 packages and takes 10-30 minutes. The last one, lens-ui itself,'
        Say 'is a single large compile that can stay quiet for several minutes. That is normal; this window'
        Say 'prints a line every minute while it works.'
    }
    Add-Content -Path $log -Value "`r`n===== $($s.name): $($s.cmd)"
    # Parentheses: the redirect covers every command in the step. Reading Handle keeps ExitCode.
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/s', '/c', "`"($($s.cmd)) >> `"$log`" 2>&1`"" -NoNewWindow -PassThru
    $null = $p.Handle
    $seen = (Get-Content $log -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    $lastNew = Get-Date
    $lastBeat = Get-Date
    while (-not $p.HasExited) {
        Start-Sleep -Seconds 2
        $lines = @(Get-Content $log -ErrorAction SilentlyContinue)
        if ($lines.Count -gt $seen) {
            $lines[$seen..($lines.Count - 1)] | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
            $seen = $lines.Count
            $lastNew = Get-Date
        } elseif (((Get-Date) - $lastNew).TotalSeconds -ge 60 -and ((Get-Date) - $lastBeat).TotalSeconds -ge 60) {
            $rustc = Get-Process -Name 'rustc', 'link' -ErrorAction SilentlyContinue
            $mem = [math]::Round((($rustc | Measure-Object WorkingSet64 -Sum).Sum) / 1GB, 1)
            $what = if ($rustc | Where-Object Name -eq 'link') { 'linking' } elseif ($rustc) { 'compiling' } else { 'working' }
            $mins = [math]::Floor(((Get-Date) - $started).TotalMinutes)
            Say ("still {0} ({1} min so far, compiler using {2} GB)" -f $what, $mins, $mem) 'DarkCyan'
            $lastBeat = Get-Date
        }
    }
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) { $failed = $true; break }
}

if (-not $failed) {
    $mins = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
    $nsis = Get-ChildItem 'src-tauri\target\release\bundle\nsis\*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
    Head "Done in $mins min."
    if ($nsis) { Say "Installer: $($nsis.FullName)" 'Green' }
    if ($Msi) { Get-ChildItem 'src-tauri\target\release\bundle\msi\*.msi' -ErrorAction SilentlyContinue | ForEach-Object { Say "MSI:       $($_.FullName)" 'Green' } }
    Say "Portable:  $(Join-Path $Root 'src-tauri\target\release\lens-ui.exe')" 'Green'
    exit 0
}

# ---------------------------------------------------------------------------------------------
Head 'The build stopped. What went wrong:'
# ---------------------------------------------------------------------------------------------
$text = Get-Content $log -Raw -ErrorAction SilentlyContinue
$known = @(
    @{ re = 'linker `link\.exe` not found|link\.exe.*not found|error: linker'; why = 'The Microsoft C++ linker (link.exe) is missing.'; fix = $buildToolsFix },
    @{ re = "LNK1181|cannot open input file '(kernel32|ole32|user32|ntdll|advapi32)\.lib'"; why = 'The Windows SDK libraries are missing.'; fix = "$buildToolsFix  (adds the Windows SDK)" },
    @{ re = 'LNK1102|out of memory|memory allocation of \d+ bytes failed|paging file is too small|os error 1455|0xc0000409|STATUS_STACK_BUFFER_OVERRUN|LLVM ERROR'; why = 'The compiler ran out of memory during the final compile or link.'; fix = 'Close other apps and run: Build-Lens-UI.bat -LowMemory   If it still fails, let Windows manage the page file size (System > About > Advanced system settings > Performance > Advanced > Virtual memory).' },
    @{ re = 'os error 32|os error 5\)|Access is denied|being used by another process|LNK1104|LNK1168'; why = 'A file in src-tauri\target is locked, usually by a running Lens or by antivirus scanning it.'; fix = 'Close Lens (taskkill /F /IM lens-ui.exe), then try again. If it keeps happening, add the src-tauri\target folder to your antivirus exclusions.' },
    @{ re = 'not enough space on the disk|No space left on device|os error 112'; why = 'The disk is full.'; fix = 'Free about 8 GB (or delete src-tauri\target to start clean) and try again.' },
    @{ re = 'is not supported by the following package|requires rustc \d|rustc \d+\.\d+.* is not supported'; why = 'Your Rust is too old for one of the packages.'; fix = 'Run: rustup update stable' },
    @{ re = 'failed to (download|get|fetch)|spurious network error|Could not resolve host|SSL connect error|timed out|error sending request'; why = 'A download failed (packages from crates.io or npm, or Tauri''s NSIS/WiX tools from GitHub).'; fix = 'Check your internet connection or proxy and run the build again; finished steps are kept.' },
    @{ re = 'light\.exe|candle\.exe|failed to bundle project.*msi|VBSCRIPT|WixTools'; why = 'Building the .msi failed (WiX needs the Windows VBScript feature, which newer Windows can remove).'; fix = 'Build without -Msi (the .exe installer is all most people need), or turn on VBScript in Settings > System > Optional features.' },
    @{ re = 'makensis|NSIS.*(error|failed)|failed to bundle project'; why = 'Packaging the installer failed after Lens compiled.'; fix = 'Your Lens is built: src-tauri\target\release\lens-ui.exe runs as is. Attach the log to an issue so the installer step can be fixed.' },
    @{ re = 'error TS\d+|vite.*error|Failed to resolve import'; why = 'The interface (TypeScript) didn''t build.'; fix = 'Run "git pull" for the latest code and "bun install", then try again. If it persists, attach the log to an issue.' },
    @{ re = 'error\[E\d+\]|could not compile `lens-ui`'; why = 'The Rust code didn''t compile.'; fix = 'Make sure you have the latest code ("git pull") and an up-to-date Rust ("rustup update"). If it persists, attach the log to an issue.' }
)
$matched = $false
foreach ($k in $known) {
    if ($text -match $k.re) {
        Say $k.why 'Red'
        Say "Fix: $($k.fix)" 'Yellow'
        $matched = $true
        break
    }
}
if (-not $matched) { Say 'Not a known problem. The lines below are the first errors in the log.' 'Red' }
Write-Host ''
$errs = Select-String -Path $log -Pattern '(^error|error:|error\[|LNK\d{4}|failed)' -CaseSensitive:$false | Select-Object -First 12
$errs | ForEach-Object { Say $_.Line.Trim() 'DarkGray' }
Write-Host ''
Say "Full log: $log"
Say 'Report it: https://github.com/orionopenwow/LensUI/issues (attach the log). Or skip building and use the'
Say 'installer from https://github.com/orionopenwow/LensUI/releases'
exit 1

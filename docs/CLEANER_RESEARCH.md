# Lens Cleaner — research notes

Research done before building Lens Cleaner (docs/CLEANER.md). It has three parts: what the reference
("Roomy") and the established tools do, which Windows APIs and paths each category uses, and the
design details that make the best utility apps feel premium. Quotes are short; everything else is
paraphrased. Sources are listed at the end.

## 1. Reference and landscape

| Tool | What we take | What we avoid |
|---|---|---|
| **Roomy** (krezio/roomy, MIT, C#/.NET 10 WPF) | The whole flow (Home → Scan → Cleanup / Space map → Done). Three tiers: *Safe* (ticked), *GPU shader caches* (safe but unticked), and *Your call* (unticked, confirm before a permanent delete). Its protected-folder guard (Documents, Desktop, Pictures, Videos, Music, the Downloads folder itself, the profile, Windows, Program Files). Never follows junctions or symlinks, and skips in-use files. Steam games unplayed for 2+ months are removed through Steam. Windows.old opens Windows' own cleanup. | Nothing structural. We add a dry run, the Recycle Bin by default, an audit log, and Lens presence. |
| **Disk Cleanup** (`cleanmgr`) | Handlers live under `HKLM\…\Explorer\VolumeCaches\<handler>`. `/sageset:n` writes a `StateFlagsNNNN` DWORD per handler, and `/sagerun:n` runs the ticked ones. "Windows Update Cleanup" is the supported way to remove superseded WinSxS components. | Writing StateFlags into HKLM: that is a machine-wide change. We call DISM through a one-shot elevated helper instead. |
| **Storage Sense** | Windows' own scheduled cleaner. Its on/off state is `HKCU\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy` value `01`. We read it out and link to `ms-settings:storagepolicies`. | Duplicating it. Our weekly schedule is SAFE-only and off by default. |
| **WizTree** | Speed comes from reading the NTFS Master File Table directly, which needs admin; otherwise it falls back to the normal Windows API. It reports hard-linked system folders honestly. | Requiring admin for a scan. |
| **WinDirStat / SpaceSniffer / TreeSize / DaisyDisk** | Treemap (WinDirStat, SpaceSniffer), a sorted list with % bars (TreeSize), and the sunburst with smaller items grouped into one translucent petal (DaisyDisk). | Dense, unlabelled maps: ours always have a list view and keyboard focus. |
| **BleachBit** | Cleaner definitions (CleanerML) are a good catalogue of cache paths. | Code and definitions: BleachBit is GPL-3.0, so we use it for ideas only, write our own path list and copy nothing. |
| **CCleaner, Glary, "Clean My PC" tools** | Category grouping, sizes per category. | Registry "cleaning", cookie and history wiping by default, scary scores, upsells. A cache cleaner must never sign people out. |
| **CleanMyMac Smart Care** | One button: scan, then **Run**. Results show as tiles with a tick to skip each one and **Review** to see the details. It never deletes user files unless you choose. | Bundling unrelated "speed" tasks into the one button. |

## 2. Categories: safety and cost

| Category | Lens level | Pre-ticked | Cost of cleaning |
|---|---|---|---|
| Recycle Bin | SAFE | yes | Gone for good. That's why the card says so in its line. |
| Temporary files older than 24 h | SAFE | yes | None. Files in use are skipped. |
| Browser caches (Chrome, Edge, Brave, Vivaldi, Opera, Firefox) | SAFE | yes | Pages load a little slower once. Cookies, history, passwords, sessions and extensions are never touched: only `Cache`, `Code Cache`, `GPUCache` and the Firefox `cache2` folders. |
| App caches (Discord, VS Code, Slack, Teams, Spotify, npm, pip, Yarn, NuGet) | SAFE | yes | The app re-downloads what it needs. |
| Crash dumps and error reports (`CrashDumps`, `WER\ReportArchive/Queue`) | SAFE | yes | Lost diagnostic history. |
| Thumbnail cache (`thumbcache_*.db`) | SAFE | yes | Explorer rebuilds thumbnails. Locked files are skipped. |
| Shader caches (NVIDIA `DXCache`/`GLCache`, AMD `DxCache`/`DxcCache`/`VkCache`, Intel `ShaderCache`, DirectX `D3DSCache`) | SAFE | **no** | The next launch of each game may stutter while shaders rebuild. Roomy leaves this unticked too. |
| Delivery Optimization cache | ADMIN | no | Peers can't fetch updates from this PC for a while. Windows' supported cmdlet is `Delete-DeliveryOptimizationCache`. |
| Windows Update leftovers (WinSxS superseded) | ADMIN | no | `DISM /Online /Cleanup-Image /StartComponentCleanup`. **Never `/ResetBase`**, because it blocks uninstalling existing updates. Never delete WinSxS by hand. |
| Windows.old | ADMIN | no | Removes the way back to the previous Windows version. We open Windows' own Temporary files page. |
| Big downloads (> 100 MB, untouched for 30 days) | REVIEW | never | They're your files, so they go to the Recycle Bin. |
| Old installers (`.exe/.msi/.msix/.iso/.zip` in Downloads, > 30 days) | REVIEW | never | Same. |
| Duplicate large files (≥ 50 MB, byte-confirmed) | REVIEW | never | One copy of each set is always kept. |
| Unused Steam games | REVIEW | never | Removed only through Steam's own `steam://uninstall/<appid>`; we never delete game folders. |

### Never-delete list (enforced in `cleaner/guard.rs`)
- `C:\Windows` (and the Windows dir wherever it lives), `Program Files`, `Program Files (x86)`, `ProgramData` (except the WER report folders), `System Volume Information`, `$Recycle.Bin` (emptied only via the shell API), and the paging, hibernation and swap files.
- The user's profile root, Documents, Desktop, Pictures, Videos, Music and the Downloads folder itself (items inside Downloads are REVIEW-only), plus OneDrive, Dropbox and Google Drive roots.
- Browser profile data outside the cache folders: `Cookies`, `History`, `Login Data`, `Web Data`, `Local Storage`, `IndexedDB`, `Sessions`, `Extensions`, `Bookmarks`, `places.sqlite`, `key4.db`, `logins.json`.
- Reparse points (junctions, symlinks, mount points, OneDrive placeholders): never followed and never deleted through.
- Cloud-only files (`FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS` `0x400000`, `RECALL_ON_OPEN` `0x40000`, `OFFLINE` `0x1000`): skipped entirely. Touching their data would trigger a download.
- Anything outside the detector's own roots, checked again at clean time (not only at scan time).

## 3. Windows APIs and paths

- **Send to the Recycle Bin.** `SHFileOperationW` with `FO_DELETE | FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI` (double-NUL list). `IFileOperation` with `FOFX_RECYCLEONDELETE` is the COM equivalent. Lens uses SHFileOperation because it has no COM apartment requirement on a worker thread.
- **Recycle Bin size and empty.** `SHQueryRecycleBinW(NULL, &info)` → `i64Size` and `i64NumItems`. `SHEmptyRecycleBinW(NULL, NULL, SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND)`.
- **Undo from the Recycle Bin.** Each binned item is a pair in `<drive>\$Recycle.Bin\<SID>\`: `$I……` holds the metadata (v2 layout: version `2`, original size, deletion FILETIME, path length, UTF-16 path), and `$R……` holds the content. Renaming `$R` back to the original path and removing `$I` is what Explorer's "Restore" does. Lens restores only the items it binned in the last 30 seconds.
- **Delete a file.** `std::fs::remove_file` (DeleteFileW). A sharing violation means the file is in use, so it is skipped and reported.
- **Enumerating.** `FindFirstFileExW(FindExInfoBasic, FIND_FIRST_EX_LARGE_FETCH)` is right for reading whole directories on a background thread, and pointless if you stop early (Raymond Chen). MFT enumeration (`FSCTL_ENUM_USN_DATA`) needs an elevated handle to the volume: it is documented as a future fast mode, not shipped.
- **Free space.** `GetDiskFreeSpaceExW` (already exposed by `sys_drives_cmd`).
- **Elevation.** `ShellExecuteW("runas", lens-ui.exe, "--cleaner-elevated <task>")` with an allowlist of two tasks and fixed argv. Nothing from the UI reaches the command line.
- **Steam.** `steamapps\libraryfolders.vdf` lists the libraries. Each `appmanifest_<id>.acf` has `name`, `SizeOnDisk` and `LastUpdated`, and newer clients add `LastPlayed`. Uninstall goes through `steam://uninstall/<appid>`.
- **Explorer.** `explorer.exe /select,"<path>"` opens the folder with the item selected. Drive verb: `HKCU\Software\Classes\Drive\shell\LensUI.Clean` (owned-marker, removed by "Remove all Lens changes").
- **Per-app sizes.** `HKLM/HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\*` (+ `WOW6432Node`): `DisplayName`, `EstimatedSize` (KB), `InstallLocation`, `DisplayIcon`, `UninstallString`.

## 4. Design details (premium-utility study)

**Motion.** Fluent's tokens are `83 / 167 / 250 ms`. Entrances use `cubic-bezier(0,0,0,1)` ("fast out, slow in") and exits use `cubic-bezier(1,0,1,1)`. Lens Cleaner's tokens are `--cl-t-fast 120ms`, `--cl-t-base 220ms`, `--cl-t-slow 420ms` and `--cl-t-count 900ms`, with `--cl-ease-in` (entrance) `cubic-bezier(0,0,0,1)`, `--cl-ease-out` (exit) `cubic-bezier(.3,0,1,1)` and `--cl-ease-move` `cubic-bezier(.2,0,0,1)`. Exits are faster than entrances. Under reduced motion everything is instant and count-ups jump to the final value.

**Numbers.** `font-variant-numeric: tabular-nums` everywhere a number changes, so the digits don't jitter while counting. Count-ups ease out (fast at first, settling at the end) over about 900 ms, and only animate between real values (never from 0 on re-render). Sizes use one decimal place up to 100 and none above that ("32.5 GB", "238 GB").

**Scanning.** Following CleanMyMac and Roomy, show progress as found categories, not a percentage bar. Rows slide in (8 px, 220 ms) with a soft tick when each finishes, and the layout is reserved up front with skeleton rows so nothing shifts.

**Sunburst (DaisyDisk).** Wider petals mean bigger items, siblings are sorted by size, and items too thin to see are merged into one translucent "smaller objects" petal. Clicking the centre goes up a level. Hovering a segment previews it in the side list. Ours adds arrow-key navigation (←/→ siblings, Enter in, Backspace out).

**One button (Smart Care).** Scan, then a single primary action, with tiles you can untick and a Review link. Ours, "Smart Clean", only ever includes SAFE items and always shows the exact list first.

**Keyboard (Raycast).** Every action has a shortcut shown as a key chip next to it, focus is always visible, and Esc always backs out one level.

**Copy tone.** Second person, short and warm, no jargon in titles: "Let's make some room.", "Nothing gets deleted until you say so.", "You're in great shape." Technical detail goes in mono metadata, never in the title.

**Storage settings (Apple, Windows).** Recommendations are framed as decisions with a single obvious action each, and the system categories are shown but locked.

## Sources
- [krezio/roomy](https://github.com/krezio/roomy)
- [Automating Disk Cleanup (Microsoft)](https://learn.microsoft.com/en-us/troubleshoot/windows-server/backup-and-storage/automating-disk-cleanup-tool)
- [Clean Up the WinSxS Folder (Microsoft)](https://learn.microsoft.com/windows-hardware/manufacture/desktop/clean-up-the-winsxs-folder)
- [IFileOperation::SetOperationFlags](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags)
- [SHEmptyRecycleBinW](https://learn.microsoft.com/windows/win32/api/shellapi/nf-shellapi-shemptyrecyclebinw)
- [Monitor Delivery Optimization](https://learn.microsoft.com/windows/deployment/do/waas-delivery-optimization-monitor)
- [Clearing GPU shader cache (rtech.support)](https://rtech.support/guides/clearing-shader-cache/)
- [FindFirstFileExW](https://learn.microsoft.com/windows/win32/api/fileapi/nf-fileapi-findfirstfileexw) and [When to use FIND_FIRST_EX_LARGE_FETCH (The Old New Thing)](https://devblogs.microsoft.com/oldnewthing/20131024-00/?p=2843)
- [Handling placeholders (Microsoft)](https://learn.microsoft.com/en-us/windows-hardware/drivers/ifs/placeholders_guidance)
- [Steam ACF parsing (game-detector crate)](https://docs.rs/game-detector/0.2.1/src/game_detector/steam.rs.html)
- [BleachBit (Wikipedia, licence)](https://en.wikipedia.org/wiki/BleachBit) and [bleachbit/cleanerml](https://www.github.com/bleachbit/cleanerml)
- [CleanMyMac Smart Care](https://macpaw.com/support/cleanmymac/knowledgebase/smart-care)
- [DaisyDisk: Understanding the disk map](https://daisydiskapp.com/guide/4/en/UnderstandingSunburst/)
- [Timing and easing (Windows apps)](https://learn.microsoft.com/en-us/windows/apps/design/motion/timing-and-easing) and [Fluent 2 motion](https://fluent2.microsoft.design/motion)
- [Raycast: a fresh look and feel](https://raycast.com/blog/a-fresh-look-and-feel)
- [Change storage settings on Mac (Apple)](https://support.apple.com/guide/mac-help/change-storage-settings-on-mac-mchl3d437fbc/mac)
- [WizTree vs MFT (WizTree)](https://diskanalyzer.com/)

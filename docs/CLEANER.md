# Lens Cleaner

A drive-space manager in the Lens design language, modelled on the Roomy flow (Home → Scan →
Cleanup / Space map → Done) and taken further: a dry-run preview of every clean, the Recycle Bin
by default for anything that is yours, undo, a sunburst, a timeline, per-app storage and a
Downloads review. The research behind it is in [CLEANER_RESEARCH.md](CLEANER_RESEARCH.md).

**The rule:** Lens Cleaner opens on demand and nothing is deleted without your explicit click.
A scan is read-only. Every clean first shows a dry run built in Rust, and the clean then runs that
same plan by id. The UI never hands a list of paths to the delete step.

## Opening it

| From | How |
|---|---|
| Settings › Storage | "Open Lens Cleaner" (hero tile and the Lens Cleaner section) |
| Lens Command | `/clean` |
| Voice / intents | "free up space", "make some room", "what's taking up space", "empty the recycle bin" (opens the bin preview; you confirm) |
| Top Bar | the low-space pill "C: · 9.6 GB left" (only with the alert on) |
| File Explorer | right-click a drive › "Free up space with Lens" (HKCU verb, off by default) |
| `lens://settings/cleaner` | any Lens link |
| Dock / Launcher | search "Lens Cleaner", "free up space" or "disk space" (the Settings registry entry), or pin the Settings › Storage page |

The window (`label: "cleaner"`, `?surface=cleaner`) is created on first use (`LAZY_LABELS`) and is never built at startup.

## Categories

| Category | Level | Ticked | Method | Where |
|---|---|---|---|---|
| Recycle Bin | SAFE | ✓ | `SHEmptyRecycleBinW` | shell API (size via `SHQueryRecycleBinW`) |
| Temporary files (> 24 h) | SAFE | ✓ | delete per file | `%TEMP%`, `%WINDIR%\Temp` |
| Browser cache | SAFE | ✓ | delete per file | Chromium `Cache`, `Code Cache`, `GPUCache` per profile (Chrome, Edge, Brave, Vivaldi, Opera, Opera GX); Firefox `cache2`. Cookies, history, logins, Local Storage and IndexedDB are refused by the guard. |
| App caches | SAFE | ✓ | delete per file | Discord, VS Code, Slack, Teams (classic), Spotify `Data`, npm `_cacache`, pip, Yarn, NuGet v3-cache, Steam htmlcache |
| Crash reports | SAFE | ✓ | delete per file | `CrashDumps`, WER ReportArchive/ReportQueue (user and machine) |
| Thumbnail cache | SAFE | ✓ | delete per file | `thumbcache_*.db` (locked ones are skipped) |
| Shader cache | SAFE | ✗ | delete per file | NVIDIA DXCache/GLCache (+ LocalLow), AMD DxCache/DxcCache/VkCache, Intel ShaderCache, D3DSCache |
| Windows Update leftovers | ADMIN | ✗ | elevated helper → `DISM /Online /Cleanup-Image /StartComponentCleanup` (never `/ResetBase`) | |
| Delivery Optimization | ADMIN | ✗ | elevated helper → `Delete-DeliveryOptimizationCache -Force` | |
| Old Windows | ADMIN | ✗ | opens `ms-settings:storagecleanup` (Windows removes it) | `Windows.old` (size only) |
| Big downloads (≥ 100 MB, 30 days untouched) | REVIEW | never | to Recycle Bin | Downloads (top level) |
| Old installers (30 days) | REVIEW | never | to Recycle Bin | Downloads: exe, msi, msix, appx, iso, zip, 7z, rar |
| Duplicate files (≥ 50 MB) | REVIEW | never | to Recycle Bin; the oldest copy is always kept | Downloads; size → first/last 64 KB hash → byte-for-byte |
| Unplayed games (60 days) | REVIEW | never | `steam://uninstall/<appid>`: Steam's own uninstaller. Game folders are never deleted. | Steam `libraryfolders.vdf` + `appmanifest_*.acf` |

**Smart Clean** (Ctrl+Enter) runs the SAFE, pre-ticked categories and nothing else. It never
includes REVIEW items, ADMIN items or shader caches, and it shows the exact list first.

## Safety model (`src-tauri/src/cleaner/guard.rs`)

- **Detector mode:** a path must sit strictly inside one of the detector's own roots. It must also be outside every protected tree (Windows, Program Files ×2, ProgramData, System Volume Information, `$Recycle.Bin`, Windows.old and cloud folders), unless that detector's root was declared inside the tree on purpose (Windows\Temp, the WER folders).
- **User mode** (Space map, Biggest files, Downloads review): it refuses the protected trees, plus Documents and AppData. It refuses the folders themselves (profile, Downloads, Desktop, Pictures, Videos, Music, drive roots) and system files (pagefile, hiberfil, swapfile). Your picks go to the Recycle Bin.
- **Always refused:**
  - any `..` component;
  - any browser-private component (Cookies, History, Login Data, Web Data, Local Storage, IndexedDB, Sessions, Extensions, `places.sqlite`, `key4.db`, …);
  - reparse points (never followed, never deleted through);
  - cloud-only files (`RECALL_ON_DATA_ACCESS`, `RECALL_ON_OPEN`, `OFFLINE`), so a clean never triggers a download.
- **Checked twice:** at scan time and again right before each file is touched, after re-reading it with `symlink_metadata`. A file that became a link in between is skipped.
- **Your files:** they go to the Recycle Bin (`SHFileOperationW` with `FOF_ALLOWUNDO | FOF_WANTNUKEWARNING`). A permanent delete needs:
  1. "Delete for good…";
  2. typing a 4-digit one-time code shown only in the confirm step ("Type 4827 to continue");
  3. the hold-to-confirm approval card;
  4. Rust checking that code before anything is touched. The code is random, minted in Rust (`cleaner/confirm.rs`, `cleaner_confirm_code`), handed only to the Cleaner window and never part of the preview. It is tied to that plan and the hash of its exact list (`plan::token_for`), works once, expires after two minutes and is thrown away after three wrong tries. Without the right code `cleaner_run` refuses and nothing is touched; the plan stays so you can get a new code. The list hash alone is never accepted: anything that knows the list could compute it.
- **Undo:** for 30 s after a clean, "Restore from Recycle Bin" puts back exactly the items that clean binned. It reads `$I`/`$R` pairs in your `$Recycle.Bin\<SID>` and never overwrites. The server allows 60 s.
- **Elevation:** one helper, `lens-ui.exe --cleaner-elevated <component-cleanup|delivery-optimization>`, with exactly three arguments and fixed argv in `elevated.rs`. It is started with `ShellExecuteExW("runas")`, so Windows shows UAC. Nothing from the UI reaches its command line.
- **Audit log:** `%APPDATA%\LensUI\cleaner\log\YYYY-MM-DD.log` records every delete, bin, step, skip, undo, move and settings change. Paths only. It is kept for 90 days.
- **Presence:** every run announces itself ("Cleaning 70,473 files", "Windows Update leftovers (Windows asks for permission)", "Freed 32.5 GB") through Lens presence, so Stop works.
- **Remove all Lens changes:** removes the Explorer drive verb. The only OS change Lens Cleaner makes is that HKCU key, and it carries the `LensUIOwned` marker.

## Automatic features (all off by default)

| Setting | What it does |
|---|---|
| Weekly tidy-up | Once a week, cleans SAFE pre-ticked categories **except the Recycle Bin**, then sends a notification. The first run is a week after you turn it on. |
| Low-space alert | Below 10% or 10 GB free: shows the Top Bar pill (`LowSpacePill`) and one notification a day. |
| Daily snapshots | Powers "Where did my space go?": drive usage once a day, plus your top folders after each Space map scan, in `cleaner\history.txt` (120 days, local only). Flags a jump of ≥ 5 GB or ≥ 3% in a day. |
| Explorer drive verb | `HKCU\Software\Classes\Drive\shell\LensUI.Clean`, removed when you turn it off or remove all Lens changes. |

## Standout features

- **Space map:**
  - views: list, squarified treemap (arrow keys move to the nearest cell) and a DaisyDisk-style sunburst (←/→ around a ring, Enter opens, Backspace or the centre goes up, slivers merge into one "Smaller items" petal);
  - Biggest files, with type filters;
  - locked system items are dimmed and can't be selected;
  - the Windows folder carries a hard-link note.
- **Large-file tray:** drag a big file onto "Move to D:", or press Move. The file is copied with a progress ring and checked; then the original goes to the Recycle Bin. It never overwrites (`film (2).mkv`).
- **Per-app storage:** reads the Uninstall keys (`reg query`, read-only) and uses real icons (`extract_icon_for_path`). Each app shows app size plus caches & data. "Uninstall…" asks first, then opens the app's own uninstaller (quoted exe or `MsiExec /X{GUID}` only, no shell).
- **Downloads review** ("What's safe to delete in Downloads?"):
  - every file is judged locally by type, age and last opened, with a plain reason;
  - suggestions are pre-picked, and you confirm through the approval card;
  - no AI call is needed.
- **Share my result:** a 1200×630 PNG drawn in the page from the pack's colours. It is saved under `cleaner\` and opened in the Windows share sheet through the Snip share path. Nothing is uploaded.

## Polish checklist (AAA) — status

| Item | Target | Status / how it's checked |
|---|---|---|
| Motion tokens | `--cl-t-fast 120ms`, `--cl-t-base 220ms`, `--cl-t-slow 420ms`, `--cl-t-count 900ms`; `--cl-ease-in cubic-bezier(0,0,0,1)` (Fluent "fast out, slow in"), `--cl-ease-out cubic-bezier(.3,0,1,1)`, `--cl-ease-move cubic-bezier(.2,0,0,1)` | ✓ `cleaner.css`; exits are shorter than entrances |
| Reduced motion | count-ups jump, animations off | ✓ `prefersReducedMotion()` + CSS for `prefers-reduced-motion` and `data-motion` |
| 4 px grid | all spacing from `--cl-1…--cl-10` | ✓ |
| Tabular numerals | every changing number | ✓ `font-variant-numeric: tabular-nums` on `.cl-app` |
| Contrast ≥ 4.5:1 | text on its real background | ✓ measured (composited): obsidian min 6.0 (ADMIN badge), alabaster min 5.4; meta text uses `--lens-fg-secondary`, never `--lens-fg-muted` |
| Focus rings | visible on every control | ✓ `:focus-visible` with `--lens-focus-ring` / `--lens-focus-width` (High Contrast aware) |
| Hit targets ≥ 32 px | buttons, checkboxes, icon buttons, chips | ✓ measured: 0 interactive elements under 32 px (checkboxes are 32 px with an 18 px box) |
| No layout shift while scanning | fixed-height checklist rows, skeletons | ✓ CLS measured 0.000 through a full scan |
| 60 fps at 4× CPU throttle | scanning screen with live rows | ✓ headless Chrome, 4× throttle: 57.6 fps avg (obsidian), 59.6 (alabaster), p95 frame 16.8 ms |
| First scan of C: < 10 s on an SSD | category scan | **Target, not yet measured on Windows.** Categories run in parallel and only walk their own roots. The Space map engine does about 146k files/s cold and 388k warm on 2 Linux cores (`bench_scan`), so a 600k-file C: should take 2–5 s. Needs measuring on real hardware. |
| Every error has a recovery action | | ✓ scan failed → Try again; clean failed → Try again; map failed → Try again / Rescan; apps → Try again; undo failed → Open Recycle Bin; uninstaller refused → Installed apps; drives unreadable → Try again |
| Copy tone | second person, short, warm | ✓ "Let's make some room.", "You're in great shape.", "Nothing gets deleted until you say so." |
| Keyboard | Space toggles, Ctrl+A all safe, Enter cleans, Ctrl+Enter Smart Clean, Ctrl+R rescan, ↑/↓ rows, →/← expand, Esc back, Backspace up (map) | ✓ (`keyAction` tested) |

## Files

- Rust engine:
  - `src-tauri/src/cleaner/`: `guard`, `walk`, `tree`, `detectors`, `plan`, `bin`, `elevated`, `steam`, `dupes`, `review`, `apps`, `history`, `movefile`, `settings`, `audit`, `win`, plus `tests.rs` with 21 tests and 1 ignored bench.
  - Commands: `src-tauri/src/commands/cleaner.rs`.
- UI: `src/cleaner/`, `src/components/CleanerCard.tsx` and `src/cleaner/LowSpacePill.tsx`.
- Tests: `src/__tests__/cleaner.test.ts`.
- Parity gallery: `tools/parity/cleaner/` (18 scenes × 2 packs, plus Expressive and Dot Matrix variants). `RECORD=1` records the whole flow.
- Guide lesson: `guide/12-free-up-space.md`.

## Needs real hardware

- Timing of the first C: scan, and the elevated helper's UAC flow.
- Restoring from the Recycle Bin through `$I`/`$R`, including bins on several drives.
- `SHFileOperationW` with OneDrive-backed Downloads.
- Steam `LastPlayed` across client versions.
- Icon extraction for MSIX apps, which have no `DisplayIcon`.

MFT fast mode (`FSCTL_ENUM_USN_DATA`, admin) is documented in the research doc and not shipped.
The scanner uses std's `FindFirstFileExW`-based `read_dir` in parallel.

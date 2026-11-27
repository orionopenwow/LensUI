# Lens Cleaner — feature dossier

Status date: 2026-11-26 (main at `6e7abb0`). **Fable pass (PR #112, 26 November 2026):** permanent delete needs a random one-time code minted in Rust and typed by the person (S1 fixed), the measured scan time shows on Done and in Tester Hub (quick win 1), "Uninstall…" hands over to Startup & Uninstall, and Home has the "Where did my space go?" timeline (the idea in section 6). Compiled and tested by CI only; not confirmed on a real PC. **Deep Fable pass (apps, 26 November 2026):** the app moves on the global motion tokens (brief item 1), every swallowed error is reported (quick win 3; a Stop that doesn't reach the scan says the scan is still going), every button declares a press weight. Sources: `docs/CLEANER.md`, `docs/CLEANER_RESEARCH.md`,
`docs/brain/BUGS.md`, Redline review, code below.

## 1. Rundown

**What it is.** A safe disk cleaner and space explorer: category clean (bin, temp, browser and
app caches, crash reports, thumbnails, shaders, admin-only Windows leftovers), review items you
pick yourself (big downloads, old installers, duplicates, unplayed Steam games), a Space map
(list, treemap, sunburst), per-app storage, a large-file mover, Downloads review, undo from the
Recycle Bin, and opt-in automation (weekly tidy-up, low-space alert, daily snapshots).

**Who it's for.** Everyone with a full drive, especially people who don't trust cleaners.

**Where it lives.**

| Part | Paths |
|---|---|
| Engine | `src-tauri/src/cleaner/{guard,walk,tree,detectors,plan,bin,elevated,steam,dupes,review,apps,history,movefile,settings,audit,win}.rs`, `tests.rs` (21 + 1 bench) |
| Commands | `src-tauri/src/commands/cleaner.rs` |
| UI | `src/cleaner/{CleanerApp,CleanerSurface,Home,Scanning,Cleanup,PreviewSheet,Done,Extras,SpaceMap,SettingsPanel,LowSpacePill,ui}.tsx`, `model.ts`, `api.ts`, `cleaner.css`; `src/components/CleanerCard.tsx` |
| Tests | `src/__tests__/cleaner.test.ts`; parity `tools/parity/cleaner/` (18 scenes × 2 packs + variants) |
| Data | `%APPDATA%\LensUI\cleaner\log\YYYY-MM-DD.log` (90 days), `cleaner\history.txt` (120 days) |

## 2. Feature tree
- **Opening** — works: Settings › Storage, `/clean`, voice ("free up space"), Top Bar low-space
  pill, Explorer drive verb (opt-in), `lens://settings/cleaner`, Dock/Launcher search. Window is
  lazy (`LAZY_LABELS`), never built at start-up.
- **Categories** — works:
  - SAFE pre-ticked: Recycle Bin (`SHEmptyRecycleBinW`), Temp > 24 h, browser cache (Chromium
    profiles + Firefox cache2; cookies/history/logins/storage refused), app caches (Discord, VS
    Code, Slack, Teams, Spotify, npm, pip, Yarn, NuGet, Steam htmlcache), crash reports,
    thumbnail cache (locked skipped).
  - SAFE not ticked: shader caches (NVIDIA/AMD/Intel/D3D).
  - ADMIN: Windows Update leftovers (DISM StartComponentCleanup, never ResetBase), Delivery
    Optimization, Old Windows (opens Windows' own cleanup).
  - REVIEW never ticked: big downloads (≥100 MB, 30 d), old installers (30 d), duplicates (≥50 MB,
    hash then byte-for-byte, oldest kept), unplayed games (60 d, Steam's own uninstaller).
- **Smart Clean** (Ctrl+Enter) — works: SAFE pre-ticked only, shows the list first.
- **Safety model** (`guard.rs`) — works:
  - detector roots only, protected trees refused (unless declared), user-mode refusals, `..`,
    browser-private components, reparse points never followed, cloud-only files never touched;
  - checked twice (scan and right before touch with `symlink_metadata`);
  - your files → Recycle Bin; permanent delete needs 4 steps: a typed one-time code from Rust
    (`confirm.rs`: random, one plan and list hash, single use, 2 minutes, 3 tries), then
    hold-to-confirm; the list hash (`plan.rs token_for`) alone is never accepted;
  - undo 30 s (server 60 s) from `$I/$R` pairs, never overwrites;
  - one elevated helper with fixed argv via UAC;
  - audit log (paths only); presence announcements with Stop.
- **Automatic** (all off) — works: weekly tidy-up (never the bin), low-space alert (pill + one
  notification a day), daily snapshots ("Where did my space go?", ≥5 GB or ≥3 % jump), Explorer
  drive verb (HKCU, `LensUIOwned`, removed by Remove all).
- **Space map** — works: list, squarified treemap (arrow keys), sunburst (←/→, Enter, Backspace,
  "Smaller items" petal), Biggest files with type filters, locked items dimmed, hard-link note on
  Windows.
- **Large-file tray** — works: copy with progress → verify → bin original; never overwrites.
- **Per-app storage** — works: Uninstall keys read-only, real icons, app size + caches;
  "Uninstall…" opens Startup & Uninstall on that app (the one uninstall path; Fable pass).
  MSIX icons — unverified.
- **Downloads review** — works: local judgement with plain reasons, pre-picked, approval card,
  no AI.
- **Share my result** — works: 1200×630 PNG, Windows share sheet, nothing uploaded.
- **AAA checklist** — ✓ motion tokens, reduced motion, 4 px grid, tabular numerals, contrast,
  focus rings, 32 px targets, CLS 0, 60 fps at 4× throttle, recovery on every error, warm copy,
  full keyboard. First C: scan < 10 s — **unmeasured on Windows**.
- **MFT fast mode** — not built (documented).

## 3. Quick wins (≤ 1 day, ranked)
1. **Done (Fable pass).** **Show the measured scan time** in the Done screen and Tester Hub ("Scanned C: in 3.4 s") so
   the < 10 s target is visible on real PCs.
2. **Weekly tidy-up summary in the Dashboard Today lane** ("Lens freed 2.1 GB on Sunday").
3. **Done (deep Fable pass).** **Toasts for swallowed errors** in `src/cleaner/*` and `CleanerCard.tsx`.
4. **Skipped, with a finding.** **OneDrive-backed Downloads** note. `detectors::Ctx` takes Downloads
   to be `%USERPROFILE%\Downloads`; a Downloads folder that was moved (OneDrive, another drive) is
   not looked at at all, so a note would be wrong more often than right. The real fix is a
   known-folder lookup (`SHGetKnownFolderPath(FOLDERID_Downloads)`) in `detectors.rs`, then the note;
   that changes which folder the Downloads review reads, so it needs a real PC, not a blind edit.
5. **Already there.** **Space map breadcrumbs** (`cl-crumbs` above the list, treemap and sunburst).

## 4. Polish assessment
- **Motion:** done (deep Fable pass): `--cl-t-*` and `--cl-ease-*` are now the global tokens under
  their old names, so timings match Lens and collapse with reduced motion. Left: the long ambient
  loops (drift, breathe, shimmer) and stagger steps still use literal times.
- **Copy:** warm and plain ("Nothing gets deleted until you say so.") — the best copy in Lens.
- **Visual parity:** 18 scenes × 2 packs; add high contrast and the Expressive/Dot Matrix packs to
  the golden job (currently gallery only).
- **A11y:** sunburst/treemap keyboard is good; ensure each cell has an accessible name with size.
- **Perf:** scanning at 60 fps throttled; Space map engine 146k files/s cold (Linux) — measure on
  NTFS.
- **Consistency:** approval card usage matches the shared card; the low-space pill should use the
  Top Bar pill component (same as update pill).

## 5. Bug assessment
| Id | Severity | Where | Issue |
|---|---|---|---|
| S1 | — fixed (Fable pass) | `cleaner/confirm.rs`, `commands/cleaner.rs`, `PreviewSheet.tsx` | the confirm token was a deterministic hash of the path list and was returned in the preview. Now a random 4-digit code is minted in Rust for the Cleaner window only (`cleaner_confirm_code`), typed by the person and redeemed in `cleaner_run` before anything is touched: one plan, one list hash, one use, two minutes, three tries. A wrong or missing code deletes nothing. Tests: `cleaner::confirm::tests` (7) |
| Suspected S2 | Low | `bin.rs` undo | bins on several drives (`D:\$Recycle.Bin`) — undo path unverified |
| Suspected S3 | Low | `apps.rs` | MSIX apps have no `DisplayIcon` → blank icons |
| Suspected S4 | Low | `steam.rs` | `LastPlayed` format differences across Steam client versions could mark played games as unplayed (review-only, never auto) |
| B-18 share | — fixed (deep Fable pass) | `src/cleaner/*`, `CleanerCard.tsx` | swallowed errors: zero left (`appsFamily.test.ts`) |
| Suspected S5 | Medium | `cleaner/detectors.rs` (`Ctx::from_env`) | Downloads, Documents, Desktop, Pictures are assumed to sit under `%USERPROFILE%`. A moved Downloads folder is never reviewed ("why is nothing found"), and protected-tree rules name the old place. Found by reading in the deep Fable pass; not changed blind |

## 6. One idea to push to main
**"Where did my space go?" timeline** on the Home screen using the existing daily snapshots: a
small 30-day sparkline per drive with the biggest jumps labelled by folder, one click to open the
Space map at that folder. Data is already collected (opt-in); this makes it visible.

## 7. Test plan
**Unit:** `keyAction` map; plan composition (Smart Clean never includes REVIEW/ADMIN/shaders);
review reasons; share PNG layout; settings round-trip.
**Rust:** guard matrix (every protected tree, `..`, reparse, cloud attributes, browser-private
names) — extend with junctions inside Temp and long paths (>260); dupes with equal size different
content; movefile name collisions; undo with missing `$I`; token mismatch → falls back to bin;
elevated argv fixed.
**Parity:** every scene × obsidian/alabaster/high contrast; Space map large trees.
**Windows E2E:** scan with a seeded temp tree → clean SAFE → files in bin → undo restores →
audit log lines; permanent delete flow refuses without token; Explorer verb on/off → registry
present/absent → Remove all removes.
**Hyper rows:** every `cleaner.*` setting set/verify/restore; invariant "no delete outside roots".
**Manual:** first C: scan time on your SSD; UAC flow for Windows Update leftovers; OneDrive
Downloads; Steam unplayed games; MSIX app icons; multi-drive bin undo.

## 8. Suggested overhaul
- **Phase 1:** global motion tokens; server-minted delete nonce; scan-time readout; cloud note.
- **Phase 2:** space timeline; Dashboard summaries; scheduled tidy-up preview notification
  ("Sunday: will clean 1.8 GB — Review").
- **Phase 3:** MFT fast mode (admin, opt-in) for very large drives; per-app cache rules shared
  with Lens Apps catalogue.
- **Risks:** any widening of delete roots; UAC prompts must stay explicit.

## 9. Fable pass brief
```
Feature: Lens Cleaner. Code: src-tauri/src/cleaner/*, commands/cleaner.rs, src/cleaner/*.
Do:
1. Move --cl-t-* motion tokens onto the global motion tokens (same feel).
2. Server-minted nonce for permanent delete (store with plan; keep path-list binding).
3. Scan-time readout (Done screen + Tester Hub).
4. Cloud-folder note for OneDrive Downloads.
5. "Where did my space go?" sparkline from daily snapshots.
6. Toasts for 13 swallowed errors.
Check: bun test src; cargo cleaner tests; parity cleaner (+high contrast).
Manual: first C: scan time, UAC flow, multi-drive undo.
Don't: widen delete roots; follow reparse points; touch cloud-only files; delete without the bin by default.
```

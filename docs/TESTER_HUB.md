# Tester Hub

The Tester Hub gives the person testing Lens on real Windows one place for:

- what changed in this build;
- a checklist for today, with Pass / Fail / Skip, notes and screenshots;
- the session log, with a "Mark moment" button;
- a one-click, redacted test report.

It lives in **Settings › About & Testing**, and as a small standalone window (`?surface=testerhub`).

Nothing in it captures the screen or uploads anything.

## How the pieces fit

| Piece | File | What it does |
|---|---|---|
| Build notes generator | `tools/changelog/gen.mjs` | Writes `src/tester/buildInfo.ts` at build time: version, git sha, date, the last 50 commits (subject, files, PR number), plus `docs/tester/LATEST.json`. If that file is missing, it uses `docs/tester/LATEST.example.json`. Works offline. |
| Daily notes | `docs/tester/LATEST.json` | Written each morning (5:13 am Phoenix) by the *Lens daily research lookout and tester notes* scheduled task, on branch `research/daily`. Schema below. |
| Model (pure) | `src/tester/model.ts` | Area grouping, `LATEST.json` validation with per-entry fallback, checklist progress and filters, report and issue text. Covered by `src/__tests__/tester.test.ts`. |
| UI | `src/tester/TesterHub.tsx`, `TesterHub.css`, `TesterHubCard.tsx`, `TesterHubSurface.tsx` | The four tabs, plus `TesterBadge` for the top bar. |
| Client | `src/tester/api.ts` | Every call degrades gracefully. Without the backend, results fall back to `localStorage`. |
| Core (std-only Rust) | `src-tauri/src/tester/mod.rs` | Redaction, minimal JSON parse/serialise, the 2,000-line log ring, atomic results persistence, the stored-zip writer and reader, and the issue URL. It has 15 unit tests; run them standalone with `rustc --edition 2021 --test src-tauri/src/tester/mod.rs`. |
| Commands | `src-tauri/src/commands/tester.rs` | `tester_results_get`, `tester_results_set`, `tester_log_get`, `tester_log_push`, `tester_log_mark`, `tester_environment`, `tester_export_plan`, `tester_export_report`, `tester_reveal_report`, `tester_open_issue`. |
| Gallery | `tools/parity/tester/` | Screenshots of every tab in each preset (`node tools/parity/tester/build.mjs && node tools/parity/tester/shoot.mjs`). |

### `LATEST.json` schema

```json
{ "date": "YYYY-MM-DD", "build_ref": "sha or branch",
  "changes": [{ "area": "Dock", "title": "…", "detail": "…", "pr": 8 }],
  "test_steps": [{ "id": "dock-style-switch", "area": "Dock", "steps": "…", "expected": "…", "risk": "high" }],
  "known_issues": ["…"] }
```

Bad entries are dropped one by one and the rest still shows. Specifically:

- an unknown `risk` becomes `med`;
- a duplicate step id is skipped;
- a file over 50 KB is ignored at build time.

### Privacy rules (enforced in Rust, not the UI)

- **Text redaction.** Every text file in the report passes through `redact_text`, which removes:
  - the user profile path (it becomes `%USERPROFILE%`);
  - other `\Users\<name>` paths;
  - e-mail addresses;
  - well-known token prefixes (`sk-ant-`, `sk-`, `ghp_`, `github_pat_`, `xox?-`, `AKIA`, `AIza`, JWTs, `hf_`, `glpat-`);
  - bearer tokens;
  - `key=value` pairs whose key looks secret.

  Hotkey and shortcut settings are deliberately not treated as secrets.
- **Config redaction.** Config is parsed and walked. Secret keys become `"[redacted]"`. Content keys (clipboard, shelf, history, recent, notes, transcript, prompt, messages) become `"[removed]"`. Config that can't be parsed is never exported raw.
- **The log** is redacted when each line is recorded, and again at export.
- **Screenshots** must be image files the tester dropped onto a step: at most 12, and at most 15 MB each. Lens never captures the screen.
- **The zip** goes to `%USERPROFILE%\Downloads`.
  - It never overwrites an existing file; it adds ` (2)` and so on.
  - It is read back and checked before being written.
  - Its DOS timestamps are fixed, so the only time stamp is in `report.md`.
- **"Report an issue"** opens a fixed GitHub URL (`orionopenwow/LensUI`) with the title and body prefilled and redacted. The tester drags the zip in.

## Snippets for shared files

These are deliberately **not** applied on this branch, to avoid conflicts with `integration/waves-4-6`. Apply them in this order.

### 1. Register the module and commands (`src-tauri/src/lib.rs`, `src-tauri/src/commands/mod.rs`)

```rust
// lib.rs, with the other `mod` lines
mod tester;
```

```rust
// commands/mod.rs
pub(crate) mod tester;
```

```rust
// lib.rs, inside tauri::generate_handler![ … ]
commands::tester::tester_results_get,
commands::tester::tester_results_set,
commands::tester::tester_log_get,
commands::tester::tester_log_push,
commands::tester::tester_log_mark,
commands::tester::tester_environment,
commands::tester::tester_export_plan,
commands::tester::tester_export_report,
commands::tester::tester_reveal_report,
commands::tester::tester_open_issue,
```

`src/types/generated.ts` is already regenerated on this branch. Run `bun run gen:types` again after merging.

### 2. Settings card (`src/surfaces/ControlCenterSurface.tsx`)

Add an **About & Testing** nav entry and mount the card. If the integration branch already has an About tab, mount the card there instead.

```tsx
import { TesterHubCard } from "../tester/TesterHubCard";
import { FlaskConical } from "lucide-react";
// nav list
{ id: "about", label: "About & Testing", icon: <FlaskConical size={15} strokeWidth={2.2} color="#FBBF24" /> },
// content
{tab === "about" && (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <TesterHubCard />
  </div>
)}
```

The existing **Self-Test** card in *Windows & Quick* can stay; the hub's Report tab calls the same `run_self_test_cmd`.

### 3. Build notes in release builds (`package.json`)

```json
"scripts": {
  "prebuild": "node tools/changelog/gen.mjs",
  "parity:tester": "node tools/parity/tester/build.mjs && node tools/parity/tester/shoot.mjs"
}
```

`bun run build` runs `prebuild` automatically. The committed `src/tester/buildInfo.ts` is a dev placeholder. To avoid committing the generated copy after a local build, run `git update-index --skip-worktree src/tester/buildInfo.ts` once, or commit it on release branches only.

In CI (`.github/workflows/build.yml`), the release job should fetch the daily notes before building:

```yaml
- name: Bundle the latest tester notes
  run: |
    git fetch --depth=1 origin research/daily || true
    git show origin/research/daily:docs/tester/LATEST.json > docs/tester/LATEST.json 2>/dev/null || true
- run: node tools/changelog/gen.mjs
```

Add the gallery to the parity job:

```yaml
- run: node tools/parity/tester/build.mjs && node tools/parity/tester/shoot.mjs
```

### 4. Standalone window (`src/main.tsx`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`)

```tsx
// main.tsx surfaces map
testerhub: lazy(() => import("./tester/TesterHubSurface").then((m) => ({ default: m.TesterHubSurface }))),
```

Window: label `testerhub`, `url: "index.html?surface=testerhub"`, 760×860, `visible: false`, `decorations: false`, `transparent: true`, `skipTaskbar: false`, built lazily on first open.

- Add `"testerhub"` to the capability's `windows` list.
- Open it from the tray menu (**Tester Hub…**) and from the top-bar badge.

### 5. Tester mode (`src-tauri/src/config.rs`, `src/types/lens.ts`)

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TesterConfig {
    /// Shows the "TEST BUILD <sha>" badge and enables the Mark-moment hotkey.
    pub enabled: bool,
}
// in LensConfig
#[serde(default)]
pub tester: TesterConfig,
```

```ts
// lens.ts, LensConfig
tester?: { enabled: boolean };
```

A toggle at the top of the hub card:

```tsx
<div className="cc-row">
  <div><div className="cc-label">Tester mode</div>
  <div className="cc-desc">Shows a TEST BUILD badge in the top bar and turns on Ctrl+Alt+M to mark a moment in the log.</div></div>
  <button type="button" className={`cc-toggle ${config.tester?.enabled ? "on" : ""}`} aria-pressed={!!config.tester?.enabled}
    onClick={() => updateConfig({ ...config, tester: { enabled: !config.tester?.enabled } })} />
</div>
```

### 6. Top-bar badge (`src/surfaces/TopBarSurface.tsx`)

Put it at the far right of the right group, before the clock. It is hidden unless tester mode is on.

```tsx
import { TesterBadge } from "../tester/TesterHub";
{config.tester?.enabled && <TesterBadge onClick={() => invoke("open_surface_cmd", { label: "testerhub" }).catch(() => {})} />}
```

Use whichever command already opens lazy windows. The integration branch names it `show_surface_cmd` / `open_settings_tab_cmd`.

### 7. Mark-moment hotkey (`src-tauri/src/app/setup.rs`)

Register only while `config.tester.enabled` is on, and unregister when it's turned off (same pattern as the other global shortcuts):

```rust
let mark = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyM);
// on press:
let line = crate::tester::log("mark", "tester", "Marked moment (Ctrl+Alt+M)");
let _ = app.emit("lens://tester/marked", line.seq);
```

The hub's log tab polls every 2 s, so the mark shows up without extra wiring. If a surface wants a toast, listen for `lens://tester/marked`.

### 8. Feed the session log

There is no logging crate in Lens yet. `crate::tester::log(level, area, message)` is a cheap, redacting ring buffer that never panics. Call it where Lens already reports problems, for example:

```rust
// app/setup.rs, after startup
crate::tester::log("info", "app", &format!("Lens {} started ({})", env!("CARGO_PKG_VERSION"), crate::commands::misc::windows_build_string()));
// wherever an `eprintln!` reports a failure today:
crate::tester::log("warn", "wallpaper", &format!("attach failed: {e}"));
```

```ts
// src/main.tsx: frontend errors
window.addEventListener("error", (e) => invoke("tester_log_push", { level: "error", area: "ui", message: String(e.message) }).catch(() => {}));
window.addEventListener("unhandledrejection", (e) => invoke("tester_log_push", { level: "warn", area: "ui", message: String(e.reason) }).catch(() => {}));
```

To route the panic hook too, add `crate::tester::log("error", "panic", &info.to_string());` inside the existing hook. It is safe there: the hook only takes a mutex with poisoning tolerated.

### 9. Backup and uninstall

`%APPDATA%\LensUI\tester\` holds only checklist results. Add it to the backup set in `win_backup.rs`. "Remove all Lens changes" does not need to delete it, because it is Lens data, not an OS change.

## Not done here

- **No file picker for screenshots.** Lens has no dialog plugin, so screenshots are attached by dropping image files onto a step. They come through the window's drag-drop event.
- **Crash reports.** PR #3 adds `win_crash`. Once it's merged, add a "Crash reports" row to the Report tab that calls its list command, and include the newest crash's redacted summary in the zip (`plan_report` takes another generated entry).

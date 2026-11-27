# Lens Mission Control

The maintainer's private admin window for running the Lens project: CI, pull requests, bugs, what the agents suggest next, real-PC checks, the roadmap, quality, releases, the dev folder, the Lens running on this PC and the project brain, in one Lens-styled window.

It is **developer-only by construction**. It exists only in the dev build that `Launch-Lens-UI.bat` starts, and no release, installer or edition can contain it.

| | |
|---|---|
| Opened from | Tray › **Mission Control (dev)** · Command: type **mission control** (or `/mission`) · optional hotkey (Setup page; none by default) |
| Frontend | `src/missioncontrol/` (surface `missioncontrol`, view models in `model/`, sample data in `mock.ts`) |
| Backend | `src-tauri/src/mission/` (Cargo feature `admin`), commands `mc_*` |
| Local data | `<dev folder>/.dev/mission-control/` (gitignored): `cache/`, `audit.jsonl`, `drafts/`, `prefs.json`, `decisions.json`, `checks.json`, `trend.json`, `flakes.json` |
| Tests | Rust `mission::*` (`cargo test --lib --features admin mission::`), bun `src/__tests__/missionControl.test.ts`, parity `tools/parity/mission/shoot.mjs`, visual goldens `mission-*` in `tools/visual/run.mjs`, guard `tools/mission/guard.mjs` |

## 1. How it is kept out of releases

| Layer | What keeps it out |
|---|---|
| Rust | `src-tauri/src/mission/` is compiled only with `--features admin`. `admin` is not a default feature and nothing depends on it. With `admin` and no debug assertions (any release profile) the crate refuses to compile (`compile_error!` in `mission/mod.rs`). Its commands are a second invoke handler composed in `lib.rs` only under the feature; its tray entry and hotkey exist only under the feature. The window is declared in `tauri.conf.json` with `"create": false` (every window shares one WebView2 environment) and is built only by `mission::open`; it is not in `LAZY_LABELS`, so no generic path can create it. |
| Frontend | `vite.config.ts` defines `__LENS_ADMIN__` as `true` only for the **dev server** (`command === "serve"`) with `LENS_ADMIN=1`. Every `vite build` gets `false`, so the `missioncontrol` entry in `src/main.tsx` and the Command phrase are dead code and the chunk is not emitted. |
| Launcher | `Launch-Lens-UI.bat` sets `LENS_ADMIN=1` and runs `bun run tauri dev --features admin`. `Build-Lens-UI.bat` and `release.yml` never do. |
| CI | `tools/mission/guard.mjs dist` runs after the Windows job's frontend build and in `release.yml` before and after the installer build. It fails if any build/release config enables `admin` or `LENS_ADMIN`, if the window isn't `"create": false`, or if the built bundle contains Mission Control's code. Rust `mission::gating_tests` check the same configs. |

The only traces in a release are names, no code: the `missioncontrol` window declaration (`"create": false`, never built) and its label in `capabilities/default.json`. In a release, `?surface=missioncontrol` would fall back to the Dock page, and nothing opens it.

## 2. Setup (once per PC)

1. Start the dev build with `Launch-Lens-UI.bat`. Open Mission Control from the tray.
2. On GitHub: **Settings › Developer settings › Fine-grained tokens › Generate new token**. Resource owner `orionopenwow`, **Only select repositories › LensUI**, expiry 90 days. Repository permissions:

| Permission | Access | Used for |
|---|---|---|
| Metadata | Read | required for every token |
| Contents | Read and write | docs on other branches; draft PRs (QUEUE.md, dossier results); tags |
| Pull requests | Read and write | the PR board, comments, merge |
| Issues | Read and write | the bugs inbox, labels, closing with a note |
| Actions | Read and write | check runs, job logs, re-run failed jobs |
| Checks | Read | check runs per commit |
| Commit statuses | Read | status of main |
| Pages | Read | Pages deploy on Pulse |
| Secrets | Read | secret **names** for the release checklist (GitHub never returns values) |
| Variables | Read | whether `TAURI_UPDATER_PUBKEY` is set |

   For read-only use, set every "Read and write" to "Read": write buttons then fail with 403 and say so.
3. Paste it on **Setup & audit** (or the banner on any page) and press **Save in Credential Manager**. Mission Control checks it with `GET /user`.
   - Alternative: if the GitHub CLI is signed in, **Use gh CLI instead** (`gh auth token`, fixed arguments, run only when no token is stored).
4. Optional: pick a hotkey on Setup (Ctrl+Alt+Shift+M, Ctrl+Win+Alt+M or Ctrl+Alt+Shift+F12). Ctrl+Alt+M is the tiler's Monocle key, so it is not offered. Every choice is checked against Lens's own keys (tiling, automatic tiling, approval window, reserved keys) and registration failure is reported.
5. The dev folder is found automatically (the folder the dev build was compiled from). To use another checkout, set `"repoRoot"` in `.dev/mission-control/prefs.json`. Extra known flakes go in `"knownFlakes": ["…"]` there.

**The token** lives only in Windows Credential Manager as the generic credential `LensMissionControl:github` (current user, this PC). It is never written to a file, a log, the audit log, a cache entry or an export. It leaves `mission/cred.rs` only as the `Authorization` header of requests to `api.github.com`; job logs redirect to blob storage and that redirect is followed by hand **without** the header. **Forget token** on Setup deletes it. Remove all Lens changes does not touch it (it is a dev-build credential); forget it there or in Windows' Credential Manager.

## 3. Where the data comes from

| Data | Source |
|---|---|
| CI, PRs, checks, logs, issues, releases, Pages, stars, secrets/variable names | GitHub REST for `orionopenwow/LensUI` only (`ghpath::get_path_ok` refuses other paths), through the cache |
| Repo docs on `main` (BUGS.md, `docs/features/*`, CHANGELOG, MASTERPLAN, FABLE_NEXT, QUEUE.md) | `git show origin/main:<path>` in the dev folder → the working tree → the contents API |
| Research (IDEAS_BACKLOG, daily notes, tester `LATEST.json`) | branch `research/daily` (`git show origin/research/daily:…`, then API) |
| Combinator (CATALOG.md, scans) | branch `research/combinator` (missing until the scan's first run; the page says so) |
| COMBINATOR.md / MODULES.md | `main`, else branch `brain/combinator-plan` |
| Dev folder status, branches, recent commits | `git` with fixed argument lists (`mission/gitargs.rs`), no shell, `GIT_TERMINAL_PROMPT=0` |
| Local Lens | the running process: session log ring, `lens.log` tail, crash reports, config (redacted with the Tester Hub redactor), flags with defaults, kill switches (`features.json`), change registry |

**Caching and rate limits.** Every GET is cached in `.dev/mission-control/cache/` with its ETag. Fresh entries (60 s for PRs/checks/runs, 10 min for releases/Pages/secrets, 5 min otherwise) are served without a request; older ones are revalidated with `If-None-Match` (a 304 costs no rate limit). Below 50 requests left, only the cache is served. Finished job logs are cached for good. **Offline**, every page shows its cached data and the title bar says "offline · showing cached data".

## 4. Pages

| Page | What it does |
|---|---|
| **Pulse** | main's CI (latest commit's check runs), Pages deploy, open PRs with READY / WAIT / BLOCKED, latest release and channel, dev folder vs main, open bugs by severity, today's research top 3, stars/issues trend (one point a day from the cached repo answer). |
| **Pull requests** | Board by state. Per PR: summary, files, checks with log excerpts for failures (known/likely flakes marked), the PR body's "Needs a real PC" list as a checklist. Actions: re-run failed jobs (per workflow run), comment, merge **pinned to the head SHA you are looking at** (two-step confirm; offered only for READY). Never auto-merges. |
| **Bugs** | One inbox: GitHub issues labelled `tester-report` or `bug` (in-app "Report a problem" issues carry these), BUGS.md rows (open/fixed, severity, ids), crash reports on this PC. Triage: add labels, link a PR (comment), close as fixed / not planned with a note, queue for the next wave. |
| **Suggestions** | The recursive self-improvement feed: research IDEAS_BACKLOG, combinator top candidates (score ≥ 60), "what is left" lists (features README, FABLE_NEXT), dossier quick wins. Merged (same idea from several sources ranks higher), ranked by source score + effort. Accept → queue, defer (sinks), reject with a reason. **Open queue PR** writes `docs/brain/QUEUE.md` (Queued + Rejected with reasons) on a `mission/queue-<date>` branch; the research lookout and combinator scan should read its Rejected list (owner: add that line to their prompts). |
| **Real-PC checks** | Every "needs a real PC" item from open PRs, the last 20 merged PRs and the dossiers, as one checklist: pass / fail / skip, notes, screenshot (downsized, kept locally). Post results as a PR comment (confirm first), or write them into the dossier as a draft PR. |
| **Roadmap** | MASTERPLAN roadmap, COMBINATOR horizons, MODULES phases, the dossier status table, and the feature-flag matrix (settings switches with defaults and this PC's value, plus kill switches). |
| **Quality** | Test counts from the newest `build` run on main, the flaky-test leaderboard (a scenario failed, then the same job passed on a rerun, over the last 30 runs; scenarios with ≥ 2 flakes are marked "likely flake" on PRs), perf budgets from the newest `robustness` run, rig summaries (theme switching, hyper suite), golden diffs. |
| **Releases** | CHANGELOG Unreleased, version bump helper, release checklist (main green, changelog, version, signing secret **names**, updater pubkey variable set, no blocked PRs), tag creation at main's head (owner action, two-step), channel view (stable/beta/draft, `latest.json` present), kill switches. |
| **Dev folder** | Branch, changes, behind/ahead of main, last fetch, **Sync to main** (fetch + fast-forward only; refused when dirty, not on main, or diverged), rebuild and relaunch (runs Launch-Lens-UI.bat), clear Mission Control's cache, `.dev/` contents. |
| **Local Lens** | Running state, live session log with level and text filters, settings (redacted, read-only), flag switches and "edit another setting" through the one settings writer after a confirm, the Remove-all dry run (what it would undo, nothing is run), `lens.log` tail, Tester Hub shortcut. |
| **Schedules & agents** | Last runs of the research lookout, combinator scan and brain refresh (from their branches' last commits), agent branches by family (`feature/`, `fable/`, `wave/`, `site/`, `research/`, `run/`, `fix/`, `brain/`) with their PRs, and **Copy brief**: a Markdown brief of blocked PRs, top bugs, top suggestions, the queue and today's research, for pasting into a Claude session. |
| **Brain** | Reader and search over IDENTITY, DESIGN, AGENTS, the brain docs, COMBINATOR, MODULES, MASTERPLAN and every dossier. |
| **Setup & audit** | Token, hotkey, folders, where each document was read from (and what is missing), and the audit log. |

Keyboard: ↑/↓ (Home/End) move through the sidebar, **Ctrl+1…9** jump to the first nine pages, **Ctrl+R** or **F5** refresh everything, **/** focuses the page's search, **Esc** closes the confirm sheet. Every control is reachable with Tab and named.

## 5. Safety

- **Read-only by default.** Nothing changes until you press a write button.
- **Every write is planned first.** The page asks Rust for a plan (`mc_plan`), which validates the action and lists exactly what will happen: the HTTP method and endpoint, the commit SHA, the comment text, the branch that moves. You confirm; heavy actions (merge, tag, close, relaunch) need a second press. Only `mc_apply(id)` runs a plan: the id is one-time and expires after two minutes, and the planned action is run exactly as shown.
- **Merges are pinned** to the head SHA on screen (`PUT …/merge` with `sha`), so a push in between makes GitHub refuse.
- **Sync never loses work:** fast-forward only, refused when anything is uncommitted, when not on main, or when local main has commits origin doesn't.
- **Drafts are docs only:** draft PRs may write only `docs/**/*.md`, always on a `mission/<name>` branch, and are never merged by Mission Control.
- **Settings edits** go through `save_config_cmd`, the same path (and validation, backup, Safe Mode handling) as Settings.
- **Audit log:** every plan, apply, cancel and token change is appended to `.dev/mission-control/audit.jsonl` (secrets masked).
- **Git:** fixed argument lists only; refs and paths are validated (no leading `-`, no `..`, a small character set).

## 6. Development

- Run on sample data in a browser: `node tools/robust/build.mjs`, then open `tools/robust/out/harness.html?surface=missioncontrol&mcmock=1&page=prs` through a static server, or run `node tools/parity/mission/shoot.mjs` (every page × three packs, the confirm sheet, onboarding and a keyboard pass).
- Goldens: the `mission-*` states in `tools/visual/run.mjs` are recorded on CI. A run with new or changed renders prints them as `VISUALB64|…` lines; rebuild with `node tools/visual/from-log.mjs job.log tools/parity/golden`.
- `src-tauri/src/mission/` keeps pure logic (git args, PR classification and flakes, parsers, plans, audit, GitHub path rules) free of I/O so it is unit-tested without Windows.

### Deferred

- The 90 ms minimum visible press (DESIGN.md §5.1) needs the UI-kit press primitive from `design/feel`; Mission Control uses CSS press weights until then.
- Screenshots on real-PC checks are not uploaded to GitHub (the REST API has no attachment upload); the comment says one was taken.
- Version bumps are copied as commands, not written by Mission Control (drafts may only touch docs).
- The research lookout and combinator scan prompts should be told to read `docs/brain/QUEUE.md › Rejected` (owner, in the scheduled tasks).

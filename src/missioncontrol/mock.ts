// Fixtures for `?mcmock=1`: parity scenes and screenshots of every page without a token, a
// network or a dev folder. Shapes match the Rust commands exactly.
import type { BranchInfo, DocsBundle, GitInfo, MergedPr, Plan, Pr } from "./model/types";

const SHA = (n: number) => `${n.toString(16).padStart(2, "0")}a9c3f1e0d5515a9c3f1e0d0db5515a9c3f1e0d`.slice(0, 40);
const check = (id: number, name: string, conclusion: string | null, status = "completed") => ({ id, name, status, conclusion, runId: 9000 + id });
const GREEN = [check(1, "Windows build", "success"), check(2, "IPC types + frontend tests", "success"), check(3, "Visual parity (headless render)", "success"), check(4, "End-to-end on Windows (real app over CDP)", "success"), check(5, "Fluidity, visuals, a11y, soak (headless)", "success")];

const prs: Pr[] = [
  {
    number: 126, title: "Lens Browser: ad & tracker blocking, split view, real favicons", author: "lens-agent", headRef: "feature/browser-ardia-lessons", baseRef: "main", headSha: SHA(126), draft: false, mergeableState: "clean",
    additions: 2140, deletions: 310, changedFiles: 48, commits: 14, updatedAt: "2026-11-26T15:10:00Z", url: "https://github.com/orionopenwow/LensUI/pull/126", labels: ["browser"], body: "",
    realPc: [{ section: "Needs a real PC", text: "Import from Arc on a PC that has Arc installed: spaces and pinned tabs arrive.", done: false }, { section: "Needs a real PC", text: "Split view with two YouTube tabs: both play, no flicker.", done: false }],
    checks: GREEN, status: { number: 126, verdict: "READY", running: 0, e2eOk: 1, failing: [], reasons: [] },
  },
  {
    number: 123, title: "Desktop widgets: macOS-style widgets on the desktop", author: "lens-agent", headRef: "feature/desktop-widgets", baseRef: "main", headSha: SHA(123), draft: false, mergeableState: "clean",
    additions: 1630, deletions: 40, changedFiles: 31, commits: 9, updatedAt: "2026-11-26T12:00:00Z", url: "https://github.com/orionopenwow/LensUI/pull/123", labels: [], body: "",
    realPc: [{ section: "Needs a real PC", text: "Widgets stay behind windows and above the wallpaper after Win+D.", done: false }],
    checks: [check(1, "Windows build", "success"), check(4, "End-to-end on Windows (real app over CDP)", "failure"), check(6, "End-to-end on Windows (real app over CDP) (soak)", "success")],
    status: { number: 123, verdict: "READY", running: 0, e2eOk: 1, failing: [{ id: 4, runId: 9004, name: "End-to-end on Windows (real app over CDP)", scenarios: ["webview-killed"], knownFlake: true, likelyFlake: false }], reasons: ["End-to-end on Windows (real app over CDP) failed only on known flakes (webview-killed): re-run once"] },
  },
  {
    number: 117, title: "Dock: Unified style, window carousel, window-count marks", author: "lens-agent", headRef: "feature/dock-unified", baseRef: "main", headSha: SHA(117), draft: false, mergeableState: "dirty",
    additions: 980, deletions: 220, changedFiles: 22, commits: 11, updatedAt: "2026-11-25T20:00:00Z", url: "https://github.com/orionopenwow/LensUI/pull/117", labels: ["dock"], body: "",
    realPc: [{ section: "Needs a real PC", text: "Two monitors at 100 % and 150 %: the carousel opens on the Dock's monitor.", done: true }],
    checks: [check(1, "Windows build", "failure"), check(3, "Visual parity (headless render)", "success")],
    status: { number: 117, verdict: "BLOCKED", running: 0, e2eOk: 0, failing: [{ id: 1, runId: 9001, name: "Windows build", scenarios: [], knownFlake: false, likelyFlake: false }], reasons: ["Has merge conflicts with main", "Windows build failed"] },
  },
  {
    number: 109, title: "Magic Mouse: Lens Magic pointer set and hold-then-drag grab", author: "lens-agent", headRef: "feature/magic-m3-mouse", baseRef: "main", headSha: SHA(109), draft: false, mergeableState: "clean",
    additions: 760, deletions: 90, changedFiles: 19, commits: 6, updatedAt: "2026-11-26T16:40:00Z", url: "https://github.com/orionopenwow/LensUI/pull/109", labels: [], body: "",
    realPc: [], checks: [check(1, "Windows build", null, "in_progress"), check(4, "End-to-end on Windows (real app over CDP)", null, "queued")],
    status: { number: 109, verdict: "WAIT", running: 2, e2eOk: 0, failing: [], reasons: ["2 check(s) still running"] },
  },
  {
    number: 47, title: "Daily research lookout and tester notes (rolling)", author: "lens-research", headRef: "research/daily", baseRef: "main", headSha: SHA(47), draft: true, mergeableState: "clean",
    additions: 820, deletions: 12, changedFiles: 9, commits: 4, updatedAt: "2026-11-26T12:19:00Z", url: "https://github.com/orionopenwow/LensUI/pull/47", labels: ["research"], body: "", realPc: [],
    checks: [check(2, "IPC types + frontend tests", "success")], status: { number: 47, verdict: "WAIT", running: 0, e2eOk: 0, failing: [], reasons: ["Draft"] },
  },
];

const merged: MergedPr[] = [
  { number: 118, title: "Settings polish: B-40, B-41, contrast in every pack", mergedAt: "2026-11-26T09:00:00Z", url: "https://github.com/orionopenwow/LensUI/pull/118", realPc: [{ section: "Needs a real PC", text: "Transparency effects off: the Top Bar halo disappears within about 2 s.", done: false }, { section: "Needs a real PC", text: "Hot corners off: pick corners and actions, turn it on, and they work.", done: false }] },
  { number: 120, title: "Dock music pop-out with sound glow", mergedAt: "2026-11-26T07:30:00Z", url: "https://github.com/orionopenwow/LensUI/pull/120", realPc: [{ section: "Needs a real PC", text: "Spotify playing: the glow breathes with the music and stops when paused.", done: false }] },
];

const docs: DocsBundle = {
  bugs: [
    { id: "B-31", severity: "Medium", status: "open", title: "A crashed window may show nothing instead of \"Reloading…\"", location: "src/failsafe/SurfaceBoundary.tsx, app/renderer.rs", note: "Wave 4c (run/w4c-reliability)" },
    { id: "B-12b", severity: "Medium", status: "open", title: "First Enter after a cold start could do nothing.", location: "src/command/CommandSurface.tsx", note: "Wave 4c: handler side closed; focus side pending" },
    { id: "B-07", severity: "Medium", status: "open", title: "Whisper, ffmpeg and yt-dlp download pins read UNPINNED", location: "src-tauri/src/media/setup.rs", note: "Maintainer before release" },
    { id: "B-58", severity: "Low", status: "open", title: "Same pattern as B-41: options under pointer-events none", location: "AltDragCard.tsx, MagicCard.tsx", note: "Next Settings wave" },
    { id: "B-19", severity: "Low", status: "open", title: "421 hard-coded hex colours in TSX", location: "TSX", note: "Track via generated/patterns.md" },
    { id: "B-04", severity: "Critical", status: "fixed", title: "Agent safety was not wired", location: "agentsafe/gate.rs", note: "One adapter, agentsafe::gate" },
  ],
  dossiers: [
    { feature: "Dock", file: "dock.md", status: "works (robustness wave)", quickWin: "Split DockSurface.tsx", topBug: "B-62 needs a two-display check", idea: "Dock in 10 seconds tour" },
    { feature: "Top Bar", file: "topbar.md", status: "works", quickWin: "Focus strip", topBug: "Stale hit rect (suspected)", idea: "Focus strip under the clock" },
    { feature: "Settings", file: "settings.md", status: "works", quickWin: "\"Recently changed\" strip", topBug: "B-58 dead clicks", idea: "Recently changed with Undo" },
    { feature: "Setup, updates & safety", file: "setup-updates-safety.md", status: "partly (owner creates the key)", quickWin: "Signing key and first release (owner)", topBug: "Empty updater pubkey by design", idea: "Safety card in About" },
    { feature: "Lens Browser", file: "browser.md", status: "partly", quickWin: "Local reader view", topBug: "Agent approval is a UI boolean", idea: "Reader view with Ask" },
    { feature: "Music", file: "music.md", status: "works", quickWin: "Lyrics offset nudge per track", topBug: "Meter may stay on the old device", idea: "One shared mini player" },
  ],
  whatIsLeft: [
    { section: "Dock, Top Bar, Settings, Themes: what is left", text: "Wallpaper: folder picker dialog, palette chip copies hex, Next wallpaper in the Dock and Top Bar menus.", done: false },
    { section: "Dock, Top Bar, Settings, Themes: what is left", text: "Split DockSurface.tsx (context menu first). No behaviour change, goldens unchanged.", done: false },
    { section: "Dock, Top Bar, Settings, Themes: what is left", text: "Done (Settings wave). Settings B-41: radios", done: true },
  ],
  fableLeft: [{ section: "Next pass", text: "Approval steps bound to one plan, with per-step allow/deny.", done: false }],
  realPc: [
    { source: "docs/features/README.md", item: { section: "Needs a real PC", text: "Needs a real PC: two displays with \"Top Bar on every monitor\" and \"Follow the pointer\" together", done: false } },
    { source: "docs/features/dock.md", item: { section: "Needs a real PC", text: "Needs a real-PC check with two monitors at different scaling", done: false } },
  ],
  ideas: [
    { rank: 1, idea: "Refresh Cargo.lock, build with --locked, add cargo audit to CI", area: "Under the hood", score: 15, status: "Missing", effort: "S", risk: "low", seen: ["2026-11-23", "2026-11-24", "2026-11-26"], files: "build.yml" },
    { rank: 2, idea: "Dock hover \"Titles list\" mode; show more than four windows", area: "Dock", score: 13, status: "Partial", effort: "S", risk: "low", seen: ["2026-11-23", "2026-11-26"], files: "DockPreviewStrip.tsx" },
    { rank: 3, idea: "\"Arc closes 22 Dec\" banner in Import; add Zen and Dia import sources", area: "Browser", score: 12, status: "Partial", effort: "S", risk: "low", seen: ["2026-11-24", "2026-11-26"], files: "ImportPanel.tsx" },
    { rank: 4, idea: "Weekly WebView2 Beta canary run of the visual and e2e suites", area: "Under the hood", score: 12, status: "Missing", effort: "S", risk: "low", seen: ["2026-11-23"], files: ".github/workflows/" },
    { rank: 14, idea: "\"Watch this page\" in Lens Browser: local change checks", area: "Browser", score: 10, status: "Missing", effort: "M", risk: "med", seen: ["2026-11-26"], files: "browser/watch.rs" },
  ],
  dailyPath: "docs/research/daily/2026-11-26.md",
  dailyTop: ["Arc closes on 22 December: an \"Arc is closing\" banner, plus Dia and Zen as import sources", "\"Watch this page\" in Lens Browser: local change checks with a Lens notification", "Read-only MCP tools for Lens Browser tabs (gated)"],
  tester: { date: "2026-11-26", build_ref: "main@718ae8b", test_steps: [{ id: "dock-music", area: "Dock", steps: "Hover Spotify in the Dock while music plays.", risk: "high" }], known_issues: [] },
  catalog: [
    { project: "Ollama", repo: "ollama/ollama", licence: "MIT", mode: "Bridge", score: 88, status: "Catalogued", hooks: "local models", lastSeen: "2026-11-26" },
    { project: "whisper.cpp", repo: "ggml-org/whisper.cpp", licence: "MIT", mode: "Bridge", score: 81, status: "Proposed", hooks: "voice", lastSeen: "2026-11-26" },
    { project: "Flameshot", repo: "flameshot-org/flameshot", licence: "GPL-3.0", mode: "Learn", score: 62, status: "Catalogued", hooks: "snip", lastSeen: "2026-11-24" },
  ],
  scanPath: "docs/combinator/scan/2026-11-26.md",
  unreleased: [
    { name: "Added", items: ["The Dock's music pop-out, redone (hover Spotify in the Dock).", "Desktop widgets (off by default)."] },
    { name: "Fixed", items: ["The hot-corner picker couldn't be clicked while Hot corners was off.", "Some Settings switches vanished or stopped responding after one click", "Contrast in every theme pack."] },
  ],
  masterplan: [
    { title: "3.1 Now (next 2 weeks)", items: ["Signed releases and the first beta", "Tester loop: checklist → report → issue", "Remove all on Win 10 22H2 + Win 11 24H2"] },
    { title: "3.2 Next (this quarter)", items: ["Lens Apps with screenshots and credits", "Local models first in Command"] },
    { title: "3.3 Later", items: ["Linux layer-shell exploration"] },
  ],
  horizons: { heading: "8. Horizons", headers: ["Horizon", "When (target)", "Goal", "Milestones", "Measure"], rows: [["**H0: Foundations**", "now – Dec 2026", "The machinery exists", "Scan running; catalogue seeded", "Catalogue ≥ 150 rows"], ["**H1: Lens 1.0 \"One desktop\"**", "Jan – Feb 2027", "The core combinator is real and signed", "Signed releases", "20 capabilities agent-ready"], ["**H2: The combinator**", "Mar – Jun 2027", "Lens is where open source meets", "Bridges for local AI", "50 capabilities"]] },
  phases: { heading: "9. Phases and gates", headers: ["Phase", "Work", "Gate to move on", "Size"], rows: [["**P0: Map**", "Dependency graph", "Graph reviewed", "S"], ["**P1: Seams**", "Settings sections, contracts", "Goldens identical", "M"], ["**P2: Plugins**", "Modules become Tauri plugins", "CI green", "L"]] },
  queue: "",
  sources: { "main:docs/brain/BUGS.md": "git", "research/daily:docs/research/IDEAS_BACKLOG.md": "git" },
  missing: ["research/combinator:docs/combinator/CATALOG.md — the branch doesn't exist yet (mock)"],
  readAtMs: Date.parse("2026-11-26T17:00:00Z"),
};

const git: GitInfo = {
  root: "C:\\Users\\dev\\Desktop\\Seelen",
  status: { branch: "main", upstream: "origin/main", ahead: 0, behind: 3, changed: [] },
  dirty: false, aheadOfMain: 0, behindMain: 3, head: SHA(1),
  log: [{ sha: SHA(1), date: "2026-11-26T09:00:00-07:00", subject: "Merge pull request #118 from orionopenwow/wave/settings-polish" }, { sha: SHA(2), date: "2026-11-26T07:30:00-07:00", subject: "Merge pull request #120 from orionopenwow/feature/music-sound-glow" }],
  lastFetchMs: Date.parse("2026-11-26T16:20:00Z"),
  devFiles: [{ name: "bun.lock.installed", dir: false, bytes: 182344 }, { name: "base", dir: false, bytes: 41 }, { name: "mission-control", dir: true, bytes: 0 }],
};

const branches: BranchInfo[] = [
  { family: "research/", name: "research/daily", date: "2026-11-26T05:19:11-07:00", subject: "Daily research lookout and tester notes for 2026-11-26" },
  { family: "feature/", name: "feature/browser-ardia-lessons", date: "2026-11-26T08:10:00-07:00", subject: "Ad blocking lists" },
  { family: "wave/", name: "wave/settings-polish", date: "2026-11-26T01:00:00-07:00", subject: "Contrast in every pack" },
  { family: "fable/", name: "fable/dock-topbar-settings-themes", date: "2026-11-25T18:00:00-07:00", subject: "Fable pass" },
  { family: "site/", name: "site/accent-and-app-thumbs", date: "2026-11-25T12:00:00-07:00", subject: "Site: Lens Apps screenshots" },
  { family: "brain/", name: "brain/combinator-plan", date: "2026-11-26T04:00:00-07:00", subject: "Combinator plan" },
];

const mainChecks = { total_count: 6, check_runs: [...GREEN, check(7, "Pages", "success")] };

function ghMock(path: string): unknown {
  if (path.includes("/commits/main/check-runs")) return mainChecks;
  if (path.includes("/pages/builds/latest")) return { status: "built", created_at: "2026-11-26T15:00:00Z", commit: SHA(1) };
  if (path.includes("/releases")) return [
    { tag_name: "v0.3.0", name: "Lens 0.3.0", published_at: "2026-11-24T18:00:00Z", prerelease: false, draft: false, html_url: "", assets: [{ name: "latest.json" }, { name: "Lens_0.3.0_x64-setup.exe" }] },
    { tag_name: "v0.3.0-beta.2", name: "Lens 0.3.0 beta 2", published_at: "2026-11-20T18:00:00Z", prerelease: true, draft: false, html_url: "", assets: [{ name: "latest.json" }] },
  ];
  if (path.includes("/issues")) return [
    { number: 131, title: "Dock disappears after sleep on a laptop with two monitors", state: "open", labels: [{ name: "tester-report" }, { name: "high" }], html_url: "", updated_at: "2026-11-26T10:00:00Z", body: "Steps: close the lid with an external monitor…" },
    { number: 129, title: "Settings › Music: Dock music pop-out switch label overlaps on 125 %", state: "open", labels: [{ name: "bug" }, { name: "low" }], html_url: "", updated_at: "2026-11-25T10:00:00Z", body: "" },
    { number: 127, title: "Report: Command didn't answer the first Enter", state: "closed", labels: [{ name: "tester-report" }], html_url: "", updated_at: "2026-11-24T10:00:00Z", body: "" },
  ];
  if (path.endsWith(`/repos/orionopenwow/LensUI`)) return { stargazers_count: 412, open_issues_count: 19, forks_count: 23, permissions: { admin: true, push: true } };
  if (path.includes("/actions/runs")) return { workflow_runs: [{ id: 9001, name: "build", head_branch: "main", status: "completed", conclusion: "success", run_attempt: 1, created_at: "2026-11-26T16:00:00Z", head_sha: SHA(1) }] };
  if (path === "/rate_limit") return { rate: { remaining: 4870, limit: 5000 } };
  return {};
}

const now = Date.parse("2026-11-26T17:00:00Z");
const answer = (data: unknown) => ({ status: 200, data, fromCache: true, stale: false, offline: false, fetchedMs: now - 45_000 });

const brainText: Record<string, string> = {
  "docs/brain/IDENTITY.md": "# Lens identity: mission, brand and design philosophy\n\n## 1. Mission\n\n**Make Windows calm, beautiful and yours, with an assistant you can trust, for free.**\n\n### The promises (non-negotiable)\n\n1. **Free and open source.** MIT licensed.\n2. **Local-first and private.** Nothing is uploaded without a step you take.\n3. **Reversible.** Every change Lens makes to Windows is undone by Remove all.\n\n## 3. Brand and aesthetic\n\n- **Obsidian monochrome chrome.** Matte, not glossy.\n- **Colour is earned.** The Lens cloud is the one colour moment.\n",
  "DESIGN.md": "# Lens — Living Design Document\n\n## 5. Motion & Feel\n\n### 5.2 Press weights\n\n| Weight | Use for | Press-in |\n|---|---|---|\n| light | rows, tabs | fill steps one shade |\n| medium | buttons | scale 0.97, 1 px |\n| heavy | primary, destructive | scale 0.955, 1.5 px |\n",
};

export async function mockCall(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (cmd) {
    case "mc_status":
      return { repoRoot: git.root, dataDir: `${git.root}\\.dev\\mission-control`, tokenSource: new URLSearchParams(location.search).get("token") === "none" ? "none" : "credentialManager", offline: new URLSearchParams(location.search).has("offline"), rate: { remaining: 4870, limit: 5000, reset: 0 }, version: "0.3.0", hotkey: null, hotkeyChoices: ["Ctrl+Alt+Shift+M", "Ctrl+Win+Alt+M", "Ctrl+Alt+Shift+F12"], knownFlakes: ["webview-killed"] };
    case "mc_token_probe":
      return "credentialManager";
    case "mc_token_set":
      return { login: "maintainer", permissions: { admin: true } };
    case "mc_gh":
      return answer(ghMock(String(args.path ?? "")));
    case "mc_prs":
      return { prs, knownFlakes: ["webview-killed"], offline: false };
    case "mc_pr_files":
      return { files: [{ file: "src/browser/BrowserSurface.tsx", status: "modified", additions: 220, deletions: 40 }, { file: "src-tauri/src/browser/blocklist.rs", status: "added", additions: 410, deletions: 0 }, { file: "docs/LENS_BROWSER.md", status: "modified", additions: 60, deletions: 4 }] };
    case "mc_job_log":
      return { excerpt: ["FAIL webview-killed: Lens said: (nothing)", "  at tests/e2e/failsafe.mjs:212", "…", "##[error]Process completed with exit code 1."], scenarios: ["webview-killed"], counts: { rustPassed: 0, rustFailed: 0, bunPassed: 0, bunFailed: 0 }, perf: [], rigs: [], goldens: [] };
    case "mc_merged_prs":
      return merged;
    case "mc_quality":
      return {
        runsScanned: 30,
        flakes: [{ scenario: "webview-killed", flakes: 6, lastSeen: "2026-11-26", jobs: ["End-to-end on Windows (real app over CDP)"] }, { scenario: "esc-stops-run", flakes: 2, lastSeen: "2026-11-24", jobs: ["End-to-end on Windows (real app over CDP)"] }, { scenario: "dock-search-dismiss", flakes: 1, lastSeen: "2026-11-21", jobs: ["Fluidity, visuals, a11y, soak (headless)"] }],
        latest: [
          { workflow: "build", runId: 9001, sha: SHA(1), date: "2026-11-26T16:00:00Z", conclusion: "success", jobs: [{ name: "Windows build", conclusion: "success", counts: { rustPassed: 1214, rustFailed: 0, bunPassed: 0, bunFailed: 0 }, perf: [], rigs: [], goldens: [] }, { name: "IPC types + frontend tests", conclusion: "success", counts: { rustPassed: 0, rustFailed: 0, bunPassed: 1268, bunFailed: 0 }, perf: [], rigs: [], goldens: [] }] },
          { workflow: "robustness", runId: 9002, sha: SHA(1), date: "2026-11-26T16:05:00Z", conclusion: "success", jobs: [{ name: "Fluidity, visuals, a11y, soak (headless)", conclusion: "success", counts: { rustPassed: 0, rustFailed: 0, bunPassed: 0, bunFailed: 0 }, perf: [{ scenario: "dock-hover-sweep", p50: 8.3, p95: 12.1, longTasks: 0, verdict: "ok" }, { scenario: "settings-tab-switch", p50: 11.2, p95: 15.9, longTasks: 1, verdict: "ok" }, { scenario: "theme-switch", p50: 13.0, p95: 18.4, longTasks: 2, verdict: "p95 18.4 > 17.0" }], rigs: [["[theme-rig]", "[theme-rig] 30/30 checks clean"], ["[hyper]", "[hyper] 291 checks, 0 failing (0 new, 0 known now passing) in 312 s"]], goldens: ["settings-catppuccin-mocha-760x560"] }] },
        ],
      };
    case "mc_release_config":
      return { secretNames: ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"], secretsReadable: true, variables: [{ name: "TAURI_UPDATER_PUBKEY", set: false }], variablesReadable: true };
    case "mc_git":
      return git;
    case "mc_branches":
      return branches;
    case "mc_docs":
      return docs;
    case "mc_brain_index":
      return ["docs/brain/IDENTITY.md", "DESIGN.md", "AGENTS.md", "docs/brain/BUGS.md", "docs/features/dock.md"];
    case "mc_doc": {
      const p = String(args.path);
      return { path: p, branch: "main", source: "git", text: brainText[p] ?? `# ${p}\n\nMock document.\n` };
    }
    case "mc_local":
      return {
        version: "0.3.0", pid: 18244, startedMs: now - 3_600_000 * 2, safeMode: false, safeReason: "", windows: ["dock", "topbar", "settings", "missioncontrol"],
        config: "{\n  \"theme\": {\n    \"preset\": \"obsidian\",\n    \"borderRadius\": 8\n  },\n  \"dock\": {\n    \"style\": \"floating\",\n    \"iconSize\": 44\n  }\n}",
        flags: [{ path: "magicWaves.dashboard", value: false, default: false }, { path: "magicWaves.mouse", value: true, default: false }, { path: "magicWaves.startButton", value: false, default: false }, { path: "tester.enabled", value: true, default: false }],
        killSwitches: [{ id: "keyhook", label: "Keyboard hook", killed: false }, { id: "dwm-hook", label: "Window styling hook", killed: false }],
        changes: [{ id: "taskbar", label: "Windows taskbar hidden", scope: "session", writes: ["Shell_TrayWnd"] }, { id: "accent", label: "Windows accent colour", scope: "persistent", writes: ["HKCU\\…\\DWM\\AccentColor"] }, { id: "folders", label: "Folder icons", scope: "persistent", writes: ["desktop.ini"] }],
        notChanged: [{ what: "Apps you installed", why: "They are yours." }],
        crashReports: [{ name: "crash-2026-11-25T21-14-02.txt", createdMs: Date.parse("2026-11-25T21:14:02Z"), summary: "panicked at win_previews.rs:410: index out of bounds" }],
        lensLog: ["[info] dock: placed on monitor 1", "[warn] previews: thumbnail timed out (Spotify)", "[info] settings: saved"],
        logPath: "%APPDATA%\\LensUI\\lens.log", crashDir: "%APPDATA%\\LensUI\\crashes",
      };
    case "mc_log_since":
      return Number(args.after ?? 0) > 0 ? [] : [
        { seq: 1, atMs: now - 60_000, level: "info", area: "dock", message: "placed on monitor 1 (1920×1080 @ 100 %)" },
        { seq: 2, atMs: now - 40_000, level: "warn", area: "previews", message: "thumbnail timed out (Spotify)" },
        { seq: 3, atMs: now - 20_000, level: "error", area: "music", message: "meter: output device changed" },
        { seq: 4, atMs: now - 5_000, level: "info", area: "mission", message: "Mission Control is available (dev build)." },
      ];
    case "mc_crash":
      return "Lens crash report\nthread 'main' panicked at win_previews.rs:410\n…";
    case "mc_state_get":
      return args.name === "trend" ? { points: [{ date: "2026-11-20", stars: 380, issues: 22 }, { date: "2026-11-23", stars: 398, issues: 20 }, { date: "2026-11-26", stars: 412, issues: 19 }] } : args.name === "decisions" ? { "research:weekly-webview2-beta-canary-run-of-the-visual-and-e2e-suites": { state: "accepted", at: "2026-11-26", title: "Weekly WebView2 Beta canary run" } } : {};
    case "mc_state_set":
      return null;
    case "mc_audit":
      return ['{"atMs":1764170000000,"phase":"plan","action":"rerun","target":"run 9003","detail":"POST /repos/orionopenwow/LensUI/actions/runs/9003/rerun-failed-jobs","outcome":"planned"}', '{"atMs":1764170010000,"phase":"apply","action":"rerun","target":"run 9003","detail":"POST …","outcome":"ok"}'];
    case "mc_plan": {
      // Same wording as src-tauri/src/mission/plan.rs `describe`, for the screenshots.
      const a = args.action as Record<string, never> & { kind: string };
      const R = "/repos/orionopenwow/LensUI";
      const steps: Record<string, string[]> = {
        merge: [`PUT ${R}/pulls/${a.pr}/merge with sha=${a.sha}, merge_method=${a.method}`, `Merges ${a.headRef} into ${a.baseRef}: ${a.commits} commit(s), ${a.files} file(s) — "${a.title}".`, `Only at head ${String(a.sha).slice(0, 7)}: if anyone pushed since you looked, GitHub refuses and nothing merges.`, "Does not delete the branch. Cannot be undone from here (a revert PR can)."],
        syncDevFolder: ["git fetch --quiet origin", "git merge --ff-only origin/main (only if the folder has no changes and is on main)", "Refused if anything is uncommitted or main has diverged; nothing is ever reset or deleted."],
        rerun: [`POST ${R}/actions/runs/${a.runId}/rerun-failed-jobs`, `Re-runs only the failed jobs of "${a.label}"; passed jobs keep their result.`],
      };
      const p: Plan = { id: "mock-1", action: a.kind === "syncDevFolder" ? "sync" : a.kind, target: a.kind === "merge" ? `PR #${a.pr}` : a.kind === "syncDevFolder" ? "dev folder" : "mock", steps: [...(steps[a.kind] ?? [`(sample) ${a.kind}`]), "(Sample data: nothing is sent.)"], heavy: ["merge", "tag", "close", "relaunch"].includes(a.kind) };
      return p;
    }
    case "mc_apply":
      return { message: "Done (mock: nothing was sent)." };
    case "mc_cancel":
    case "mc_set_hotkey":
    case "mc_token_forget":
    case "mc_open":
      return null;
    default:
      throw new Error(`mock: no fixture for ${cmd}`);
  }
}

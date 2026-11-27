// Real-Windows auto-hide tests for the Top Bar and the Dock (docs/TESTING.md › Auto-hide).
// Moves the real cursor (tools/e2e/desk.ps1), reads the real window state (visible, click-through,
// rect) and the page state (`.is-hidden`), and checks after every step that the bar/Dock is where
// it should be, nothing stays stuck open, nothing flickers, and no flyout is left behind.
//
// Run on Windows after the E2E build (same setup as tests/e2e/run.mjs):
//   node tests/e2e/autohide.mjs                 # E2E_ONLY=topbar-reveal,dock-bottom for a subset
//   dock-left / dock-right run every Dock style on that edge; explorer-restart restarts explorer.exe
//   (last, and skipped when the session has no Explorer).
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = resolve(import.meta.dirname, "../..");
const outDir = join(root, "tests/e2e/out");
mkdirSync(outDir, { recursive: true });
const ONLY = (process.env.E2E_ONLY || "").split(",").filter(Boolean);


// ---- desktop helper --------------------------------------------------------------------------
const desk = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "tools/e2e/desk.ps1")], { stdio: ["pipe", "pipe", "inherit"] });
const deskLines = createInterface({ input: desk.stdout });
const waiting = [];
deskLines.on("line", (l) => waiting.shift()?.(l));
function d(cmd) {
  return new Promise((res, rej) => {
    waiting.push((l) => {
      try { res(JSON.parse(l)); } catch { rej(new Error(`desk: ${l}`)); }
    });
    desk.stdin.write(cmd + "\n");
  });
}

import { startLens, surfaces, page, invoke, setConfig, quit, sleep } from "./lens.mjs";
import { pointOutside } from "./points.mjs";

// ---- state readers --------------------------------------------------------------------------
const BAR = "Lens Top Bar";
const DOCK = "Lens Dock";
/** Top Bar: shown = window visible and page not sliding out. A shown bar may ignore the mouse
 *  (click-through: clicks on its empty parts go to the app behind), so "takes clicks" is not part
 *  of "shown"; a hidden bar must never take clicks, which `hiddenTakesClicks` reports. */
async function barState(s) {
  const w = await d(`win ${BAR}`);
  const pageHidden = await surfaces(s).topbar?.evaluate(() => !!document.querySelector(".topbar-wrapper.is-hidden")).catch(() => null);
  const shown = w.found && w.visible && pageHidden === false;
  return { shown, hiddenTakesClicks: !shown && w.found && w.visible && !w.transparent, w, pageHidden };
}
async function dockState(s) {
  const pageHidden = await surfaces(s).dock?.evaluate(() => {
    const pill = document.querySelector(".dock-pill");
    return pill ? pill.classList.contains("is-hidden") : null;
  }).catch(() => null);
  return { shown: pageHidden === false, pageHidden };
}
/** Waits until `read()` reports `shown === want`, up to `ms`. Returns the elapsed ms or throws.
 *  `diag` (optional) adds what Lens itself says to the failure message. */
async function expectWithin(label, read, want, ms, diag) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 <= ms) {
    last = await read();
    if (last.shown === want && (want || !last.hiddenTakesClicks)) return Date.now() - t0;
    await sleep(50);
  }
  const more = diag ? `\n${await diag().catch((e) => `(diagnostics failed: ${e})`)}` : "";
  throw new Error(`${label}: expected ${want ? "shown" : "hidden"} within ${ms} ms, got ${JSON.stringify(last)}${more}`);
}
/** Stays in state `want` for `ms` (no stuck change, no surprise). */
async function expectStays(label, read, want, ms, diag) {
  const t0 = Date.now();
  while (Date.now() - t0 <= ms) {
    const st = await read();
    if (st.shown !== want || (!want && st.hiddenTakesClicks)) {
      const more = diag ? `\n${await diag().catch((e) => `(diagnostics failed: ${e})`)}` : "";
      throw new Error(`${label}: expected to stay ${want ? "shown" : "hidden"}, got ${JSON.stringify(st)} after ${Date.now() - t0} ms${more}`);
    }
    await sleep(100);
  }
}
/** What Lens itself thinks of the Top Bar: the watcher's shown flag, the real cursor, the last
 *  Top Bar decisions (with their reason) and any watcher stall or window build from the Tester log. */
async function barDiag(s) {
  const dock = surfaces(s).dock;
  const flag = dock ? await invoke(dock, "get_topbar_visible_cmd").catch((e) => `? (${e.message})`) : "?";
  const pos = await d("pos").catch(() => null);
  const log = dock ? await invoke(dock, "tester_log_get", { after: null, limit: 2000 }).catch(() => []) : [];
  const lines = log
    .filter((l) => /^(topbar|watcher|surface|setup|loadguard|renderer)$/.test(l.area))
    .slice(-16)
    .map((l) => `${new Date(l.atMs ?? l.at_ms ?? 0).toISOString().slice(11, 23)} [${l.area}] ${l.message}`);
  const built = s.logs.join("").includes("Start-up windows built.");
  return [
    `      Lens: watcher has the bar ${flag === true ? "shown" : flag === false ? "hidden" : flag}; pointer at ${JSON.stringify(pos)}; start-up windows built: ${built}`,
    ...(lines.length ? ["      Tester log (Top Bar / watcher / windows):", ...lines.map((l) => "        " + l)] : ["      Tester log: no Top Bar decisions recorded"]),
  ].join("\n");
}
/** No flicker: at most one shown/hidden transition of the real window while `act` runs. */
async function expectNoFlicker(label, act, ms = 900) {
  const watch = d(`watch ${BAR} ${ms}`);
  await sleep(20);
  await act();
  const w = await watch;
  if (w.found && w.transitions > 1) throw new Error(`${label}: Top Bar flickered (${w.transitions} transitions: ${w.states})`);
  return w;
}
const FLYOUTS = ["palette", "quicksettings", "settings", "launcher", "widgets"];
async function noFlyoutOpen(s, label) {
  const open = [];
  for (const f of FLYOUTS) {
    const p = surfaces(s)[f];
    if (!p) continue;
    const vis = await invoke(p, "is_surface_visible_cmd", { label: f }).catch(() => false);
    if (vis) open.push(f);
  }
  if (open.length) throw new Error(`${label}: flyout(s) left open: ${open.join(", ")}`);
}


// ---- Dock on a side edge (left/right) --------------------------------------------------------
const DOCK_STYLES = ["floating", "slim", "taskbar", "studio", "minimal", "split", "islands", "unified"];
const SETTINGS = "Lens Control Center";
const QUICK = "Lens Quick Settings";
/** The pill(s) the Dock draws, in physical screen px (window rect + CSS rect × device pixel ratio). */
async function pillOnScreen(s) {
  const w = await d(`win ${DOCK}`);
  const r = await surfaces(s).dock.evaluate(() => {
    let l = Infinity, t = Infinity, rr = -Infinity, b = -Infinity;
    for (const el of document.querySelectorAll(".dock-pill, .dock-split-pill")) {
      const rc = el.getBoundingClientRect();
      if (rc.width === 0 || rc.height === 0) continue;
      l = Math.min(l, rc.left); t = Math.min(t, rc.top); rr = Math.max(rr, rc.right); b = Math.max(b, rc.bottom);
    }
    return Number.isFinite(l) ? { l, t, r: rr, b, dpr: window.devicePixelRatio || 1 } : null;
  });
  if (!w.found || !r) return null;
  return { l: Math.round(w.x + r.l * r.dpr), t: Math.round(w.y + r.t * r.dpr), r: Math.round(w.x + r.r * r.dpr), b: Math.round(w.y + r.b * r.dpr), dpr: r.dpr, win: w };
}
/** Waits until the Dock window takes clicks (`want` false) or lets them through (`want` true). */
async function expectClickThrough(label, want, ms) {
  const t0 = Date.now();
  let w;
  while (Date.now() - t0 <= ms) {
    w = await d(`win ${DOCK}`);
    if (w.found && w.transparent === want) return;
    await sleep(50);
  }
  throw new Error(`${label}: expected the Dock to ${want ? "let clicks through" : "take clicks"} within ${ms} ms, got ${JSON.stringify(w)}`);
}
/** `inner` lies inside `outer` (both {x,y,w,h}), with `slack` px of rounding. */
function inside(inner, outer, slack = 2) {
  return inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.w <= outer.x + outer.w + slack && inner.y + inner.h <= outer.y + outer.h + slack;
}
async function popoutBeside(s, edge, label, title, open) {
  await open();
  await sleep(900);
  const w = await d(`win ${title}`);
  if (!w.found || !w.visible) throw new Error(`${label}: ${title} did not open (${JSON.stringify(w)})`);
  const work = await d("work");
  if (!inside(w, work)) throw new Error(`${label}: ${title} ${JSON.stringify(w)} is not inside the work area ${JSON.stringify(work)}`);
  const pill = await pillOnScreen(s);
  // Beside the pill on its inner side, never over it (a few px of overlap is the seamless join).
  const join = Math.ceil(4 * (pill?.dpr || 1));
  if (pill && edge === "left" && w.x < pill.r - join) throw new Error(`${label}: ${title} at x=${w.x} covers the pill (right edge ${pill.r})`);
  if (pill && edge === "right" && w.x + w.w > pill.l + join) throw new Error(`${label}: ${title} ends at x=${w.x + w.w}, over the pill (left edge ${pill.l})`);
  return w;
}
function sideDockScenario(edge) {
  return {
    id: `dock-${edge}`,
    title: `Dock (${edge} edge, every style): shown, hit zone on the pill only, Settings and Quick Settings beside it inside the work area, auto-hide reveals and hides`,
    async run(s) {
      const dock = await page(s, "dock");
      const edgeX = edge === "left" ? 0 : SCREEN.w - 1;
      const notes = [];
      for (const style of DOCK_STYLES) {
        const label = `${edge}/${style}`;
        await setConfig(s, (c) => { c.dock.position = edge; c.dock.style = style; c.dock.autoHide = "never"; });
        await d(`move ${mid().join(" ")}`);
        await expectWithin(`${label}: shown`, () => dockState(s), true, 3000);
        // The window settles to its depth after ~0.5 s idle; give the page time to report its rect.
        await sleep(1200);
        const pill = await pillOnScreen(s);
        if (!pill) throw new Error(`${label}: no pill on screen`);
        const reach = Math.round(48 * pill.dpr);
        const flush = edge === "left" ? pill.l - SCREEN.x : SCREEN.x + SCREEN.w - pill.r;
        if (flush < -1 || flush > reach) throw new Error(`${label}: pill ${JSON.stringify(pill)} is ${flush} px from the ${edge} edge`);
        if (pill.t < SCREEN.y - 1 || pill.b > SCREEN.y + SCREEN.h + 1 || pill.b - pill.t < 40) throw new Error(`${label}: pill ${JSON.stringify(pill)} is off the screen vertically`);
        // Hit zone: the pill takes clicks, the middle of the screen does not.
        const cx = Math.round((pill.l + pill.r) / 2), cy = Math.round((pill.t + pill.b) / 2);
        await d(`move ${cx} ${cy}`);
        await expectClickThrough(`${label}: over the pill`, false, 1500);
        await d(`move ${mid().join(" ")}`);
        await expectClickThrough(`${label}: away from the pill`, true, 1500);
        // Pop-outs open beside the Dock, inside the work area, and close again.
        await popoutBeside(s, edge, label, SETTINGS, () => invoke(dock, "toggle_settings_docked"));
        await invoke(dock, "hide_surface", { label: "settings" }).catch(() => {});
        await popoutBeside(s, edge, label, QUICK, () => invoke(dock, "open_quicksettings_tab_cmd", { tab: "quick", section: "quick", anchor: "bottom-right" }));
        await invoke(dock, "hide_surface", { label: "quicksettings" }).catch(() => {});
        await sleep(400);
        await noFlyoutOpen(s, label);
        // Auto-hide: hides with the pointer away, the screen edge brings it back, leaving hides it.
        await setConfig(s, (c) => { c.dock.autoHide = "always"; });
        await d(`move ${mid().join(" ")}`);
        await expectWithin(`${label}: hides`, () => dockState(s), false, 3000);
        await expectClickThrough(`${label}: hidden Dock lets clicks through`, true, 1000);
        await d(`move ${edgeX} ${cy}`);
        await expectWithin(`${label}: the ${edge} edge reveals it`, () => dockState(s), true, 1500);
        await d(`move ${mid().join(" ")}`);
        await expectWithin(`${label}: leaving hides it`, () => dockState(s), false, 2500);
        notes.push(style);
      }
      await noFlyoutOpen(s, `dock-${edge}`);
    },
  };
}

// ---- scenarios ------------------------------------------------------------------------------
let SCREEN;
const mid = () => [Math.round(SCREEN.w / 2), Math.round(SCREEN.h / 2)];
const REVEAL_DELAY_MS = 100;
const HIDE_DELAY_MS = 350;
const topBarCfg = (mode) => (c) => {
  c.topBar.enabled = true;
  c.topBar.autoHide = mode;
  c.topBar.revealDelayMs = REVEAL_DELAY_MS;
  c.topBar.hideDelayMs = HIDE_DELAY_MS;
};
// How long an idle bar may take to hide: the hide delay, the watcher's ~2 s restatement (which
// repairs a page that missed the hide event) and a margin for watcher passes on a slow runner.
// The page's class flips at once; the slide itself is not waited for.
const TOPBAR_HIDE_WITHIN_MS = HIDE_DELAY_MS + 2000 + 650;

const SCENARIOS = [
  {
    id: "topbar-hides-idle",
    title: "Top Bar (always hide): hides when the pointer is away",
    async run(s) {
      // Park the pointer in the middle of the screen, away from every edge and from the bar,
      // before auto-hide is switched on, so no earlier pointer position can count as a reveal.
      await d(`move ${mid().join(" ")}`);
      await setConfig(s, topBarCfg("always"));
      await d(`move ${mid().join(" ")}`);
      const diag = () => barDiag(s);
      await expectWithin("idle", () => barState(s), false, TOPBAR_HIDE_WITHIN_MS, diag);
      await expectStays("idle", () => barState(s), false, 1200, diag);
    },
  },
  {
    id: "topbar-reveal-leave-fast",
    title: "Top Bar: top edge reveals it without flicker; leaving fast hides it",
    async run(s) {
      await setConfig(s, topBarCfg("always"));
      await d(`move ${mid().join(" ")}`);
      await expectWithin("start hidden", () => barState(s), false, 2500);
      await expectNoFlicker("reveal", () => d(`move ${mid()[0]} 0`));
      await expectWithin("reveal", () => barState(s), true, 800);
      await d(`move ${mid()[0]} 18`);
      await expectStays("pointer on the bar", () => barState(s), true, 1200);
      await expectNoFlicker("leave fast", () => d(`move ${mid().join(" ")}`));
      await expectWithin("leave fast", () => barState(s), false, 2000);
    },
  },
  {
    id: "topbar-leave-slow",
    title: "Top Bar: leaving slowly hides it once the pointer is off the bar",
    async run(s) {
      await setConfig(s, topBarCfg("always"));
      await d(`move ${mid()[0]} 0`);
      await expectWithin("reveal", () => barState(s), true, 1500);
      await d(`slide ${mid()[0]} 0 ${Math.round(SCREEN.h / 3)} 8 30`);
      await expectWithin("leave slow", () => barState(s), false, 2000);
    },
  },
  {
    id: "topbar-side-region",
    title: "Top Bar: moving to a far corner and back to the middle keeps it hidden",
    async run(s) {
      await setConfig(s, topBarCfg("always"));
      await d(`move ${mid().join(" ")}`);
      await expectWithin("start hidden", () => barState(s), false, 2500);
      await d(`move ${SCREEN.w - 5} ${SCREEN.h - 5}`);
      await d(`move 5 ${Math.round(SCREEN.h / 2)}`);
      await expectStays("off the edge", () => barState(s), false, 1500);
    },
  },
  {
    id: "topbar-settings-save-while-hidden",
    title: "Top Bar: a settings save while it is hidden doesn't pop it back up (stuck-open bug)",
    async run(s) {
      await setConfig(s, topBarCfg("always"));
      await d(`move ${mid().join(" ")}`);
      await expectWithin("start hidden", () => barState(s), false, 2500);
      for (const preset of ["alabaster-daylight", "obsidian"]) {
        await setConfig(s, (c) => { c.theme.preset = preset; });
        await sleep(300);
      }
      await expectStays("after settings saves", () => barState(s), false, 2500);
    },
  },
  {
    id: "topbar-search-dismiss",
    title: "Top Bar: Search opened from the bar holds it up; closing and leaving hides it, Search gone",
    async run(s) {
      await setConfig(s, topBarCfg("always"));
      const bar = await page(s, "topbar");
      await d(`move ${mid()[0]} 0`);
      await expectWithin("reveal", () => barState(s), true, 1500);
      await d(`move ${mid()[0]} 10`);
      await invoke(bar, "sync_topbar_search_cmd", { query: "", open: true });
      await sleep(600);
      await d(`move ${mid().join(" ")}`);
      await expectStays("search open", () => barState(s), true, 800);
      // Click outside both the bar and Search: Search closes, the bar hides.
      await d(`click ${Math.round(SCREEN.w * 0.2)} ${Math.round(SCREEN.h * 0.75)}`);
      await expectWithin("after click outside", () => barState(s), false, 4000);
      await noFlyoutOpen(s, "after click outside");
      // Closing through the page (Esc path) while hidden must not show it again.
      await invoke(bar, "sync_topbar_search_cmd", { query: "", open: false });
      await expectStays("close while hidden", () => barState(s), false, 2500);
    },
  },
  {
    id: "topbar-quicksettings-dismiss",
    title: "Top Bar: Quick Settings from the bar; click outside, Esc and another window each close it",
    async run(s) {
      await setConfig(s, topBarCfg("always"));
      const bar = await page(s, "topbar");
      for (const how of ["click-outside", "esc", "focus-other", "other-flyout"]) {
        await d(`move ${mid()[0]} 0`);
        await expectWithin(`${how}: reveal`, () => barState(s), true, 1500);
        await d(`move ${mid()[0]} 10`);
        await invoke(bar, "open_quicksettings_tab_cmd", { tab: "quick", section: "quick" });
        await sleep(700);
        if (how === "click-outside") {
          await d(`click ${Math.round(SCREEN.w * 0.25)} ${Math.round(SCREEN.h * 0.7)}`);
        } else if (how === "esc") {
          const qs = await page(s, "quicksettings");
          await qs.keyboard.press("Escape").catch(() => {});
          await d(`move ${mid().join(" ")}`);
        } else if (how === "focus-other") {
          await d("notepad normal");
          await d(`move ${mid().join(" ")}`);
        } else {
          await invoke(bar, "open_surface", { label: "launcher" }).catch(() => {});
          await sleep(500);
          // Click outside the Launcher for real: it is a centred 780x640 window, so the fixed
          // point used above lands on its app grid (it opened an app on the runner and the
          // Launcher closed only when that launch came back in time, B-131).
          const lw = await d("win Lens Launcher");
          if (!lw.found || !lw.visible) throw new Error(`other-flyout: the Launcher did not open: ${JSON.stringify(lw)}`);
          const pt = pointOutside(lw, { x: 0, y: 0, w: SCREEN.w, h: SCREEN.h });
          if (!pt) throw new Error(`other-flyout: no room outside the Launcher to click: ${JSON.stringify(lw)}`);
          await d(`click ${pt.x} ${pt.y}`);
        }
        await expectWithin(`${how}: bar hides`, () => barState(s), false, 4500);
        await sleep(300);
        await noFlyoutOpen(s, how);
        await d("notepad close");
      }
    },
  },
  {
    id: "topbar-overlap-maximised",
    title: "Top Bar (smart dodge): a maximised window hides it; the top edge reveals it; leaving hides it",
    async run(s) {
      await setConfig(s, topBarCfg("overlap"));
      await d(`move ${mid().join(" ")}`);
      await sleep(1500);
      // Something else on this machine may already cover the top of the screen; the bar must come
      // back to whatever state it had before Notepad opened.
      const baseline = (await barState(s)).shown;
      await d("notepad max");
      await d(`move ${mid().join(" ")}`);
      await expectWithin("maximised", () => barState(s), false, 3000);
      await d(`move ${mid()[0]} 0`);
      await expectWithin("reveal over a maximised window", () => barState(s), true, 1500);
      await expectNoFlicker("leave", () => d(`move ${mid().join(" ")}`));
      await expectWithin("leave", () => barState(s), false, 2000);
      await d("notepad close");
      await expectWithin("Notepad closed: back to how it was", () => barState(s), baseline, 3000);
    },
  },
  {
    id: "dock-bottom",
    title: "Dock (bottom, always hide): hides when away, the bottom edge reveals it, a settings save keeps it hidden",
    async run(s) {
      await setConfig(s, (c) => { c.dock.autoHide = "always"; c.dock.position = "bottom"; });
      await d(`move ${mid().join(" ")}`);
      await expectWithin("idle", () => dockState(s), false, 3000);
      await d(`move ${mid()[0]} ${SCREEN.h - 1}`);
      await expectWithin("reveal", () => dockState(s), true, 1500);
      await d(`move ${mid().join(" ")}`);
      await expectWithin("leave", () => dockState(s), false, 2500);
      await setConfig(s, (c) => { c.theme.preset = "alabaster-daylight"; });
      await expectStays("after a settings save", () => dockState(s), false, 2500);
      await noFlyoutOpen(s, "dock-bottom");
    },
  },
  {
    id: "dock-top",
    title: "Dock (top edge, always hide, no Top Bar): same behaviour at the top",
    async run(s) {
      await setConfig(s, (c) => { c.dock.autoHide = "always"; c.dock.position = "top"; c.topBar.enabled = false; });
      await sleep(1200);
      await d(`move ${mid().join(" ")}`);
      await expectWithin("idle", () => dockState(s), false, 3000);
      await d(`move ${mid()[0]} 0`);
      await expectWithin("reveal", () => dockState(s), true, 1500);
      await d(`move ${mid().join(" ")}`);
      await expectWithin("leave", () => dockState(s), false, 2500);
      await noFlyoutOpen(s, "dock-top");
    },
  },
  sideDockScenario("left"),
  sideDockScenario("right"),
  {
    id: "explorer-restart",
    title: "Explorer restarts while Lens runs: Lens stays up, the Dock stays shown where it belongs, the shell hook is registered again",
    async run(s) {
      await setConfig(s, (c) => { c.dock.autoHide = "never"; c.dock.position = "bottom"; });
      await sleep(1500);
      const before = await d("explorer count");
      if (!before.before) {
        console.log("      (no explorer.exe in this session: restart path not exercised)");
        return;
      }
      const placed = await d(`win ${DOCK}`);
      const logStart = s.logs.join("").length;
      const r = await d("explorer restart");
      if (!r.tray) throw new Error(`Explorer did not come back: ${JSON.stringify(r)}`);
      await sleep(3000);
      if (s.proc.exitCode !== null) throw new Error(`Lens exited with ${s.proc.exitCode} when Explorer restarted`);
      await expectWithin("Dock after the restart", () => dockState(s), true, 3000);
      const w = await d(`win ${DOCK}`);
      if (!w.found || !w.visible) throw new Error(`Dock window not visible after the restart: ${JSON.stringify(w)}`);
      // Same monitor and work area as before, so the same place (the watcher re-places it if not).
      const work = await d("work");
      if (w.y + w.h > work.y + work.h + 2 || w.x !== placed.x) throw new Error(`Dock moved: before ${JSON.stringify(placed)}, after ${JSON.stringify(w)}, work area ${JSON.stringify(work)}`);
      const said = s.logs.join("").slice(logStart);
      const hookless = /the shell hook is not available/.test(s.logs.join(""));
      if (!hookless && !/shell hook registered again: true/.test(said)) throw new Error("the attention shell hook was not registered again after Explorer restarted");
    },
  },
];

// ---- runner ---------------------------------------------------------------------------------
const results = [];
SCREEN = await d("screen");
let s;
try {
  s = await startLens();
  await page(s, "dock");
  await page(s, "topbar");
  // The start-up windows (Settings, Search, Quick Settings, Launcher, ...) are built one after the
  // other on the main thread after the Dock and Top Bar are up. While a build runs, every watcher
  // pass that asks a window anything waits for the main thread, so auto-hide stalls for seconds.
  // The first scenario used to run in the middle of that (the Search window was still being
  // built when topbar-hides-idle failed). Wait for Lens to say they are built, as failsafe.mjs does.
  const t0Built = Date.now();
  while (!s.logs.join("").includes("Start-up windows") && Date.now() - t0Built < 90000) await sleep(250);
  console.log(`      start-up windows: ${s.logs.join("").includes("Start-up windows built.") ? "built" : "still building"} after ${Date.now() - t0Built} ms`);
  await sleep(2000);
  // A fresh profile opens the first-run setup in Settings; a focused Settings window (rightly)
  // holds the Dock up, so finish it and close every flyout before measuring auto-hide.
  // Both markers: with only onboardingCompleted, the setup reopens as "What's new" because the
  // seen version doesn't match, and its Settings window then holds the Top Bar up mid-test.
  const appVersion = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version;
  await setConfig(s, (c) => { c.onboardingCompleted = true; c.setupSeenVersion = appVersion; });
  for (const f of ["settings", ...FLYOUTS]) await invoke(surfaces(s).dock, "hide_surface", { label: f }).catch(() => {});
  await sleep(800);
  const original = await invoke(surfaces(s).dock, "get_config");
  for (const sc of SCENARIOS) {
    if (ONLY.length && !ONLY.includes(sc.id)) continue;
    const t0 = Date.now();
    try {
      await sc.run(s);
      results.push({ id: sc.id, title: sc.title, status: "pass", ms: Date.now() - t0 });
      console.log(`ok   ${sc.id}: ${sc.title}`);
    } catch (e) {
      results.push({ id: sc.id, title: sc.title, status: "fail", ms: Date.now() - t0, error: String(e.message || e) });
      console.log(`FAIL ${sc.id}: ${sc.title}\n      ${String(e.message || e).replace(/\n/g, "\n      ")}`);
      await surfaces(s).topbar?.screenshot({ path: join(outDir, `autohide-${sc.id}-topbar.png`) }).catch(() => {});
      const cfgNow = await invoke(surfaces(s).dock, "get_config").catch(() => null);
      const openNow = [];
      for (const f of ["settings", ...FLYOUTS]) if (await invoke(surfaces(s).dock, "is_surface_visible_cmd", { label: f }).catch(() => false)) openNow.push(f);
      console.log(`      state: topBar.autoHide=${cfgNow?.topBar?.autoHide} setupSeen=${cfgNow?.setupSeenVersion} open=[${openNow.join(", ")}]`);
      if (sc.id.startsWith("topbar") && !/Lens: watcher has the bar/.test(String(e.message))) console.log(await barDiag(s).catch(() => ""));
      const tail = s.logs.join("").split("\n").filter((l) => /\[watcher\]|palette|surface/i.test(l)).slice(-14);
      if (tail.length) console.log("      Lens said:\n        " + tail.join("\n        "));
    } finally {
      await d("notepad close").catch(() => {});
      await invoke(surfaces(s).dock, "save_config_cmd", { newConfig: original }).catch(() => {});
      for (const f of FLYOUTS) await invoke(surfaces(s).dock, "hide_surface", { label: f }).catch(() => {});
      await sleep(600);
    }
  }
} catch (e) {
  results.push({ id: "session", status: "fail", error: String(e.stack || e) });
  console.log(`FAIL session: ${e.stack || e}`);
} finally {
  if (s) await quit(s);
  desk.stdin.end();
}
writeFileSync(join(outDir, "autohide.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.status === "fail");
console.log(`[autohide] ${results.length - failed.length}/${results.length} scenarios passed`);
process.exit(failed.length ? 1 : 0);

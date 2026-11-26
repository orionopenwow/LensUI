// Real-Windows auto-hide tests for the Top Bar and the Dock (docs/TESTING.md › Auto-hide).
// Moves the real cursor (tools/e2e/desk.ps1), reads the real window state (visible, click-through,
// rect) and the page state (`.is-hidden`), and checks after every step that the bar/Dock is where
// it should be, nothing stays stuck open, nothing flickers, and no flyout is left behind.
//
// Run on Windows after the E2E build (same setup as tests/e2e/run.mjs):
//   node tests/e2e/autohide.mjs                 # E2E_ONLY=topbar-reveal,dock-bottom for a subset
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
/** Waits until `read()` reports `shown === want`, up to `ms`. Returns the elapsed ms or throws. */
async function expectWithin(label, read, want, ms) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 <= ms) {
    last = await read();
    if (last.shown === want && (want || !last.hiddenTakesClicks)) return Date.now() - t0;
    await sleep(50);
  }
  throw new Error(`${label}: expected ${want ? "shown" : "hidden"} within ${ms} ms, got ${JSON.stringify(last)}`);
}
/** Stays in state `want` for `ms` (no stuck change, no surprise). */
async function expectStays(label, read, want, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 <= ms) {
    const st = await read();
    if (st.shown !== want || (!want && st.hiddenTakesClicks)) throw new Error(`${label}: expected to stay ${want ? "shown" : "hidden"}, got ${JSON.stringify(st)} after ${Date.now() - t0} ms`);
    await sleep(100);
  }
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

// ---- scenarios ------------------------------------------------------------------------------
let SCREEN;
const mid = () => [Math.round(SCREEN.w / 2), Math.round(SCREEN.h / 2)];
const topBarCfg = (mode) => (c) => {
  c.topBar.enabled = true;
  c.dock.showTopBar = true;
  c.topBar.autoHide = mode;
  c.topBar.revealDelayMs = 100;
  c.topBar.hideDelayMs = 350;
};

const SCENARIOS = [
  {
    id: "topbar-hides-idle",
    title: "Top Bar (always hide): hides when the pointer is away",
    async run(s) {
      await setConfig(s, topBarCfg("always"));
      await d(`move ${mid().join(" ")}`);
      await expectWithin("idle", () => barState(s), false, 2500);
      await expectStays("idle", () => barState(s), false, 1200);
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
          await d(`click ${Math.round(SCREEN.w * 0.25)} ${Math.round(SCREEN.h * 0.7)}`);
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
      await setConfig(s, (c) => { c.dock.autoHide = "always"; c.dock.position = "top"; c.dock.showTopBar = false; });
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
];

// ---- runner ---------------------------------------------------------------------------------
const results = [];
SCREEN = await d("screen");
let s;
try {
  s = await startLens();
  await page(s, "dock");
  await page(s, "topbar");
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

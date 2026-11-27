// Fluidity budgets (docs/TESTING.md › Perf). Renders the real frontend with mocked Tauri, throttles
// the CPU 4× through DevTools, drives each interaction and measures:
//   frame p50/p95 (ms between animation frames), long tasks > 50 ms, layout shift (CLS),
//   and first contentful paint of the surface.
// Then compares with tools/perf/budgets.json: a metric more than 20 % (plus a small absolute
// allowance for timer noise) above its baseline fails the run.
//
//   node tools/robust/build.mjs && node tools/perf/run.mjs            # check
//   node tools/perf/run.mjs --update                                  # re-baseline from this machine
//   PERF_ONLY=dock-hover-sweep,theme-switch node tools/perf/run.mjs   # a subset
//   PERF_SCENE_MS=5000 (default) — how long each Playground scene runs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve, launch, openSurface, setConfig, settingsTabs, pct, here as robustDir } from "../robust/lib.mjs";

const perfDir = join(robustDir, "../perf");
const outDir = join(perfDir, "out");
mkdirSync(outDir, { recursive: true });
const UPDATE = process.argv.includes("--update");
const ONLY = (process.env.PERF_ONLY || "").split(",").filter(Boolean);
const SCENE_MS = Number(process.env.PERF_SCENE_MS || 5000);
const THROTTLE = Number(process.env.PERF_THROTTLE || 4);

/** Regression rule: fail when measured > baseline × 1.2 + allowance. */
const TOLERANCE = 0.2;
// Frame times are quantised to display frames (16.7 ms at 60 Hz): one frame of allowance on p50/p95.
// First paint on the shared CI runners swings by ~300 ms between identical runs; it is a
// coarse regression guard, not a precise gate.
const ALLOW = { p50: 17, p95: 17, longTasks: 3, cls: 0.02, fcp: 350 };

async function sweep(page, selector, passes = 2, steps = 40) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`nothing to sweep: ${selector}`);
  const y = box.y + box.height / 2;
  for (let p = 0; p < passes; p++) {
    const from = p % 2 ? box.x + box.width : box.x;
    const to = p % 2 ? box.x : box.x + box.width;
    for (let i = 0; i <= steps; i++) {
      await page.mouse.move(from + ((to - from) * i) / steps, y);
      await page.waitForTimeout(16);
    }
  }
  await page.mouse.move(box.x + box.width / 2, box.y - 300);
}

// Magic Dashboard warm open (wave M2): Lens says "open", the window rebuilds its lanes from local
// data and paints. Budget: under 150 ms, unthrottled (it's a wall-clock promise, not a frame metric).
const DASHBOARD_WARM_MS = 150;
async function dashboardWarmOpens(p, n = 7) {
  const times = [];
  for (let i = 0; i < n; i++) {
    await p.evaluate(() => { delete document.documentElement.dataset.dashboardWarmMs; window.__lensEmit("lens://dashboard-open", null); });
    await p.waitForFunction(() => document.documentElement.dataset.dashboardWarmMs !== undefined, null, { timeout: 5000 });
    times.push(Number(await p.evaluate(() => document.documentElement.dataset.dashboardWarmMs)));
    await p.waitForTimeout(150);
  }
  times.sort((a, b) => a - b);
  await p.evaluate((ms) => (window.__perf.warm = ms), times[Math.floor(times.length / 2)]);
  return 0;
}

/** Rapid presses (DESIGN.md §5.4): down/up pairs faster than the 90 ms minimum hold, across controls. */
async function rapidPresses(p, selectors, n = 24) {
  const boxes = [];
  for (const s of selectors) {
    const all = p.locator(s);
    const count = Math.min(await all.count(), 4);
    for (let i = 0; i < count; i++) {
      const b = await all.nth(i).boundingBox({ timeout: 2000 }).catch(() => null);
      if (b && b.width && b.y + b.height < (p.viewportSize()?.height ?? 9999)) boxes.push(b);
    }
  }
  if (!boxes.length) throw new Error(`nothing to press: ${selectors.join(", ")}`);
  for (let i = 0; i < n; i++) {
    const b = boxes[i % boxes.length];
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.mouse.down();
    await p.waitForTimeout(i % 3 === 0 ? 120 : 25);
    await p.mouse.up();
    await p.waitForTimeout(40);
  }
  await p.waitForTimeout(300);
  return n;
}

/** A pop-out growing from its bar button and returning to it, as the backend drives it. */
async function popoutGrow(p, label, n = 5) {
  for (let i = 0; i < n; i++) {
    await p.evaluate((l) => {
      window.__lensEmit("lens://surface-origin", { label: l, left: window.screenX + window.innerWidth - 60, top: window.screenY - 30, width: 28, height: 26, at: Date.now() });
      window.__lensEmit("lens://surface-glide", { label: l, state: "pre" });
      requestAnimationFrame(() => window.__lensEmit("lens://surface-glide", { label: l, state: "open" }));
    }, label);
    await p.waitForTimeout(420);
    await p.evaluate((l) => window.__lensEmit("lens://surface-glide", { label: l, state: "closing" }), label);
    await p.waitForTimeout(260);
  }
  return n;
}

const SCENARIOS = {
  // The feel (DESIGN.md §5.4): weighted presses on the kit and on Settings' own controls, and a
  // Quick settings pop-out growing from its trigger, all within the frame budget.
  "feel-rapid-press": {
    surface: "feel",
    page: "feel/index.html",
    query: "mode=demo",
    run: (p) => rapidPresses(p, ['[data-demo="medium"]', '[data-demo="heavy"]', '[role="switch"]', '[data-demo="trigger"]']),
  },
  "feel-settings-press": {
    surface: "settings",
    run: (p) => rapidPresses(p, [".sh-pagehead .cc-chip", ".cc-content [data-weight='medium']", ".cc-content [data-weight='light']"], 18),
  },
  "feel-popout-grow": { surface: "quicksettings", run: (p) => popoutGrow(p, "quicksettings") },
  "dashboard-warm-open": {
    surface: "dashboard",
    query: "magic=dashboard,widgets&dashdata=1",
    throttle: 1,
    warmBudget: DASHBOARD_WARM_MS,
    run: (p) => dashboardWarmOpens(p),
  },
  // Desktop widgets (docs/features/desktop-widgets.md): resizing a widget reflows its neighbours
  // with FLIP (transform only). Six size changes from the widget menu, plus a check that every
  // widget shares one 1 s timer.
  "deskwidgets-reflow": {
    surface: "deskwidgets",
    query: "magic=desktopWidgets&desk=sample",
    run: async (p) => {
      for (const size of ["Large", "Small", "Medium", "Large", "Small", "Medium"]) {
        await p.locator('.dwg-item[data-kind="today"]').first().click({ button: "right" });
        await p.waitForTimeout(120);
        await p.locator(".dwg-menu-row", { hasText: size }).first().click();
        await p.waitForTimeout(420);
      }
    },
  },
  "dock-hover-sweep": { surface: "dock", run: (p) => sweep(p, ".dock-icons-row") },
  "dock-magnification": {
    surface: "dock",
    setup: (p) => setConfig(p, (c) => { c.dock.magnification = "classic"; c.dock.magnificationRange = 3; }),
    run: (p) => sweep(p, ".dock-icons-row"),
  },
  "dock-search-glide": {
    surface: "dock",
    run: async (p) => {
      for (let i = 0; i < 3; i++) {
        await p.locator(".dock-search-mag-btn").first().click();
        await p.waitForTimeout(450);
        await p.keyboard.press("Escape");
        await p.waitForTimeout(450);
      }
    },
  },
  // Switching Dock styles (docs/DOCK_SMOOTHNESS.md): every style twice, with an app hovered.
  "dock-style-switch": {
    surface: "dock",
    run: async (p) => {
      for (const style of ["slim", "taskbar", "studio", "minimal", "split", "islands", "floating", "taskbar", "floating"]) {
        await setConfig(p, new Function("c", `c.dock.style = ${JSON.stringify(style)};`));
        await p.waitForTimeout(260);
        const item = p.locator(".dock-item-wrap[data-dock-pinned='true']").nth(2);
        if (await item.count()) await item.hover({ timeout: 1000 }).catch(() => {});
        await p.waitForTimeout(140);
      }
    },
  },
  "command-mini-expand": {
    surface: "command",
    run: async (p) => {
      for (let i = 0; i < 3; i++) {
        await p.evaluate(() => window.__lensEmit("lens://command/open", { layout: "mini" }));
        await p.waitForTimeout(400);
        const expand = p.locator(".mini-expand");
        if (await expand.count()) await expand.first().click();
        await p.waitForTimeout(500);
      }
    },
  },
  "theme-switch": {
    surface: "settings",
    run: async (p) => {
      for (const preset of ["catppuccin-mocha", "alabaster-daylight", "tokyo-night", "nord-frost", "obsidian", "paper-minimal"]) {
        await setConfig(p, new Function("c", `c.theme.preset = ${JSON.stringify(preset)};`));
        await p.waitForTimeout(300);
      }
    },
  },
  "settings-tab-switch": {
    surface: "settings",
    run: async (p) => {
      const tabs = settingsTabs(p);
      const n = await tabs.count();
      for (let i = 0; i < n; i++) {
        await tabs.nth(i).click();
        await p.waitForTimeout(260);
      }
      return n;
    },
    // The click-through visits every tab, so its long-task count grows with the number of tabs
    // (23 tabs today, about half that when the baseline of 11 was taken). The budget is per step: each tab's first
    // render may be one long task at 4x throttle, never more than one per tab on average.
    longTasksPerStep: 1,
  },
};
for (const scene of ["sand", "fluid", "flow", "constellation", "aurora", "rain", "starfield", "skyclock", "backdrop"]) {
  SCENARIOS[`playground-${scene}`] = {
    surface: "wallpaper",
    query: `scene=${scene}`,
    run: async (p) => {
      // Gentle pointer movement over the scene, like a person idly moving the mouse.
      const t0 = Date.now();
      let i = 0;
      while (Date.now() - t0 < SCENE_MS) {
        await p.mouse.move(200 + 300 * Math.sin(i / 20), 270 + 120 * Math.cos(i / 15));
        await p.waitForTimeout(50);
        i++;
      }
    },
  };
}

/** Installed before the page loads: frame times, long tasks, layout shifts, paint timing. */
function instrument() {
  const st = (window.__perf = { frames: [], long: 0, longMs: 0, cls: 0, recording: false, last: 0 });
  const tick = (t) => {
    if (st.recording && st.last) st.frames.push(t - st.last);
    st.last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => {
      if (!st.recording) return;
      for (const e of l.getEntries()) { st.long++; st.longMs += e.duration; }
    }).observe({ type: "longtask", buffered: false });
    new PerformanceObserver((l) => {
      if (!st.recording) return;
      for (const e of l.getEntries()) if (!e.hadRecentInput) st.cls += e.value;
    }).observe({ type: "layout-shift", buffered: false });
  } catch {}
}

const server = await serve();
const browser = await launch();

async function measure(name, sc) {
  // Instrument and throttle, then reload so first paint is measured on the slow machine too.
  const page = await openSurface(browser, server.base, { surface: sc.surface, page: sc.page, query: sc.query || "", settle: 0 });
  await page.addInitScript(instrument);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: sc.throttle ?? THROTTLE });
  await page.reload();
  await page.waitForTimeout(1200);
  if (sc.setup) { await sc.setup(page); await page.waitForTimeout(400); }
  const fcp = await page.evaluate(() => performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint")?.startTime ?? 0);
  await page.evaluate(() => { window.__perf.frames = []; window.__perf.recording = true; });
  const steps = (await sc.run(page)) || 0;
  const st = await page.evaluate(() => { window.__perf.recording = false; return window.__perf; });
  // Drop the first frame (it straddles the start) and anything over 1 s (tab was idle).
  const frames = st.frames.slice(1).filter((f) => f < 1000);
  if (page.problems.errors.length) console.log(`  errors in ${name}:\n    ${page.problems.errors.join("\n    ")}`);
  const r = {
    p50: +pct(frames, 50).toFixed(1),
    p95: +pct(frames, 95).toFixed(1),
    longTasks: st.long,
    cls: +st.cls.toFixed(4),
    fcp: +fcp.toFixed(0),
    frames: frames.length,
    errors: page.problems.errors.length,
    steps,
    ...(st.warm !== undefined ? { warm: st.warm } : {}),
  };
  await page.context().close();
  return r;
}

const budgetsPath0 = join(perfDir, "budgets.json");
let baseline0 = {};
try { baseline0 = JSON.parse(readFileSync(budgetsPath0, "utf8")).baseline || {}; } catch {}
const limitFor = (name, k, r, b) => {
  const per = k === "longTasks" && SCENARIOS[name]?.longTasksPerStep;
  return per && r.steps ? r.steps * per : b[k] * (1 + TOLERANCE) + ALLOW[k];
};
const over = (name, r, b) => b && ["p50", "p95", "longTasks", "cls", "fcp"].some((k) => r[k] > limitFor(name, k, r, b));

const results = {};
for (const [name, sc] of Object.entries(SCENARIOS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  let r = await measure(name, sc);
  // Shared CI runners have noisy neighbours, and a few scenarios are bimodal there (settings-tab-switch
  // lands on 9 or 17 long tasks for the same commit). A scenario over budget gets up to two more
  // tries and each metric keeps its best run. A real regression fails all three.
  for (let attempt = 0; attempt < 2 && !UPDATE && over(name, r, baseline0[name]); attempt++) {
    const again = await measure(name, sc);
    console.log(`  retried ${name} (${attempt + 1})${again.steps ? `, ${again.steps} steps, ${again.longTasks} long tasks` : ""}`);
    r = Object.fromEntries(Object.keys(r).map((k) => [k, k === "frames" || k === "steps" ? Math.max(r[k], again[k]) : Math.min(r[k], again[k])]));
  }
  results[name] = r;
}
await browser.close();
server.close();

const budgetsPath = join(perfDir, "budgets.json");
let budgets = {};
try { budgets = JSON.parse(readFileSync(budgetsPath, "utf8")); } catch {}
const base = budgets.baseline || {};
const failures = [];
const rows = [];
for (const [name, r] of Object.entries(results)) {
  const b = base[name];
  const flags = [];
  if (b) {
    for (const k of ["p50", "p95", "longTasks", "cls", "fcp"]) {
      const limit = limitFor(name, k, r, b);
      if (r[k] > limit) flags.push(`${k} ${r[k]} > ${limit.toFixed(k === "cls" ? 3 : 1)}`);
    }
  } else if (!UPDATE) flags.push("no baseline");
  const warmBudget = SCENARIOS[name]?.warmBudget;
  if (warmBudget) {
    if (r.warm === undefined || r.warm > warmBudget) failures.push(`${name}: warm open ${r.warm ?? "not measured"} ms > ${warmBudget} ms`);
    flags.push(`warm open ${r.warm} ms (budget ${warmBudget})`);
  }
  if (r.errors) flags.push(`${r.errors} page errors`);
  if (flags.length && b) failures.push(`${name}: ${flags.join(", ")}`);
  rows.push(`| ${name} | ${r.p50} | ${r.p95} | ${r.longTasks} | ${r.cls} | ${r.fcp} | ${r.frames} | ${flags.join("; ") || "ok"} |`);
}
const table = [
  `CPU throttle ${THROTTLE}×. Frame times in ms; FCP in ms.`,
  "",
  "| scenario | p50 | p95 | long tasks | CLS | FCP | frames | vs budget |",
  "|---|---|---|---|---|---|---|---|",
  ...rows,
].join("\n");
console.log(table);
writeFileSync(join(outDir, "report.md"), table + "\n");
writeFileSync(join(outDir, "report.json"), JSON.stringify(results, null, 2));

if (UPDATE) {
  const next = {
    _note: "Baseline per scenario from `node tools/perf/run.mjs --update`. A run fails when a metric exceeds baseline × 1.2 plus a small allowance (see run.mjs). Re-baseline only after an intended change, on the CI runner's numbers (perf-report artifact).",
    throttle: THROTTLE,
    baseline: { ...base, ...Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { p50: r.p50, p95: r.p95, longTasks: r.longTasks, cls: r.cls, fcp: r.fcp }])) },
  };
  writeFileSync(budgetsPath, JSON.stringify(next, null, 2) + "\n");
  console.log(`[perf] baseline written to ${budgetsPath}`);
  process.exit(0);
}
if (failures.length) {
  console.log(`\n[perf] ${failures.length} regression(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`[perf] ${Object.keys(results).length} scenarios within budget`);

// Shared plumbing for the robustness suites (perf, visual, soak, a11y): serves the harness built by
// tools/robust/build.mjs, launches Chromium and opens surfaces with error capture.
// Env: ROBUST_PLAYWRIGHT (path to a playwright module), ROBUST_CHROME (browser executable).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "../..");
export const out = join(here, "out");

/** Surface → viewport, matching the window sizes Lens uses (tools/parity/shoot.mjs). */
export const SURFACES = {
  dock: [1920, 760],
  topbar: [1920, 34],
  settings: [760, 560],
  palette: [660, 460],
  widgets: [360, 680],
  quicksettings: [404, 580],
  notifications: [364, 420],
  desktopfolder: [420, 640],
  launcher: [780, 640],
  overview: [1120, 700],
  wallpaper: [960, 540],
  command: [1000, 640],
  browser: [1280, 800],
  // The desktop widgets host covers a work area (the mock turns the flag on for it).
  deskwidgets: [1600, 900],
};

export const PRESETS = ["obsidian", "catppuccin-mocha", "alabaster-daylight"];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

/** Static server for one or more folders: the first folder wins. Returns { base, close }. */
export async function serve(dirs = [out]) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    for (const dir of dirs) {
      const file = join(dir, path);
      if (!file.startsWith(dir)) continue;
      try {
        const body = await readFile(file);
        return res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
      } catch {}
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

export async function launch() {
  const mod = process.env.ROBUST_PLAYWRIGHT ? pathToFileURL(process.env.ROBUST_PLAYWRIGHT).href : "playwright";
  const { chromium } = await import(mod);
  return chromium.launch(process.env.ROBUST_CHROME ? { executablePath: process.env.ROBUST_CHROME } : {});
}

const IGNORE = [/favicon\.ico/i];

/**
 * Opens a surface and collects problems into `page.problems`:
 *   errors      — uncaught exceptions, console.error, failed requests
 *   rejections  — unhandled promise rejections (recorded, not thrown, so chaos runs can count them)
 * Options: surface, preset, width/height, query (extra URL params), reducedMotion, colorScheme,
 * fixedTime (freezes Date for clocks), settle (ms to wait after load), page (another page under the
 * harness folder instead of harness.html, e.g. "feel/index.html" from tools/parity/feel/build.mjs).
 */
export async function openSurface(browser, base, opts) {
  const { surface, preset = "obsidian", query = "", settle = 900 } = opts;
  const [dw, dh] = SURFACES[surface] || [1000, 700];
  const context = await browser.newContext({
    viewport: { width: opts.width || dw, height: opts.height || dh },
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
    colorScheme: opts.colorScheme || "dark",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.problems = { errors: [], rejections: [] };
  // A state can seed globals the mocks read before the surface loads (e.g. Lens Browser's look).
  if (opts.init) await page.addInitScript(opts.init);
  await page.addInitScript(() => {
    window.__lensRejections = [];
    window.addEventListener("unhandledrejection", (e) => {
      const r = e.reason;
      window.__lensRejections.push(String((r && (r.stack || r.message)) || r).slice(0, 400));
      e.preventDefault();
    });
  });
  if (opts.fixedTime) await page.clock.setFixedTime(new Date(opts.fixedTime));
  page.on("pageerror", (e) => page.problems.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) page.problems.errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !IGNORE.some((re) => re.test(r.url()))) page.problems.errors.push(`http ${r.status()}: ${r.url()}`);
  });
  await page.goto(`${base}/${opts.page || "harness.html"}?surface=${surface}&preset=${preset}${query ? "&" + query : ""}`);
  await page.waitForTimeout(settle);
  page.collectRejections = async () => {
    const r = await page.evaluate(() => window.__lensRejections.splice(0));
    page.problems.rejections.push(...r);
    return page.problems.rejections;
  };
  return page;
}

/** Replaces the mocked config and broadcasts it the way the backend does after save_config_cmd. */
export async function setConfig(page, mutate) {
  await page.evaluate((src) => {
    const fn = new Function("c", src);
    const next = JSON.parse(JSON.stringify(window.__lensConfig()));
    fn(next);
    window.__lensSetConfig(next);
    window.__lensEmit("lens://config-updated", next);
  }, `(${mutate.toString()})(c)`);
}

export function pct(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

/** The Control Center's tab buttons (the sidebar also holds "Setup Wizard" and "Quit"). */
export function settingsTabs(page) {
  return page.locator(".cc-nav-btn").filter({ hasNotText: /Setup Wizard|Quit Lens/ });
}

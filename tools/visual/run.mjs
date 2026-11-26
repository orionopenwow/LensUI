// Visual regression (docs/TESTING.md › Visual): renders the key state of every surface in three
// theme packs at two window sizes and compares each with its golden image in tools/parity/golden/.
//
//   node tools/robust/build.mjs && node tools/visual/run.mjs           # compare
//   node tools/visual/run.mjs --update                                 # accept the current renders
//   VISUAL_ONLY=dock,settings  VISUAL_PRESETS=obsidian                 # subsets
//   VISUAL_TOLERANCE=0.002     # share of pixels allowed to differ (default 0.1 %)
//
// Rendering is made deterministic: the clock is frozen (Wed 15 Jan 2026 10:30), animations are
// off (reduced motion + Playwright's animation freeze), the caret is hidden, and live clocks are
// masked as a second line of defence. A missing golden is written to tools/visual/out/new/ and
// reported; it fails the run only with VISUAL_REQUIRE_GOLDENS=1 (CI sets it once goldens exist).
//
// Goldens depend on the font stack, so they are recorded on the CI runner (ubuntu-latest, the
// Playwright version pinned in e2e.yml). Re-record by downloading the `visual-new` artifact.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { serve, launch, openSurface, settingsTabs, PRESETS, here as robustDir } from "../robust/lib.mjs";

const goldenDir = join(robustDir, "../parity/golden");
const outDir = join(robustDir, "../visual/out");
rmSync(outDir, { recursive: true, force: true });
for (const d of ["actual", "diff", "new"]) mkdirSync(join(outDir, d), { recursive: true });
mkdirSync(goldenDir, { recursive: true });

const UPDATE = process.argv.includes("--update");
const ONLY = (process.env.VISUAL_ONLY || "").split(",").filter(Boolean);
const PRESET_LIST = (process.env.VISUAL_PRESETS || PRESETS.join(",")).split(",");
const TOLERANCE = Number(process.env.VISUAL_TOLERANCE || 0.001);
const REQUIRE = process.env.VISUAL_REQUIRE_GOLDENS === "1";
const FIXED_TIME = "2026-01-15T10:30:00";
const MASK = [".topbar-clock", ".wp-idle-clock", "[data-live]"];

/** Each state at two sizes: the window size Lens uses, and a second common size. */
const STATES = [
  { id: "dock", surface: "dock", sizes: [[1920, 760], [1366, 640]] },
  { id: "dock-hover", surface: "dock", hover: ".dock-item >> nth=3", sizes: [[1920, 760], [1366, 640]] },
  // The Dock's music pop-out (hover Spotify): art row with level meter, progress, controls, sound glow.
  { id: "dock-music", surface: "dock", hover: '.dock-item[aria-label^="Spotify"]', sizes: [[1920, 760], [1366, 640]] },
  { id: "dock-search", surface: "dock", click: ".dock-search-mag-btn", sizes: [[1920, 760], [1366, 640]] },
  { id: "dock-taskbar", surface: "dock", config: "c.dock.style = 'taskbar';", sizes: [[1920, 760], [1366, 640]] },
  { id: "topbar", surface: "topbar", sizes: [[1920, 34], [1366, 34]] },
  { id: "settings", surface: "settings", sizes: [[760, 560], [1024, 700]] },
  { id: "settings-theme", surface: "settings", tab: /Appearance/, sizes: [[760, 560], [1024, 700]] },
  { id: "settings-dock", surface: "settings", tab: /Dock/, sizes: [[760, 560], [1024, 700]] },
  { id: "settings-ai", surface: "settings", tab: /AI/, sizes: [[760, 560], [1024, 700]] },
  { id: "palette", surface: "palette", sizes: [[660, 460], [760, 560]] },
  { id: "palette-query", surface: "palette", query: "spo", sizes: [[660, 460], [760, 560]] },
  { id: "launcher", surface: "launcher", sizes: [[780, 640], [1024, 720]] },
  { id: "widgets", surface: "widgets", sizes: [[360, 680], [400, 760]] },
  { id: "quicksettings", surface: "quicksettings", sizes: [[404, 580], [440, 640]] },
  { id: "notifications", surface: "notifications", sizes: [[364, 420], [400, 520]] },
  { id: "desktopfolder", surface: "desktopfolder", sizes: [[420, 640], [520, 700]] },
  { id: "overview", surface: "overview", sizes: [[1120, 700], [1366, 768]] },
  { id: "command-mini", surface: "command", open: { layout: "mini" }, sizes: [[376, 456], [440, 520]] },
  { id: "command-full", surface: "command", open: { layout: "full" }, sizes: [[1000, 640], [760, 560]] },
  // Lens Browser: tab position and the five horizontal styles (src/browser/tabModes.ts), and the setup.
  ...["vertical", "curved", "joined", "compact", "dynamic", "merged"].map((m) => ({
    id: `browser-tabs-${m}`,
    surface: "browser",
    init: `window.__lensBrowserAppearance = ${JSON.stringify(m === "vertical" ? { tabsLayout: "vertical" } : { tabsLayout: "horizontal", tabStyle: m })};`,
    sizes: [[1280, 800], [1024, 700]],
  })),
  { id: "browser-setup", surface: "browser", init: "window.__lensBrowserSetup = true;", sizes: [[1280, 800], [1024, 700]] },
];

/** In-browser image diff (no native dependencies): counts pixels whose largest channel delta
 * exceeds `threshold` and paints them red over a faded copy of the expected image. */
async function diffImages(page, expectedB64, actualB64, threshold = 26) {
  return page.evaluate(
    async ({ e, a, threshold }) => {
      const load = (b64) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + b64; });
      const [ie, ia] = await Promise.all([load(e), load(a)]);
      if (ie.width !== ia.width || ie.height !== ia.height) return { sizeMismatch: `${ie.width}x${ie.height} vs ${ia.width}x${ia.height}`, ratio: 1 };
      const w = ie.width, h = ie.height;
      const c = (img) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
      const de = c(ie), da = c(ia);
      const out = new ImageData(w, h);
      let diff = 0;
      for (let p = 0; p < de.data.length; p += 4) {
        const d = Math.max(Math.abs(de.data[p] - da.data[p]), Math.abs(de.data[p + 1] - da.data[p + 1]), Math.abs(de.data[p + 2] - da.data[p + 2]), Math.abs(de.data[p + 3] - da.data[p + 3]));
        if (d > threshold) { diff++; out.data.set([255, 0, 64, 255], p); }
        else { const g = (de.data[p] + de.data[p + 1] + de.data[p + 2]) / 3; out.data.set([g, g, g, 40 + de.data[p + 3] * 0.2], p); }
      }
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").putImageData(out, 0, 0);
      return { ratio: diff / (w * h), pixels: diff, diffPng: diff ? cv.toDataURL("image/png").split(",")[1] : null };
    },
    { e: expectedB64, a: actualB64, threshold }
  );
}

/** VISUAL_EMIT_B64=1: also print new/changed renders into the log as base64, for runners whose
 * artifacts can't be downloaded. Reassemble with tools/visual/from-log.mjs. */
function emit(name, png) {
  if (process.env.VISUAL_EMIT_B64 !== "1") return;
  const b64 = png.toString("base64");
  const size = 60000;
  const parts = Math.ceil(b64.length / size);
  for (let i = 0; i < parts; i++) console.log(`VISUALB64|${name}|${i}|${parts}|${b64.slice(i * size, (i + 1) * size)}`);
}

const server = await serve();
const browser = await launch();
const diffPage = await (await browser.newContext()).newPage();
const report = [];
let failed = 0;
let missing = 0;
for (const preset of PRESET_LIST) {
  for (const st of STATES) {
    if (ONLY.length && !ONLY.includes(st.surface) && !ONLY.includes(st.id)) continue;
    for (const [width, height] of st.sizes) {
      const name = `${st.id}-${preset}-${width}x${height}`;
      const page = await openSurface(browser, server.base, { surface: st.surface, preset, width, height, reducedMotion: true, fixedTime: FIXED_TIME, settle: 900, colorScheme: preset.includes("daylight") ? "light" : "dark", init: st.init });
      if (st.config) {
        await page.evaluate((src) => { const c = JSON.parse(JSON.stringify(window.__lensConfig())); new Function("c", src)(c); window.__lensSetConfig(c); window.__lensEmit("lens://config-updated", c); }, st.config);
      }
      if (st.open) await page.evaluate((o) => window.__lensEmit("lens://command/open", o), st.open);
      if (st.tab) await settingsTabs(page).filter({ hasText: st.tab }).first().click();
      if (st.hover) await page.locator(st.hover).hover();
      if (st.click) await page.locator(st.click).first().click();
      // The palette's search field lives in the Top Bar / Dock, which send lens://palette-query.
      if (st.query) await page.evaluate((q) => window.__lensEmit("lens://palette-query", q), st.query);
      await page.waitForTimeout(500);
      const masks = MASK.map((m) => page.locator(m));
      const png = await page.screenshot({ animations: "disabled", caret: "hide", mask: masks, maskColor: "#7F7F7F" });
      writeFileSync(join(outDir, "actual", `${name}.png`), png);
      const goldenPath = join(goldenDir, `${name}.png`);
      const errors = page.problems.errors;
      await page.context().close();
      let status = "ok";
      let ratio = 0;
      if (UPDATE) {
        writeFileSync(goldenPath, png);
        status = "updated";
      } else if (!existsSync(goldenPath)) {
        writeFileSync(join(outDir, "new", `${name}.png`), png);
        emit(name, png);
        status = "missing";
        missing++;
      } else {
        const r = await diffImages(diffPage, readFileSync(goldenPath).toString("base64"), png.toString("base64"));
        ratio = r.ratio;
        if (r.sizeMismatch || r.ratio > TOLERANCE) {
          status = r.sizeMismatch ? `size ${r.sizeMismatch}` : `${(r.ratio * 100).toFixed(3)} % differs`;
          failed++;
          if (r.diffPng) writeFileSync(join(outDir, "diff", `${name}.png`), Buffer.from(r.diffPng, "base64"));
          emit(name, png);
        }
      }
      if (errors.length) { status += ` · ${errors.length} page errors`; failed++; }
      report.push({ name, status, ratio, errors });
      if (status !== "ok") console.log(`${status.padEnd(18)} ${name}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    }
  }
}
await browser.close();
server.close();
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`[visual] ${report.length} images: ${report.length - failed - missing} match, ${failed} differ, ${missing} without a golden${UPDATE ? " (goldens updated)" : ""}`);
if (missing && !UPDATE) console.log(`[visual] new images are in tools/visual/out/new/ — copy them to tools/parity/golden/ to accept them`);
process.exit(failed || (REQUIRE && missing) ? 1 : 0);

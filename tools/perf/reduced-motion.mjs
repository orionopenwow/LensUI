// Animation correctness (docs/TESTING.md › Perf): with Windows' "Animation effects" off — which
// Lens maps to prefers-reduced-motion — no visible element on the key surfaces may keep a CSS
// transition or animation longer than 0 ms. Also checks the reverse: with motion allowed, the
// same surfaces do animate (so the probe itself can't silently pass on an empty page).
//
//   node tools/robust/build.mjs && node tools/perf/reduced-motion.mjs
import { serve, launch, openSurface, settingsTabs } from "../robust/lib.mjs";

const CASES = [
  { surface: "dock" },
  { surface: "dock", hover: ".dock-item" },
  { surface: "dock", click: ".dock-search-mag-btn" },
  { surface: "topbar" },
  { surface: "settings" },
  { surface: "settings", tab: 3 },
  { surface: "palette" },
  { surface: "launcher" },
  { surface: "quicksettings" },
  { surface: "notifications" },
  { surface: "widgets" },
  { surface: "overview" },
  { surface: "command", open: { layout: "mini" } },
  { surface: "command", open: { layout: "full" } },
  { surface: "wallpaper", query: "scene=aurora" },
];

function probe() {
  const secs = (x) =>
    x.split(",").map((t) => (t.trim().endsWith("ms") ? parseFloat(t) / 1000 : parseFloat(t))).reduce((a, b) => Math.max(a, b || 0), 0);
  const found = [];
  for (const el of document.querySelectorAll("#root *")) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const t = secs(cs.transitionDuration);
    const a = cs.animationName !== "none" && cs.animationIterationCount !== "0" ? secs(cs.animationDuration) : 0;
    if (t > 0.001 || a > 0.001) {
      const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(" ")[0];
      found.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} transition ${t}s animation ${a}s ${cs.animationName}`);
    }
  }
  return [...new Set(found)];
}

const server = await serve();
const browser = await launch();
let failed = 0;
let animatedWithMotion = 0;
for (const c of CASES) {
  const label = `${c.surface}${c.hover ? " hover" : ""}${c.click ? " search" : ""}${c.tab ? " tab " + c.tab : ""}${c.open ? " " + c.open.layout : ""}`;
  for (const reduced of [true, false]) {
    const page = await openSurface(browser, server.base, { surface: c.surface, query: c.query || "", reducedMotion: reduced });
    if (c.open) await page.evaluate((o) => window.__lensEmit("lens://command/open", o), c.open);
    if (c.tab) await settingsTabs(page).nth(c.tab).click();
    if (c.hover) await page.locator(c.hover).first().hover();
    if (c.click) await page.locator(c.click).first().click();
    await page.waitForTimeout(150);
    const found = await page.evaluate(probe);
    if (reduced && found.length) {
      failed++;
      console.log(`FAIL ${label}: still animates with reduced motion\n      ${found.slice(0, 12).join("\n      ")}`);
    } else if (reduced) {
      console.log(`ok   ${label}`);
    } else if (found.length) {
      animatedWithMotion++;
    }
    await page.context().close();
  }
}
await browser.close();
server.close();
if (animatedWithMotion === 0) {
  console.log("[reduced-motion] probe found no animation even with motion allowed: the probe is broken");
  process.exit(1);
}
console.log(`[reduced-motion] ${CASES.length - failed}/${CASES.length} cases still with reduced motion (${animatedWithMotion} animate normally)`);
process.exit(failed ? 1 : 0);

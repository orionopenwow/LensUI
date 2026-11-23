// Accessibility checks (docs/TESTING.md › Accessibility): runs axe-core on every Control Center
// tab and the main surfaces, in a dark (Obsidian) and a light (Alabaster Daylight) pack.
// Fails on any "serious" or "critical" violation and on every colour-contrast failure, unless the
// node is listed in tools/a11y/allowlist.json with a reason.
//
//   npm i --no-save axe-core@4 && node tools/robust/build.mjs && node tools/a11y/run.mjs
//   A11Y_AXE=/path/to/axe.min.js   — use a specific axe build
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { serve, launch, openSurface, settingsTabs, here as robustDir } from "../robust/lib.mjs";

const require = createRequire(import.meta.url);
const axePath = process.env.A11Y_AXE || require.resolve("axe-core/axe.min.js", { paths: [process.cwd(), join(robustDir, "../..")] });
const axeSource = readFileSync(axePath, "utf8");
const a11yDir = join(robustDir, "../a11y");
const outDir = join(a11yDir, "out");
mkdirSync(outDir, { recursive: true });
const allow = JSON.parse(readFileSync(join(a11yDir, "allowlist.json"), "utf8")).entries || [];

const PRESETS = [["obsidian", "dark"], ["alabaster-daylight", "light"]];
const CASES = [
  { surface: "dock" },
  { surface: "dock", label: "dock-search", click: ".dock-search-mag-btn" },
  { surface: "topbar" },
  { surface: "palette" },
  { surface: "launcher" },
  { surface: "quicksettings" },
  { surface: "notifications" },
  { surface: "widgets" },
  { surface: "desktopfolder" },
  { surface: "overview" },
  { surface: "command", label: "command-mini", open: { layout: "mini" } },
  { surface: "command", label: "command-full", open: { layout: "full" } },
  { surface: "settings", tabs: true },
];

const blocking = (v) => v.impact === "serious" || v.impact === "critical" || v.id === "color-contrast";
const allowed = (surface, v, node) =>
  allow.find((a) => a.rule === v.id && (a.surface === "*" || a.surface === surface) && (a.target === "*" || node.target.join(" ").includes(a.target)));

const server = await serve();
const browser = await launch();
const report = [];
let failures = 0;
const usedAllow = new Set();

async function check(page, label) {
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(async () =>
    window.axe.run(document.getElementById("root") || document, {
      resultTypes: ["violations"],
      // Surfaces are window fragments, not documents: page-level rules don't apply.
      rules: { "region": { enabled: false }, "landmark-one-main": { enabled: false }, "page-has-heading-one": { enabled: false }, "html-has-lang": { enabled: false }, "document-title": { enabled: false } },
    })
  );
  const surface = label.split(":")[0];
  const items = [];
  for (const v of res.violations) {
    for (const node of v.nodes) {
      const a = allowed(surface, v, node);
      if (a) { usedAllow.add(allow.indexOf(a)); continue; }
      items.push({ rule: v.id, impact: v.impact, blocking: blocking(v), target: node.target.join(" "), summary: (node.failureSummary || "").split("\n").slice(0, 2).join(" ").slice(0, 220), html: node.html.slice(0, 160) });
    }
  }
  const bad = items.filter((i) => i.blocking);
  if (bad.length) failures += bad.length;
  report.push({ label, violations: items });
  console.log(`${bad.length ? "FAIL" : "ok  "} ${label}: ${bad.length} blocking, ${items.length - bad.length} minor`);
  for (const b of bad.slice(0, 10)) console.log(`      [${b.impact}] ${b.rule} ${b.target} — ${b.summary}`);
}

for (const [preset, scheme] of PRESETS) {
  for (const c of CASES) {
    const label = c.label || c.surface;
    const page = await openSurface(browser, server.base, { surface: c.surface, preset, colorScheme: scheme, reducedMotion: true, settle: 1000 });
    if (c.open) { await page.evaluate((o) => window.__lensEmit("lens://command/open", o), c.open); await page.waitForTimeout(300); }
    if (c.click) { await page.locator(c.click).first().click(); await page.waitForTimeout(300); }
    if (c.tabs) {
      const tabs = settingsTabs(page);
      const count = await tabs.count();
      for (let i = 0; i < count; i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(350);
        const name = (await tabs.nth(i).innerText()).trim().replace(/[^A-Za-z]+/g, "-").toLowerCase();
        await check(page, `settings:${name}:${preset}`);
      }
    } else {
      await check(page, `${label}:${preset}`);
    }
    await page.context().close();
  }
}
await browser.close();
server.close();
const stale = allow.filter((_, i) => !usedAllow.has(i));
writeFileSync(join(outDir, "report.json"), JSON.stringify({ report, staleAllowlistEntries: stale }, null, 2));
if (stale.length) console.log(`[a11y] ${stale.length} allowlist entr${stale.length === 1 ? "y" : "ies"} no longer needed — remove them:\n  ${stale.map((s) => `${s.rule} ${s.surface} ${s.target}`).join("\n  ")}`);
console.log(`[a11y] ${report.length} checks, ${failures} blocking violation(s)`);
process.exit(failures ? 1 : 0);

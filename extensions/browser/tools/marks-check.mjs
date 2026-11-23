// Drives the in-page Lens marks on fixture copies of X, YouTube, GitHub and a 3D-model page in
// headless Chrome: hover → mark appears in the right place → click → command list → keys.
// Writes screenshots. Dev/CI only (not packaged).
//   node extensions/browser/tools/marks-check.mjs [outDir]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const PW = process.env.PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright/index.mjs";
const { chromium } = await import(PW);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, "..");
const OUT = path.resolve(process.argv[2] || path.join(EXT, "../../docs/screenshots/in-page-lens"));
fs.mkdirSync(OUT, { recursive: true });
const logic = fs.readFileSync(path.join(EXT, "src/content/marksLogic.js"), "utf8");
const marks = fs.readFileSync(path.join(EXT, "src/content/marks.js"), "utf8");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const problems = [];
const expect = (ok, what) => (ok ? console.log("ok  ", what) : (problems.push(what), console.log("FAIL", what)));

const SETTINGS = { on: true, adapters: ["x", "youtube", "github", "media", "images", "models", "code", "files"] };
const mockChrome = `window.__LENS_MARKS_TEST = 1; window.__sent = [];
window.chrome = { storage: { local: { get: async () => ({ lensMarks: ${JSON.stringify(SETTINGS)} }), set: async () => {} }, onChanged: { addListener() {} } },
  runtime: { sendMessage: async (m) => { window.__sent.push(m); return { ok: true }; } } };`;

async function page(file, host, scheme) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 }, colorScheme: scheme, deviceScaleFactor: 2 });
  await ctx.route(`https://${host}/**`, (r) => r.fulfill({ status: 200, contentType: "text/html", body: fs.readFileSync(path.join(HERE, "fixtures", file)) }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => problems.push(`${file}: ${e.message}`));
  await p.goto(`https://${host}/`);
  await p.addScriptTag({ content: mockChrome });
  await p.addScriptTag({ content: logic });
  await p.addScriptTag({ content: marks });
  await p.waitForTimeout(700);
  await p.evaluate(() => window.__lensMarksTest.rescan());
  return p;
}
const T = (p, fn, arg) => p.evaluate(([f, a]) => window.__lensMarksTest[f](a), [fn, arg]);

async function hoverCheck(p, selector, kind, label) {
  await p.hover(selector);
  await p.waitForTimeout(250);
  expect(await T(p, "visible"), `${label}: mark appears on hover`);
  expect((await T(p, "kind")) === kind, `${label}: kind is ${kind}`);
}

for (const scheme of ["dark", "light"]) {
  // X: mark sits in the tweet's action row; list leads with Save / Markdown / Summarise.
  {
    const p = await page("x.html", "x.com", scheme);
    await hoverCheck(p, 'article[data-testid="tweet"] >> nth=0', "post", `x ${scheme}`);
    const bar = await p.locator('article[data-testid="tweet"] >> nth=0').locator('[role="group"]').boundingBox();
    const m = await T(p, "markRect");
    expect(m.top >= bar.y - 4 && m.bottom <= bar.y + bar.height + 4 && m.right <= bar.x + bar.width + 1, `x ${scheme}: mark is inside the action row`);
    await T(p, "open");
    await p.waitForTimeout(250);
    const rows = await T(p, "rows");
    expect(rows && rows[0] === "Save to Shelf" && rows.includes("Copy as Markdown") && rows.length <= 7, `x ${scheme}: command list rows`);
    await p.screenshot({ path: path.join(OUT, `x-${scheme}.png`), clip: { x: 200, y: 0, width: 700, height: 420 } });
    await p.keyboard.type("trans");
    await p.waitForTimeout(100);
    expect(JSON.stringify(await T(p, "rows")) === JSON.stringify(["Translate", "More in Lens…"]), `x ${scheme}: typing filters`);
    await p.keyboard.press("Escape");
    expect((await T(p, "rows")) === null, `x ${scheme}: Esc closes`);
    await p.context().close();
  }
  // YouTube: mark just left of the player's right controls; also in the action row.
  {
    const p = await page("youtube.html", "www.youtube.com", scheme);
    await hoverCheck(p, "#movie_player", "yt", `youtube ${scheme}`);
    const ctl = await p.locator(".ytp-right-controls").boundingBox();
    const m = await T(p, "markRect");
    expect(m.right <= ctl.x && m.right >= ctl.x - 30 && m.top >= ctl.y - 6, `youtube ${scheme}: mark sits beside the player controls`);
    await T(p, "open");
    await p.waitForTimeout(250);
    const rows = await T(p, "rows");
    expect(rows && rows[0] === "Transcript → Shelf" && !rows.some((r) => /^Save file/.test(r)), `youtube ${scheme}: transcript first, no download`);
    await p.screenshot({ path: path.join(OUT, `youtube-${scheme}.png`), clip: { x: 60, y: 200, width: 1000, height: 460 } });
    await p.keyboard.press("Escape");
    await hoverCheck(p, "#top-level-buttons-computed", "yt", `youtube row ${scheme}`);
    await p.context().close();
  }
  // GitHub: repo header, code block, release assets.
  {
    const p = await page("github.html", "github.com", scheme);
    await hoverCheck(p, "#repository-container-header", "repo", `github header ${scheme}`);
    await T(p, "open");
    await p.waitForTimeout(250);
    expect((await T(p, "rows"))[0] === "Install with Lens Apps", `github ${scheme}: install first`);
    await p.screenshot({ path: path.join(OUT, `github-${scheme}.png`), clip: { x: 100, y: 0, width: 900, height: 420 } });
    await p.keyboard.press("Escape");
    await hoverCheck(p, ".markdown-body pre", "ghcode", `github code ${scheme}`);
    await hoverCheck(p, ".assets a >> nth=0", "ghasset", `github asset ${scheme}`);
    await p.context().close();
  }
  // 3D models: model-viewer, .glb/.stl links, and a code block on any site.
  {
    const p = await page("models.html", "models.example", scheme);
    await hoverCheck(p, "model-viewer", "model", `model-viewer ${scheme}`);
    await T(p, "open");
    await p.waitForTimeout(250);
    const rows = await T(p, "rows");
    expect(rows && rows.includes("Send to ArtCraft") && rows.includes("Preview in Lens"), `models ${scheme}: ArtCraft + preview`);
    await p.screenshot({ path: path.join(OUT, `models-${scheme}.png`), clip: { x: 100, y: 0, width: 900, height: 560 } });
    await p.keyboard.press("Escape");
    await hoverCheck(p, 'a[href$=".stl"]', "model", `stl link ${scheme}`);
    await hoverCheck(p, "pre", "code", `code block ${scheme}`);
    // Choosing an action hands it to Lens.
    await T(p, "open");
    await p.waitForTimeout(200);
    await p.keyboard.press("2"); // Explain
    await p.waitForTimeout(200);
    const sent = await p.evaluate(() => window.__sent);
    expect(sent.length === 1 && sent[0].type === "run" && sent[0].action === "explain", `models ${scheme}: number key runs an action`);
    await p.context().close();
  }
}

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : `\nall in-page mark checks passed → ${OUT}`);
process.exit(problems.length ? 1 : 0);

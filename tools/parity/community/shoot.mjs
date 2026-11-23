// Screenshots for the Claude Code community packs: the theme gallery filtered to "Claude Code",
// and six representative packs applied to the Theme & Look tab. Run tools/parity/build.mjs first.
// Env: COMMUNITY_SHOTS (output dir, default tools/parity/shots/community), PARITY_CHROME, PARITY_PLAYWRIGHT.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "out");
const shots = process.env.COMMUNITY_SHOTS || join(here, "..", "shots", "community");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(out, path);
  if (!file.startsWith(out)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {});
const failures = [];

async function open(preset, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${base}/harness.html?surface=settings&preset=${preset}`);
  await page.waitForTimeout(900);
  const themeTab = page.getByRole("button", { name: /Theme & Look/i }).first();
  if (await themeTab.count()) await themeTab.click().catch(() => {});
  await page.waitForTimeout(400);
  return { page, errors };
}

// 1) The gallery filtered to Claude Code, dark and light chrome.
for (const preset of ["obsidian", "alabaster-daylight"]) {
  const { page, errors } = await open(preset, 1024, 4200);
  await page.getByRole("button", { name: /Browse all/i }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("tab", { name: /Claude Code/i }).first().click();
  await page.waitForTimeout(400);
  const gallery = page.locator(".tux-gallery").first();
  await gallery.scrollIntoViewIfNeeded();
  await gallery.screenshot({ path: join(shots, `gallery-claude-${preset}.png`) });
  const count = await page.locator(".tux-pack-wrap").count();
  if (count < 40) failures.push(`${preset}: only ${count} community cards`);
  if (errors.length) failures.push(`${preset} gallery: ${errors.join(" | ")}`);
  await page.close();
}

// 2) Six representative packs applied to the whole Theme & Look tab.
const SIX = ["cc-claude-dark", "cc-claude-light", "cc-halftone-dusk", "cc-blueprint", "cc-retro-amber", "cc-github-dark"];
for (const preset of SIX) {
  const { page, errors } = await open(preset, 1024, 760);
  await page.screenshot({ path: join(shots, `theme-${preset}.png`) });
  if (errors.length) failures.push(`${preset}: ${errors.join(" | ")}`);
  await page.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`[community] ${2 + SIX.length} screenshots in ${shots}`);

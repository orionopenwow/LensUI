// Renders the Lens brand assets from the two master SVGs in docs/brand/ with headless Chromium:
//   docs/brand/png/lens-<size>.png  16 24 32 48 64 128 256 512 (small.svg up to 32 px, master above)
//   docs/brand/lens-1024.png         source for the app icon set
//   docs/brand/apple-touch-icon.png  180 px on the site's dark base (iOS wants it opaque)
//   docs/brand/og.png                1200×630 social card
//   docs/brand/nebula.png            the inner nebula alone, used as the texture of the animated logo
// favicon.ico and the Tauri icon set are made from these by tools/site/brand-icons.py.
// Usage: node tools/site/brand.mjs && python3 tools/site/brand-icons.py
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const brand = join(root, "docs/brand");
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const master = await readFile(join(brand, "lens-logo.svg"), "utf8");
const small = await readFile(join(brand, "lens-logo-small.svg"), "utf8");
const uri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
await mkdir(join(brand, "png"), { recursive: true });

const browser = await chromium.launch(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {});
async function shot(html, w, h, file, transparent = true) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<!DOCTYPE html><html><head><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${transparent ? "transparent" : "#0b0b0d"}}</style></head><body>${html}</body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: file, omitBackground: transparent });
  await page.close();
}
const img = (svg, s) => `<img src="${uri(svg)}" width="${s}" height="${s}" style="display:block">`;

for (const s of [16, 24, 32, 48, 64, 128, 256, 512]) await shot(img(s <= 32 ? small : master, s), s, s, join(brand, `png/lens-${s}.png`));
await shot(img(master, 1024), 1024, 1024, join(brand, "lens-1024.png"));
await shot(img(small, 256), 256, 256, join(brand, "lens-small-256.png"));
await shot(`<div style="display:grid;place-items:center;width:180px;height:180px">${img(master, 150)}</div>`, 180, 180, join(brand, "apple-touch-icon.png"), false);

// The inner nebula alone: the master's black glass + filtered cloud group, no clip, no bezel, no stars.
const defs = master.slice(master.indexOf("<defs>"), master.indexOf("</defs>") + 7);
const clouds = master.slice(master.indexOf('<g filter="url(#f)">'), master.indexOf("</g>", master.indexOf('<g filter="url(#f)">')) + 4);
const nebula = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<rect width="512" height="512" fill="#050507"/>${clouds}</svg>`;
await writeFile(join(brand, "nebula.svg"), nebula);
await shot(img(nebula, 512), 512, 512, join(brand, "nebula.png"), false);

// Social card: the site's neutral base, the logo, the line and a thin spectrum rule.
await shot(`<div style="width:1200px;height:630px;background:#0b0b0d;color:#f4f4f5;font-family:'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;display:flex;align-items:center;gap:64px;padding:0 96px;box-sizing:border-box;position:relative">
  ${img(master, 300)}
  <div><div style="font-size:84px;font-weight:650;letter-spacing:-0.035em;line-height:1">Lens</div>
  <div style="font-size:40px;color:#b6b6bf;margin-top:18px;line-height:1.2;letter-spacing:-0.01em">a calmer desktop<br>for Windows</div>
  <div style="height:4px;width:160px;border-radius:2px;margin-top:36px;background:linear-gradient(90deg,#ff5f6d,#ff9f43,#ffd43b,#3ddc97,#38bdf8,#818cf8,#c084fc)"></div></div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#ff5f6d,#ff9f43,#ffd43b,#3ddc97,#38bdf8,#818cf8,#c084fc)"></div>
</div>`, 1200, 630, join(brand, "og.png"), false);
await browser.close();
console.log("[brand] rendered png sizes, 1024, apple-touch-icon, nebula and og.png into docs/brand/");

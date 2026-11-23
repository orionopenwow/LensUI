// Renders tools/apps/.media-cache into a contact sheet (icon + screenshots per app) for review.
// Usage: PARITY_PLAYWRIGHT=… node tools/apps/contact.mjs out.png
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const media = JSON.parse(readFileSync(join(here, "media.json"), "utf8"));
const cache = join(here, ".media-cache");
const rows = Object.entries(media).map(([id, m]) => {
  const f = (u) => (u ? pathToFileURL(join(cache, id, u.split("/").pop())).href : "");
  const cell = (u, cls) => (u ? `<div class="${cls}"><img src="${f(u)}"><span>${decodeURIComponent(u.split("/").pop())}</span></div>` : `<div class="${cls} none">none</div>`);
  return `<div class="row"><b>${id}</b>${cell(m.icon, "ic")}${(m.screenshots.length ? m.screenshots : [null]).map((s) => cell(s, "sh")).join("")}</div>`;
});
const html = `<html><style>body{background:#18181b;color:#ddd;font:11px sans-serif;margin:8px}.row{display:flex;gap:8px;align-items:center;margin:4px 0;border-bottom:1px solid #333;padding:4px}b{width:110px}.ic,.sh{display:flex;flex-direction:column;align-items:center;gap:2px}.ic img{width:56px;height:56px;object-fit:contain;background:#555}.sh img{width:200px;height:112px;object-fit:cover}.none{width:56px;color:#f66}span{max-width:200px;overflow:hidden;white-space:nowrap}</style><body>${rows.join("")}</body></html>`;
const htmlPath = join(here, ".media-cache", "contact.html");
writeFileSync(htmlPath, html);
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 800 } });
await p.goto(pathToFileURL(htmlPath).href);
await p.waitForTimeout(800);
await p.screenshot({ path: process.argv[2] || "/tmp/contact.png", fullPage: true });
await b.close();

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
const out = "tools/parity/out", dest = process.argv[2];
const { chromium } = await import("playwright");
const reg = await readFile("src/settings/registry.ts", "utf8");
const pages = [...reg.matchAll(/\{\s*id:\s*"([a-z-]+)",\s*group:/g)].map((m) => m[1]);
const T = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".json":"application/json" };
const srv = createServer(async (q, r) => { const p = normalize(decodeURIComponent(new URL(q.url,"http://x").pathname)).replace(/^([/\\])+/,""); try { r.writeHead(200,{"content-type":T[extname(p)]||"application/octet-stream"}).end(await readFile(join(out,p))); } catch { r.writeHead(404).end(); } });
await new Promise(r => srv.listen(0,"127.0.0.1",r));
const base = `http://127.0.0.1:${srv.address().port}`;
const b = await chromium.launch(); const report=[];
for (const preset of (process.env.P||"obsidian,alabaster-daylight").split(",")) for (const page of pages) {
  const pg = await b.newPage({ viewport: { width: 1024, height: 640 } });
  const errs=[]; pg.on("pageerror", e=>errs.push(e.message.slice(0,160)));
  await pg.goto(`${base}/harness.html?surface=settings&preset=${preset}&tab=${page}`); await pg.waitForTimeout(900);
  // overflow check: elements whose text overflows horizontally
  const clipped = await pg.evaluate(() => [...document.querySelectorAll("button, label, span, h1, h2, h3, .cc-label")].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== "visible" && getComputedStyle(e).textOverflow !== "ellipsis" && e.clientWidth > 0).slice(0,5).map(e => (e.textContent||"").trim().slice(0,40)));
  await pg.screenshot({ path: `${dest}/cc-${preset}-${page}.png`, fullPage: false });
  report.push({preset,page,errs,clipped}); await pg.close();
}
await b.close(); srv.close();
console.log(JSON.stringify(report.filter(r=>r.errs.length||r.clipped.length)));
console.log("pages", report.length);

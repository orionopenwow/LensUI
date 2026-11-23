import { chromium } from "playwright";
import { createServer } from "node:http"; import { readFile } from "node:fs/promises"; import { join, extname } from "node:path";
const out=process.argv[2]||"/mnt/user-data/outputs/site-v4", tag=process.argv[3]||"before";
const root="docs/site"; const T={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".json":"application/json",".webp":"image/webp",".png":"image/png",".mp4":"video/mp4"};
const s=createServer(async(q,r)=>{try{let p=decodeURIComponent(new URL(q.url,"http://x").pathname);if(p.endsWith("/"))p+="index.html";r.writeHead(200,{"content-type":T[extname(p)]||"application/octet-stream"}).end(await readFile(join(root,p)))}catch{r.writeHead(404).end()}});
await new Promise(r=>s.listen(0,r)); const b=await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] });
for (const [w,h] of [[1440,900],[1280,720]]) { const pg=await b.newPage({viewport:{width:w,height:h}}); await pg.goto(`http://localhost:${s.address().port}/index.html`); await pg.waitForTimeout(3500); await pg.screenshot({path:`${out}/${tag}-hero-${w}.png`});
  if (w===1440) { for (const id of ["docks","themes"]) { const el=pg.locator("#"+id); if (await el.count()) { await el.scrollIntoViewIfNeeded(); await pg.waitForTimeout(3000); await el.screenshot({path:`${out}/${tag}-${id}.png`}); } } }
  await pg.close(); }
await b.close(); s.close();

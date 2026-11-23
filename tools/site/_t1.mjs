import { chromium } from "playwright";
import { createServer } from "node:http"; import { readFile } from "node:fs/promises"; import { join, extname } from "node:path";
const root = process.cwd()+"/docs/site";
const T={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webp":"image/webp",".png":"image/png",".svg":"image/svg+xml",".mp4":"video/mp4",".gif":"image/gif"};
const s=createServer(async(q,r)=>{let p=decodeURIComponent(new URL(q.url,"http://x").pathname); if(p.endsWith("/"))p+="index.html"; try{r.writeHead(200,{"content-type":T[extname(p)]||"application/octet-stream"}).end(await readFile(join(root,p)))}catch{r.writeHead(404).end()}});
await new Promise(r=>s.listen(0,"127.0.0.1",r)); const base=`http://127.0.0.1:${s.address().port}`;
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:900,height:220}});
const errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>m.type()==="error"&&errs.push(m.text()));
await p.goto(base+"/live/dock/index.html?preset="+(process.argv[2]||"obsidian")); await p.waitForTimeout(1500);
await p.screenshot({path:"/tmp/dock1.png"});
const items = await p.$$(".dock-item-wrap"); console.log("items",items.length);
if(items[3]){ const bb=await items[3].boundingBox(); await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2); await p.waitForTimeout(400); await p.screenshot({path:"/tmp/dock2.png"});}
console.log(errs.slice(0,5)); await b.close(); s.close();

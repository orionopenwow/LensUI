// Token cost of what an agent reads from a page, on 8 hand-made fixture pages (pages/*.html).
// Loads each page in headless Chromium with Lens Browser's real page agent injected and measures:
//   html      — the raw HTML file
//   innerText — document.body.innerText (what "get page text" tools usually send)
//   snapshot  — Lens's full snapshot (readable text + every element as JSON)
//   compact   — Lens's compact outline (`lens browse read`, page_agent.js `compact`, 6,000-char cap)
// Tokens are estimated as ceil(characters / 4), the common rule of thumb for English text with
// GPT/Claude-style tokenizers. It is an estimate, not a tokenizer count (docs/AGENT_CLI.md).
//
//   node tools/agent-bench/run.mjs            # prints a table and writes out/agent-bench.json
//   BENCH_CHROME=/path/to/chrome node tools/agent-bench/run.mjs
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const agent = readFileSync(join(here, "../../src-tauri/src/browser/page_agent.js"), "utf8");
const { chromium } = await import(process.env.BENCH_PLAYWRIGHT ? pathToFileURL(process.env.BENCH_PLAYWRIGHT).href : "playwright");
const browser = await chromium.launch(process.env.BENCH_CHROME ? { executablePath: process.env.BENCH_CHROME } : {});
const tok = (s) => Math.ceil(s.length / 4);
const rows = [];
for (const f of readdirSync(join(here, "pages")).filter((x) => x.endsWith(".html")).sort()) {
  const html = readFileSync(join(here, "pages", f), "utf8");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(agent);
  // Served from a made-up https origin (nothing leaves the machine), like a real page.
  await page.route("https://bench.example/**", (r) => r.fulfill({ body: html, contentType: "text/html" }));
  await page.goto(`https://bench.example/${f}`, { waitUntil: "load" });
  const run = (n, cmd) => page.evaluate(([n, c]) => JSON.parse(window.__lensAgent.run(n, JSON.stringify(c))), [n, cmd]);
  const inner = await page.evaluate(() => document.body.innerText);
  const snap = (await run(1, { op: "snapshot" })).data;
  const comp = (await run(2, { op: "compact" })).data;
  rows.push({
    page: f.replace(/\.html$/, ""),
    html: tok(html),
    innerText: tok(inner),
    snapshot: tok(JSON.stringify(snap)),
    compact: tok(comp.text),
    elements: comp.elements,
    truncated: comp.truncated,
  });
  await page.close();
}
await browser.close();
const pad = (s, n) => String(s).padStart(n);
console.log(`${"page".padEnd(14)}${pad("html", 8)}${pad("innerText", 11)}${pad("snapshot", 10)}${pad("compact", 9)}${pad("elements", 10)}`);
for (const r of rows) console.log(`${r.page.padEnd(14)}${pad(r.html, 8)}${pad(r.innerText, 11)}${pad(r.snapshot, 10)}${pad(r.compact, 9)}${pad(r.elements, 10)}${r.truncated ? "  (cut)" : ""}`);
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
console.log(`${"total".padEnd(14)}${pad(sum("html"), 8)}${pad(sum("innerText"), 11)}${pad(sum("snapshot"), 10)}${pad(sum("compact"), 9)}`);
mkdirSync(join(here, "out"), { recursive: true });
writeFileSync(join(here, "out", "agent-bench.json"), JSON.stringify({ method: "tokens = ceil(chars/4)", rows }, null, 2));

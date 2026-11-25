// Screenshots Lens Browser scenes × presets, smoke-tests the injected page agent, and writes a
// contact sheet per preset. Env: PARITY_CHROME, PARITY_PLAYWRIGHT, PARITY_OUT (copy shots there).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const AAA = ["newtab", "newtab-empty", "suggest", "loading", "error-dns", "error-cert", "error-offline", "history", "downloads", "downloads-empty", "import-pick"];
const SCENES = ["sidebar", "sidebar-stack", "sidebar-many", "sidebar-plan", "sidebar-stack-plan", "sidebar-right", "frame", "agent", "approval", "transcript", "address", "customise", "import", "ai", "timeline", "results", "aioff", "horizontal", "locked", "presentation", ...AAA];
const SIZES = { presentation: [1440, 1720] };
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(here, path);
  if (!file.startsWith(out) && !file.startsWith(shots)) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {});
const report = [];

for (const preset of PRESETS) {
  for (const scene of SCENES) {
    const [vw, vh] = SIZES[scene] ?? [1440, 860];
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}`);
    await page.waitForTimeout(800);
    const name = `${preset}-${scene}.png`;
    await page.screenshot({ path: join(shots, name) });
    report.push({ preset, scene, ok: errors.length === 0, errors, file: name });
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
  const cells = SCENES.map((s) => `<figure><img src="../shots/${preset}-${s}.png"><figcaption>${s}</figcaption></figure>`).join("");
  await writeFile(join(out, `sheet-${preset}.html`), `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#111;color:#bbb;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px">${cells}</div><style>figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:4px 2px}</style></body></html>`);
  const sheet = await browser.newPage({ viewport: { width: 2400, height: 900 } });
  await sheet.goto(`${base}/out/sheet-${preset}.html`);
  await sheet.waitForTimeout(400);
  await sheet.screenshot({ path: join(shots, `contact-${preset}.png`), fullPage: true });
  await sheet.close();
}

// ---- Page-agent smoke test: the real injected script on a hostile page ----
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok, detail }); console.log(`${ok ? "ok  " : "FAIL"} agent: ${name}${ok ? "" : ` — ${detail}`}`); };
{
  const page = await browser.newPage();
  await page.goto(`${base}/out/agent-page.html`);
  const run = (nonce, cmd) => page.evaluate(([n, c]) => JSON.parse(window.__lensAgent.run(n, JSON.stringify(c))), [nonce, cmd]);
  const r1 = await run(11, { op: "snapshot" });
  check("agent can't be replaced by the page", r1.nonce === 11 && r1.ok && typeof r1.data === "object", JSON.stringify(r1).slice(0, 120));
  const snap = r1.data;
  check("snapshot lists interactive elements", snap.elements.length >= 6, String(snap.elements.length));
  check("snapshot sees the password field", snap.hasPasswordField === true);
  check("notes pick up the fee", snap.notes.some((n) => /\$25/.test(n)), JSON.stringify(snap.notes));
  const submit = snap.elements.find((e) => e.text === "Complete reservation");
  const signin = snap.elements.find((e) => e.text === "Sign in");
  const party = snap.elements.find((e) => e.name === "party");
  check("submit button is reported in a form", submit && submit.inForm && submit.inputType === "submit");
  check("sign-in button's form has a password", signin && signin.formHasPassword === true);
  const typed = await run(12, { op: "act", action: { do: "type", ref: party.ref, text: "4" } });
  const val = await page.evaluate(() => document.querySelector('[name="party"]').value);
  check("typing uses the native setter", typed.data.ok && val === "4", JSON.stringify(typed));
  const pw = snap.elements.find((e) => e.inputType === "password");
  const pwr = await run(13, { op: "act", action: { do: "type", ref: pw.ref, text: "hunter2" } });
  check("refuses to type into password fields", pwr.data.ok === false);
  const clicked = await run(14, { op: "act", action: { do: "click", ref: submit.ref } });
  const flags = await page.evaluate(() => ({ submitted: !!window.__submitted, hijacked: !!window.__hijacked }));
  check("click uses the captured native click, not the page's patched one", clicked.data.ok && flags.submitted && !flags.hijacked, JSON.stringify(flags));
  const d = await run(15, { op: "describe", ref: submit.ref });
  check("describe returns form details without secrets", d.data.ok && d.data.fields.some((f) => f.label.startsWith("Party")) && !JSON.stringify(d.data).includes("hunter2"));
  const yt = await run(16, { op: "captionsStart", job: "j1", lang: "en" });
  await page.waitForTimeout(50);
  const yj = await run(17, { op: "job", job: "j1" });
  check("captions refuse non-YouTube pages", yt.ok && yj.data.done && yj.data.error === "not_youtube", JSON.stringify(yj));
  const bad = await page.evaluate(() => JSON.parse(window.__lensAgent.run(18, "{not json")));
  check("bad commands fail cleanly", bad.nonce === 18 && bad.ok === false);
  await page.close();
}
{
  // YouTube: serve a fake watch page and caption track at the real origins.
  const fixture = await readFile(join(here, "../../../src/__tests__/fixtures/yt-captions.json3.json"), "utf8");
  const agentJs = await readFile(join(out, "page_agent.js"), "utf8");
  const ctx = await browser.newContext();
  await ctx.route("https://www.youtube.com/**", (route) => {
    const u = route.request().url();
    if (u.includes("/api/timedtext")) return route.fulfill({ status: 200, contentType: "application/json", body: fixture });
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!DOCTYPE html><html><head><script>${agentJs}</script><script>window.ytInitialPlayerResponse={videoDetails:{videoId:"x",title:"Fish & chips at home",author:"Harbour Kitchen",lengthSeconds:"3727"},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:"https://www.youtube.com/api/timedtext?v=x&lang=en",languageCode:"en",name:{simpleText:"English"}},{baseUrl:"https://evil.example/steal",languageCode:"de",name:{simpleText:"Deutsch"}}]}}};</script></head><body><video></video></body></html>`,
    });
  });
  const page = await ctx.newPage();
  await page.goto("https://www.youtube.com/watch?v=x");
  const run = (nonce, cmd) => page.evaluate(([n, c]) => JSON.parse(window.__lensAgent.run(n, JSON.stringify(c))), [nonce, cmd]);
  await run(1, { op: "captionsStart", job: "c1", lang: "en" });
  let j = null;
  for (let i = 0; i < 40; i++) {
    j = (await run(2 + i, { op: "job", job: "c1" })).data;
    if (j.done) break;
    await page.waitForTimeout(50);
  }
  check("reads the caption track the player loads", j && j.done && !j.error && j.body.includes("kitchen") && j.track.lang === "en", JSON.stringify(j).slice(0, 160));
  await run(90, { op: "captionsStart", job: "c2", lang: "de" });
  let k = null;
  for (let i = 0; i < 40; i++) {
    k = (await run(100 + i, { op: "job", job: "c2" })).data;
    if (k.done) break;
    await page.waitForTimeout(50);
  }
  check("refuses caption tracks hosted off YouTube", k && k.error === "bad_track", JSON.stringify(k));
  const st = await run(200, { op: "status" });
  check("status recognises a watch page", st.data.isYouTube === true && st.data.hasVideo === true);
  await ctx.close();
}

await browser.close();
server.close();
await writeFile(join(shots, "report.json"), JSON.stringify({ scenes: report, agent: checks }, null, 2));
if (process.env.PARITY_OUT) {
  await mkdir(process.env.PARITY_OUT, { recursive: true });
  for (const r of report) await copyFile(join(shots, r.file), join(process.env.PARITY_OUT, r.file));
  for (const preset of PRESETS) await copyFile(join(shots, `contact-${preset}.png`), join(process.env.PARITY_OUT, `contact-${preset}.png`));
}
const failed = report.filter((r) => !r.ok).length + checks.filter((c) => !c.ok).length;
console.log(`[parity:browser] ${report.length - report.filter((r) => !r.ok).length}/${report.length} scenes clean, ${checks.filter((c) => c.ok).length}/${checks.length} agent checks passed`);
process.exit(failed ? 1 : 0);

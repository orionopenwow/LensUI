#!/usr/bin/env node
// Dock flash check: records the Dock frame by frame (CDP screencast) while search opens and
// closes and while the Dock style changes, and fails on a frame with a bright line or band that
// isn't in the frames before and after it (the "thin white bar" people saw between clicks).
//
//   node tools/robust/build.mjs && node tools/robust/dock-flash.mjs
//
// Dark themes only: on a dark Dock a light horizontal line is unmistakable; on light themes the
// same check would flag the Dock itself.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serve, launch, openSurface, setConfig, here } from "./lib.mjs";

const outDir = join(here, "out", "dock-flash");
mkdirSync(outDir, { recursive: true });
const STYLES = ["floating", "slim", "taskbar", "studio", "minimal", "split", "unified"];
// A row counts as a bright line when this share of its pixels is near-white.
const ROW_SHARE = 0.3;
const BRIGHT = 205;

const server = await serve();
const browser = await launch();
const helper = await (await browser.newContext()).newPage();

/** Bright rows of each frame (row indexes where ROW_SHARE of pixels are near-white). */
async function brightRows(frames) {
  return helper.evaluate(
    async ({ imgs, share, bright }) => {
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      const out = [];
      for (const s of imgs) {
        const i = await load("data:image/png;base64," + s);
        const c = document.createElement("canvas");
        c.width = i.width; c.height = i.height;
        const x = c.getContext("2d");
        x.drawImage(i, 0, 0);
        const d = x.getImageData(0, 0, i.width, i.height).data;
        const rows = [];
        for (let y = 0; y < i.height; y++) {
          let n = 0;
          for (let xx = 0; xx < i.width; xx += 2) {
            const k = (y * i.width + xx) * 4;
            if (d[k + 3] > 200 && 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2] > bright) n++;
          }
          if (n / (i.width / 2) >= share) rows.push(y);
        }
        out.push(rows);
      }
      return out;
    },
    { imgs: frames.map((f) => f.data), share: ROW_SHARE, bright: BRIGHT },
  );
}

const results = [];
async function record(page, cdp, name, act) {
  await page.waitForTimeout(300);
  const frames = [];
  let on = false;
  const t0 = { t: 0 };
  const onFrame = async (f) => {
    if (on) frames.push({ t: Date.now() - t0.t, data: f.data });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });
  await page.waitForTimeout(100);
  frames.push({ t: 0, data: (await cdp.send("Page.captureScreenshot", { format: "png" })).data });
  on = true;
  t0.t = Date.now();
  await act();
  await page.waitForTimeout(700);
  on = false;
  await cdp.send("Page.stopScreencast");
  cdp.off("Page.screencastFrame", onFrame);
  frames.push({ t: Date.now() - t0.t, data: (await cdp.send("Page.captureScreenshot", { format: "png" })).data });
  const rows = await brightRows(frames);
  const steady = new Set([...rows[0], ...rows[rows.length - 1]]);
  const bad = [];
  rows.forEach((r, k) => {
    // Allow a row to move by a pixel (sub-pixel animation); flag rows nowhere near a steady one.
    const extra = r.filter((y) => !steady.has(y) && !steady.has(y - 1) && !steady.has(y + 1));
    if (extra.length) bad.push({ t: frames[k].t, rows: extra.slice(0, 6), k });
  });
  const ok = bad.length === 0;
  results.push({ name, ok, frames: frames.length, bad: bad.map(({ t, rows: r }) => ({ t, rows: r })) });
  if (!ok) {
    for (const b of bad.slice(0, 3)) writeFileSync(join(outDir, `${name.replace(/[^a-z0-9]+/gi, "_")}-${b.t}ms.png`), Buffer.from(frames[b.k].data, "base64"));
  }
  console.log(`${ok ? "ok  " : "FAIL"} ${name} (${frames.length} frames)${ok ? "" : `\n       bright line(s) not in the steady frames: ${bad.slice(0, 4).map((b) => `+${b.t}ms rows ${b.rows.join(",")}`).join("; ")}`}`);
}

for (const preset of ["obsidian", "catppuccin-mocha"]) {
  const page = await openSurface(browser, server.base, { surface: "dock", preset, settle: 1500 });
  const cdp = await page.context().newCDPSession(page);
  // The Dock window is see-through; captures show that as white. Put a dark desktop behind it.
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 18, g: 18, b: 22, a: 1 } });
  const search = page.locator(".dock-search-mag-btn").first();
  if (await search.count()) {
    await record(page, cdp, `${preset} search open`, () => search.click());
    await record(page, cdp, `${preset} search close (Esc)`, () => page.keyboard.press("Escape"));
  }
  for (const style of STYLES) {
    await record(page, cdp, `${preset} style → ${style}`, () =>
      setConfig(page, new Function("c", `c.dock.style = ${JSON.stringify(style)};`)),
    );
  }
  // Control: a deliberate 1px white line for 250 ms must be caught, or this check proves nothing.
  if (preset === "obsidian") {
    await record(page, cdp, "control (must be flagged)", async () => {
      await page.evaluate(() => {
        const d = document.createElement("div");
        d.style.cssText = "position:fixed;left:0;right:0;top:50%;height:1px;background:#fff;z-index:99999";
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 250);
      });
    });
    const control = results.pop();
    if (control.ok) results.push({ name: "control: a white line went unnoticed (check is blind)", ok: false });
    else console.log("     (control flagged as it should be)");
  }
  // Search stays open through every style change and never spans the bar (it pops out like
  // Windows Search: centred, or at the start of a left-aligned Taskbar).
  if (await search.count()) {
    await search.click();
    await page.waitForTimeout(700);
    for (const [style, align] of [["taskbar", "center"], ["taskbar", "left"], ...STYLES.map((st) => [st, "center"])]) {
      await setConfig(page, new Function("c", `c.dock.style = ${JSON.stringify(style)}; c.dock.alignment = ${JSON.stringify(align)};`));
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => {
        const d = document.querySelector(".dock-launcher-drawer");
        if (!d) return null;
        const r = d.getBoundingClientRect();
        return { left: Math.round(r.left), width: Math.round(r.width), vw: innerWidth };
      });
      const name = `${preset} search panel on ${style}${style === "taskbar" ? ` (${align})` : ""}`;
      const problems = [];
      if (!m) problems.push("search closed when the style changed");
      else {
        if (m.width > 760 + 1) problems.push(`panel is ${m.width}px wide (more than 760)`);
        if (m.left < 0 || m.left + m.width > m.vw) problems.push(`panel leaves the screen (${m.left}..${m.left + m.width} of ${m.vw})`);
        if (style === "taskbar" && align === "left" && m.left > 40) problems.push(`left-aligned Taskbar: panel starts at ${m.left}px, not at the left`);
        if (style === "taskbar" && align === "center" && Math.abs(m.left + m.width / 2 - m.vw / 2) > 4) problems.push("centred Taskbar: panel is not centred");
      }
      results.push({ name, ok: !problems.length, problems });
      console.log(`${problems.length ? "FAIL" : "ok  "} ${name}${problems.length ? "\n       " + problems.join("; ") : ""}`);
    }
    await page.keyboard.press("Escape");
  }
  const errs = page.problems.errors;
  if (errs.length) results.push({ name: `${preset} errors`, ok: false, bad: errs.slice(0, 3) });
  await page.context().close();
}

await browser.close();
server.close();
writeFileSync(join(outDir, "report.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`[dock-flash] ${results.length - failed.length}/${results.length} clean`);
process.exit(failed.length ? 1 : 0);

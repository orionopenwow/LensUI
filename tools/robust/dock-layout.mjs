// Dock layout invariants (docs/DOCK_SMOOTHNESS.md › Consistency): every Dock style at every screen
// edge, with search closed and open, must keep the Settings gear and the search control whole,
// on screen, inside the Dock, not overlapping each other or any app icon, and reachable with Tab.
// Geometry checks rather than pixel goldens, so a new style or icon size is covered without
// recording 168 images; a contact sheet of every render is written to tools/robust/out-layout/.
//
//   node tools/robust/build.mjs && node tools/robust/dock-layout.mjs
//   DOCK_LAYOUT_ONLY=taskbar,islands  DOCK_LAYOUT_SHOTS=1   # subset · also save screenshots
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { serve, launch, openSurface, here } from "./lib.mjs";

const STYLES = ["floating", "slim", "taskbar", "studio", "minimal", "split", "islands"];
const EDGES = ["bottom", "top", "left", "right"];
const SIZES = { bottom: [1920, 760], top: [1920, 760], left: [760, 1080], right: [760, 1080] };
/** Default size, the smallest and largest the Dock menu offers, and a crowded Dock (14 pins). */
const VARIANTS = [
  { id: "", edges: EDGES, apply: () => {} },
  { id: "-icons34", edges: ["bottom", "left"], apply: (c) => { c.dock.iconSize = 34; c.dock.iconSizes = {}; } },
  { id: "-icons52", edges: ["bottom", "right"], apply: (c) => { c.dock.iconSize = 52; c.dock.iconSizes = {}; } },
  {
    id: "-14pins",
    edges: ["bottom", "left"],
    apply: (c) => {
      const base = c.dock.pinnedApps.slice();
      for (let i = 0; c.dock.pinnedApps.length < 14 && base.length; i++) {
        const a = base[i % base.length];
        c.dock.pinnedApps.push({ ...a, id: `${a.id}-x${i}`, path: a.path.replace(/(\.exe)?$/i, `-${i}$1`) });
      }
    },
  },
];
const ONLY = (process.env.DOCK_LAYOUT_ONLY || "").split(",").filter(Boolean);
const SHOTS = process.env.DOCK_LAYOUT_SHOTS === "1";
const outDir = join(here, "out-layout");
rmSync(outDir, { recursive: true, force: true });
if (SHOTS) mkdirSync(outDir, { recursive: true });

/** Runs in the page: rectangles of everything the invariants look at. */
function measure() {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom };
  };
  const pill = document.querySelector(".dock-pill");
  const gearBtn = [...document.querySelectorAll(".dock-pill button[aria-label='Settings'], .dock-split-pill button[aria-label='Settings']")][0];
  const search = document.querySelector(".dock-search-inline");
  const input = document.querySelector(".dock-search-glide-input");
  const drawer = document.querySelector(".dock-launcher-drawer");
  const close = document.querySelector(".dock-launcher-drawer > .lens-flyout-close");
  const esc = document.querySelector(".dock-search-esc");
  const icons = [...document.querySelectorAll(".dock-pill .dock-item-wrap[data-dock-pinned='true'] > .dock-item, .dock-pill .dock-item-wrap[data-dock-pinned='true'] .dock-item")]
    .filter((el, i, a) => a.indexOf(el) === i);
  // Anything that clips the Dock row: an ancestor with overflow other than visible.
  const clipped = (el) => {
    if (!el) return false;
    const b = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflow === "visible" && cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const pb = p.getBoundingClientRect();
      if (b.left < pb.left - 1 || b.right > pb.right + 1 || b.top < pb.top - 1 || b.bottom > pb.bottom + 1) return p.className || p.tagName;
    }
    return false;
  };
  const tabbable = (el) => !!el && el.tabIndex >= 0 && !el.disabled && getComputedStyle(el).visibility !== "hidden" && !el.closest("[inert]");
  return {
    vw: innerWidth,
    vh: innerHeight,
    pill: r(pill),
    gear: r(gearBtn),
    gearInSplit: !!gearBtn?.closest(".dock-split-pill"),
    gearClip: clipped(gearBtn),
    gearTab: tabbable(gearBtn),
    search: r(search),
    searchClip: clipped(search),
    input: r(input),
    drawer: r(drawer),
    close: r(close),
    closeName: close?.getAttribute("aria-label") ?? "",
    esc: r(esc),
    inputClip: clipped(input),
    inputFocused: document.activeElement === input,
    icons: icons.map(r),
    stageClass: document.querySelector(".dock-stage")?.className || "",
    // Where the open results panel meets the Dock: a short strip across the join, inside both shapes
    // and clear of icons (the Dock's padding next to the panel's edge).
    join: (() => {
      if (!drawer || !pill) return null;
      const d = drawer.getBoundingClientRect();
      const p = pill.getBoundingClientRect();
      const stage = document.querySelector(".dock-stage")?.className || "";
      const edge = /dock-edge-(top|left|right)/.exec(stage)?.[1] || "bottom";
      const lo = Math.max(d.left, p.left), hi = Math.min(d.right, p.right);
      const top = Math.max(d.top, p.top), bot = Math.min(d.bottom, p.bottom);
      if (edge === "bottom") return { axis: "y", at: Math.round(p.top), x: Math.round(lo + 3), lo, hi };
      if (edge === "top") return { axis: "y", at: Math.round(p.bottom), x: Math.round(lo + 3), lo, hi };
      if (edge === "left") return { axis: "x", at: Math.round(p.right), y: Math.round(Math.min(bot - 8, Math.max(top, d.top + 140) + 3)), lo: top, hi: bot };
      return { axis: "x", at: Math.round(p.left), y: Math.round(Math.min(bot - 8, Math.max(top, d.top + 140) + 3)), lo: top, hi: bot };
    })(),
  };
}

const overlap = (a, b, slack = 1) => a && b && a.x < b.r - slack && b.x < a.r - slack && a.y < b.b - slack && b.y < a.b - slack;
const onScreen = (a, m) => a && a.w > 4 && a.h > 4 && a.x >= -1 && a.y >= -1 && a.r <= m.vw + 1 && a.b <= m.vh + 1;
const union = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });
const inside = (a, box, slack = 2) => a && box && a.x >= box.x - slack && a.r <= box.r + slack && a.y >= box.y - slack && a.b <= box.b + slack;

function check(m, ctx) {
  const p = [];
  if (!m.pill) return ["no Dock pill rendered"];
  if (!onScreen(m.gear, m)) p.push(`Settings gear missing or off screen ${JSON.stringify(m.gear)}`);
  else {
    if (!m.gearInSplit && !inside(m.gear, m.pill)) p.push("Settings gear sticks out of the Dock");
    if (m.gearClip) p.push(`Settings gear clipped by .${m.gearClip}`);
    if (!m.gearTab) p.push("Settings gear not reachable with Tab");
    for (const [i, ic] of m.icons.entries()) if (overlap(m.gear, ic)) { p.push(`Settings gear overlaps app icon ${i}`); break; }
  }
  if (!onScreen(m.search, m)) p.push(`search control missing or off screen ${JSON.stringify(m.search)}`);
  else {
    // On the left/right edges the open field heads the results panel beside the Dock.
    const box = ctx.open && ctx.vertical && m.drawer ? union(m.pill, m.drawer) : m.pill;
    if (!inside(m.search, box)) p.push("search control sticks out of the Dock");
    if (m.searchClip) p.push(`search control clipped by .${m.searchClip}`);
    if (overlap(m.search, m.gear)) p.push("search control overlaps the Settings gear");
    if (!ctx.open) for (const [i, ic] of m.icons.entries()) if (overlap(m.search, ic)) { p.push(`search control overlaps app icon ${i}`); break; }
  }
  if (ctx.open) {
    if (!onScreen(m.input, m)) p.push(`search field missing or off screen ${JSON.stringify(m.input)}`);
    else {
      if (m.input.w < 140) p.push(`search field too narrow to type in (${Math.round(m.input.w)} px)`);
      if (m.inputClip) p.push(`search field clipped by .${m.inputClip}`);
    }
    if (!m.inputFocused) p.push("search field did not take focus");
    // The shared × of the results panel: on screen, named, clear of the field and its ESC chip.
    if (!onScreen(m.close, m)) p.push(`panel close button missing or off screen ${JSON.stringify(m.close)}`);
    else {
      if (m.closeName !== "Close") p.push(`panel close button named "${m.closeName}"`);
      if (overlap(m.close, m.input) || overlap(m.close, m.esc)) p.push("panel close button covers the search field");
      if (m.close.w < 20 || m.close.h < 20) p.push("panel close button smaller than 20 px");
    }
  }
  // App icons must not overlap each other (a broken flex/grid squeezes them on top of one another).
  for (let i = 1; i < m.icons.length; i++) if (overlap(m.icons[i - 1], m.icons[i], 2)) { p.push(`app icons ${i - 1} and ${i} overlap`); break; }
  return p;
}

const server = await serve();
const browser = await launch();
const decoder = await (await browser.newContext()).newPage();

/** Samples a strip across the panel/Dock join (9 px, centred on it) and fails when the pixels on
 * the joint differ from the fill on both sides: a border, a shadow line or a gap. */
async function seam(page, j) {
  const pad = 4;
  const clip = j.axis === "y" ? { x: j.x, y: j.at - pad, width: 1, height: pad * 2 + 1 } : { x: j.at - pad, y: j.y, width: pad * 2 + 1, height: 1 };
  if (clip.x < 0 || clip.y < 0) return [];
  const png = (await page.screenshot({ clip, animations: "disabled" })).toString("base64");
  const px = await decoder.evaluate(async (b64) => {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + b64; });
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
    return out;
  }, png);
  const ref = [px[0], px[1], px[px.length - 2], px[px.length - 1]];
  const avg = [0, 1, 2].map((k) => ref.reduce((a, p) => a + p[k], 0) / ref.length);
  const sideGap = Math.max(...[0, 1, 2].map((k) => Math.abs(px[0][k] - px[px.length - 1][k])));
  const worst = Math.max(...px.slice(2, -2).map((p) => Math.max(...[0, 1, 2].map((k) => Math.abs(p[k] - avg[k])))));
  const out = [];
  if (worst > 10) out.push(`seam at the panel/Dock join (a pixel on the joint is ${Math.round(worst)} off the fill)`);
  if (sideGap > 10) out.push(`panel and Dock fills differ by ${Math.round(sideGap)} across the join`);
  return out;
}
const failures = [];
let runs = 0;
for (const variant of VARIANTS) for (const style of STYLES) {
  if (ONLY.length && !ONLY.includes(style)) continue;
  for (const edge of variant.edges) {
    const [width, height] = SIZES[edge];
    const page = await openSurface(browser, server.base, { surface: "dock", width, height, reducedMotion: true, settle: 700 });
    await page.evaluate(({ style, edge, apply }) => {
      const c = JSON.parse(JSON.stringify(window.__lensConfig()));
      c.dock.style = style;
      c.dock.position = edge;
      c.dock.autoHide = false;
      new Function("c", `(${apply})(c)`)(c);
      window.__lensSetConfig(c);
      window.__lensEmit("lens://config-updated", c);
    }, { style, edge, apply: variant.apply.toString() });
    await page.waitForTimeout(450);
    for (const open of [false, true]) {
      if (open) {
        // A real click where possible; a search button off screen is itself a failure (reported by
        // the rest-state check), so open it by script to still check the open layout.
        const btn = page.locator(".dock-search-mag-btn").first();
        await btn.click({ timeout: 1500 }).catch(() => btn.evaluate((el) => el.click()));
        await page.waitForTimeout(450);
      }
      const m = await page.evaluate(measure);
      const problems = check(m, { open, vertical: edge === "left" || edge === "right" });
      if (open && m.join && style !== "islands") problems.push(...(await seam(page, m.join)));
      runs++;
      const name = `${style}-${edge}${variant.id}-${open ? "search" : "rest"}`;
      if (SHOTS || problems.length) {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, `${name}.png`), await page.screenshot());
      }
      if (problems.length) failures.push(`${name}: ${problems.join("; ")}`);
      if (process.env.DOCK_LAYOUT_VERBOSE === "1") console.log(`  ${problems.length ? "FAIL" : "ok  "} ${name}`);
      if (open) await page.keyboard.press("Escape");
    }
    // Attention (an app flashing its taskbar button): every style shows the urgent colour on that
    // app's indicator, a count badge inside the Dock, and drops it when the request ends.
    if (!variant.id) {
      await page.waitForTimeout(350);
      await page.evaluate(() => window.__lensEmit("dock:attention", { appId: "notepad.exe", active: true, count: 3 }));
      await page.waitForTimeout(900);
      const a = await page.evaluate(() => {
        const wrap = document.querySelector(".dock-item-wrap.is-attention");
        const ind = wrap?.querySelector(".dock-indicator.attention");
        const badge = wrap?.querySelector(".dock-attention-badge");
        const pill = document.querySelector(".dock-pill")?.getBoundingClientRect();
        const b = badge?.getBoundingClientRect();
        const ib = ind?.getBoundingClientRect();
        return {
          wraps: document.querySelectorAll(".dock-item-wrap.is-attention").length,
          colour: ind ? getComputedStyle(ind).backgroundColor : "",
          indVisible: !!ib && ib.width > 2 && ib.height > 1 && getComputedStyle(ind).opacity !== "0",
          badge: badge?.textContent ?? "",
          badgeOnScreen: !!b && b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
          pillOk: !!pill,
          sr: wrap?.querySelector(".dock-attention-sr")?.textContent ?? "",
        };
      });
      const name = `${style}-${edge}-attention`;
      const ap = [];
      if (a.wraps !== 1) ap.push(`expected 1 app asking for attention, found ${a.wraps}`);
      if (!/247,\s*99,\s*12/.test(a.colour)) ap.push(`indicator not in the urgent colour (${a.colour || "no indicator"})`);
      if (!a.indVisible) ap.push("urgent indicator not visible");
      if (a.badge !== "3") ap.push(`count badge shows "${a.badge}"`);
      else if (!a.badgeOnScreen) ap.push("count badge off screen");
      if (!/needs your attention/.test(a.sr)) ap.push("no screen-reader text");
      if (SHOTS || ap.length) {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, `${name}.png`), await page.screenshot());
      }
      await page.evaluate(() => window.__lensEmit("dock:attention", { appId: "notepad.exe", active: false }));
      await page.waitForTimeout(250);
      if (await page.locator(".dock-item-wrap.is-attention").count()) ap.push("still urgent after the request ended");
      // The backend's snapshot shape (lens://dock-attention) drives the same state.
      await page.evaluate(() => window.__lensEmit("lens://dock-attention", { version: 1, apps: [{ exePath: "notepad.exe", processName: "notepad.exe", hwnds: [], count: 1, sinceMs: 0 }] }));
      await page.waitForTimeout(250);
      if ((await page.locator(".dock-item-wrap.is-attention").count()) !== 1) ap.push("snapshot event did not mark the app");
      await page.evaluate(() => window.__lensEmit("lens://dock-attention", { version: 2, apps: [] }));
      await page.waitForTimeout(250);
      if (await page.locator(".dock-item-wrap.is-attention").count()) ap.push("empty snapshot did not clear it");
      runs++;
      if (ap.length) failures.push(`${name}: ${ap.join("; ")}`);
      if (process.env.DOCK_LAYOUT_VERBOSE === "1") console.log(`  ${ap.length ? "FAIL" : "ok  "} ${name}`);
    }
    const errs = page.problems.errors.filter((e) => !/favicon/.test(e));
    if (errs.length) failures.push(`${style}-${edge}${variant.id}: ${errs.length} page errors: ${errs[0]}`);
    await page.context().close();
  }
}
await browser.close();
server.close();

console.log(`[dock-layout] ${runs} renders (${STYLES.length} styles × edges × icon sizes / crowded Dock × search closed/open)`);
if (failures.length) {
  console.log(`[dock-layout] ${failures.length} problem(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("[dock-layout] every style keeps Settings and search whole, inside the Dock and reachable");

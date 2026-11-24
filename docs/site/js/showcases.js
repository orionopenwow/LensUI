// Showcases: the hero desk's guided tours. Each one sets a look (theme, dock, windows), then walks
// through a few steps at the visitor's pace. Every step shows a real Lens surface in a real state:
// the window's frame loads that scene of the app's own component (see js/desk.js and
// tools/site/live/). Nothing moves until the visitor asks. Back replays the earlier steps, Reset
// starts over, Esc or "Exit" leaves the desk free to play with.
import { reducedMotion } from "./site.js";
import { getPacks } from "./desk.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? 0 : ms));
/** An element inside a real surface (a window's app id, or "top" | "qs" | "cmd" | "magic"). */
const inApp = (desk, app, sel) => desk.doc(app)?.querySelector(sel) ?? null;
const winEl = (desk, app) => desk.byApp(app)?.el ?? null;
/** A desk point inside a window, as fractions of it (where a right-click lands). */
const pointIn = (desk, app, fx, fy) => { const w = desk.byApp(app); return w ? { x: w.x + w.w * fx, y: w.y + w.h * fy } : { x: desk.W / 2, y: desk.H / 2 }; };

/** Window layouts as fractions of the work area: [app, x, y, w, h, scene?]. */
const LAYOUT = {
  desktop: [["browser", 0.02, 0.04, 0.56, 0.84, "browser.html?scene=frame"], ["notes", 0.6, 0.1, 0.38, 0.66, "coreapps.html?app=notes"]],
  magic: [["browser", 0.02, 0.04, 0.6, 0.88, "browser.html?scene=frame"]],
  agent: [["browser", 0.02, 0.04, 0.62, 0.88, "browser.html?scene=frame"]],
  browser: [["browser", 0.05, 0.03, 0.9, 0.92, "browser.html?scene=frame"]],
  apps: [["store", 0.12, 0.03, 0.76, 0.92, "shell.html?surface=apps"]],
  music: [["music", 0.14, 0.05, 0.72, 0.86, "music.html?scene=np-expanded"]],
  cleaner: [["cleaner", 0.12, 0.03, 0.76, 0.92, "cleaner.html?scene=home"]],
  core: [["monitor", 0.02, 0.04, 0.56, 0.8, "coreapps.html?app=monitor"], ["timer", 0.62, 0.08, 0.34, 0.78, "coreapps.html?app=timer"]],
  settings: [["settings", 0.1, 0.03, 0.72, 0.92, "shell.html?surface=settings&settingsMode=simple"]],
};

/**
 * step: { cap, target?(desk) → element (may be inside a surface), run(desk) }
 * `run` must be quick to replay (Back replays earlier steps with no pauses).
 */
export const SHOWCASES = [
  {
    id: "desktop", title: "Desktop", line: "Real windows, the dock, Quick Settings and Command.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "This is Lens: the top bar, your windows and the dock. Every window here is the app's real one. Drag Lens Browser by its top strip.", target: (d) => winEl(d, "browser") },
      { cap: "Snap Lens Browser to the left half. (Dragging it to the left edge does the same.)", target: (d) => winEl(d, "browser"), run: (d) => d.snap(d.byApp("browser")?.id, "left") },
      { cap: "And Notes to the right.", target: (d) => winEl(d, "notes"), run: (d) => d.snap(d.byApp("notes")?.id, "right") },
      { cap: "Quick Settings opens from the top bar: Wi-Fi, sound, battery, theme.", target: (d) => d.overs.qs.el, run: (d) => d.openFly() },
      { cap: "Ctrl+Space opens Lens Command: one box to ask, search and run things.", target: (d) => d.overs.cmd.el, run: (d) => d.openCmd("compact") },
      { cap: "Answers stay in one thread, with what it used and where it ran.", target: (d) => d.overs.cmd.el, run: (d) => d.openCmd("thread") },
      { cap: "That's the everyday desk. Close Command and play, or pick another tour below.", run: (d) => d.closeCmd() },
    ],
  },
  {
    id: "magic", title: "Magic right-click", line: "Right-click anything; Lens knows what it is.",
    look: { pack: "tokyo-night", dock: "floating" },
    steps: [
      { cap: "Right-click a link in Lens Browser.", target: (d) => winEl(d, "browser"), run: (d) => d.openMagic("link", pointIn(d, "browser", 0.42, 0.3)) },
      { cap: "Pick Summarise. The answer appears in the same window, made on this PC.", target: (d) => d.overs.magic.el, run: (d) => d.openMagic("summary", pointIn(d, "browser", 0.42, 0.3)) },
      { cap: "On a video page, the same menu gets the transcript.", target: (d) => d.overs.magic.el, run: (d) => { d.scene("browser", "browser.html?scene=transcript"); d.openMagic("transcript", pointIn(d, "browser", 0.42, 0.3)); } },
      { cap: "Right-click an image and save it to your Shelf. Undo is right there.", target: (d) => d.overs.magic.el, run: (d) => d.openMagic("shelf", pointIn(d, "browser", 0.3, 0.42)) },
      { cap: "Select text and ask Lens about it.", target: (d) => d.overs.magic.el, run: (d) => d.openMagic("ask", pointIn(d, "browser", 0.36, 0.36)) },
      { cap: "Send it to Claude: anything that would change your PC waits for your OK.", target: (d) => d.overs.magic.el, run: (d) => d.openMagic("approval", pointIn(d, "browser", 0.36, 0.36)) },
      { cap: "Now try it yourself: right-click anywhere on the desk or in a window.", run: (d) => d.hideMenu() },
    ],
  },
  {
    id: "agent", title: "Bring your own agent", line: "It proposes. You approve. Everything undoes.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Connect Claude, a local model or any MCP agent. It works in your real windows: here it has opened a page in Lens Browser.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=agent") },
      { cap: "Before anything changes, Lens shows “Needs your OK”: who is asking, what it will do, and a preview.", target: (d) => winEl(d, "approval"), run: (d) => { const w = d.open("approval"); if (w) d.setRect(w, { x: d.W - 470, y: d.TOP + 40, w: 440, h: Math.min(520, d.H - d.TOP - 150) }); } },
      { cap: "In the browser, the agent's step waits on the same card. Deny, or hold to approve.", target: (d) => winEl(d, "browser"), run: (d) => { const a = d.byApp("approval"); if (a) d.close(a.id); d.scene("browser", "browser.html?scene=approval"); } },
      { cap: "It does exactly what it showed, and one Undo puts it back. In beta: approval cards and the activity log are in; automatic checks for hidden instructions are still being wired into every agent path." },
    ],
  },
  {
    id: "browser", title: "Lens Browser", line: "One slim bar, AI beside the page, themed.",
    look: { pack: "dracula-glass", dock: "floating" },
    steps: [
      { cap: "Lens Browser: tabs down the side, one slim bar on top, and your theme all the way through.", target: (d) => winEl(d, "browser") },
      { cap: "The address bar is also the command bar: sites, tabs and actions in one list.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=address") },
      { cap: "The AI panel sits beside the page and reads only what you point it at.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=agent") },
      { cap: "On a video, it makes a transcript you can search and jump through.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=transcript") },
      { cap: "When an agent wants to click or type for you, it asks first.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=approval") },
    ],
  },
  {
    id: "apps", title: "Lens Apps", line: "Free and open-source apps, one click.",
    look: { pack: "catppuccin-mocha", dock: "studio" },
    steps: [
      { cap: "Lens Apps lists free and open-source apps, each with what it replaces and its licence.", target: (d) => winEl(d, "store") },
      { cap: "Get installs from the app's official release and checks the download. Try the search box or a category." },
    ],
  },
  {
    id: "music", title: "Lens Music", line: "Now Playing for any app, in your colours.",
    look: { pack: "lens-expressive", dock: "taskbar", shape: "expressive" },
    steps: [
      { cap: "Lens Music shows what's playing in any app, with lyrics and what's next.", target: (d) => winEl(d, "music") },
      { cap: "Compact view keeps it small.", target: (d) => winEl(d, "music"), run: (d) => d.scene("music", "music.html?scene=np-compact") },
      { cap: "Back to the full view. The colours come from the album art.", target: (d) => winEl(d, "music"), run: (d) => d.scene("music", "music.html?scene=np-expanded") },
    ],
  },
  {
    id: "cleaner", title: "Lens Cleaner", line: "See what's taking space; clean safely.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Lens Cleaner starts with a plain summary of your drive.", target: (d) => winEl(d, "cleaner") },
      { cap: "A scan sorts what it finds by how safe it is to remove.", target: (d) => winEl(d, "cleaner"), run: (d) => d.scene("cleaner", "cleaner.html?scene=cleanup") },
      { cap: "The space map shows where the big things are.", target: (d) => winEl(d, "cleaner"), run: (d) => d.scene("cleaner", "cleaner.html?scene=treemap") },
      { cap: "Cleaning moves things to the Recycle Bin, so you can put them back.", target: (d) => winEl(d, "cleaner"), run: (d) => d.scene("cleaner", "cleaner.html?scene=done") },
    ],
  },
  {
    id: "core", title: "Core apps", line: "Monitor, Timer, Notes and six more.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Monitor says what's slowing your PC in plain words. Timer keeps running with its window closed.", target: (d) => winEl(d, "monitor") },
      { cap: "Notes has checklists and stickies you can pin to the desktop.", target: (d) => winEl(d, "notes"), run: (d) => { const t = d.byApp("timer"); if (t) d.close(t.id); const w = d.open("notes"); if (w) d.setRect(w, { x: d.W * 0.56, y: d.TOP + 50, w: d.W * 0.4, h: d.H * 0.56 }); } },
      { cap: "Open the rest from the dock or Lens Command. Each one is small, fast and themed." },
    ],
  },
  {
    id: "settings", title: "Settings", line: "The few settings most people change, first.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Settings opens in Simple mode: the handful of things most people change. Try a theme.", target: (d) => winEl(d, "settings") },
      { cap: "Advanced has everything else, searchable. Switch with the toggle at the top left." },
    ],
  },
];

export function createShowcases(desk, { onChange } = {}) {
  let sc = null, i = 0, busy = false, gen = 0;
  const spot = document.createElement("div");
  spot.className = "lx-spot"; spot.setAttribute("aria-hidden", "true"); spot.hidden = true;
  desk.canvas.append(spot);

  async function look(s) {
    const packs = await getPacks();
    const p = packs.find((x) => x.id === s.look.pack);
    if (p && desk.pack?.id !== p.id) desk.setPack(p);
    desk.dockStyle(s.look.dock, s.look.shape ?? "classic");
    desk.resetWallpaper?.();
    desk.closeCmd(); desk.hideMenu(); desk.closeFly();
    const want = LAYOUT[s.id] ?? [];
    for (const w of [...desk.wins.values()]) if (!want.some(([a]) => a === w.app)) desk.close(w.id);
    const wk = { x: 8, y: desk.TOP, w: desk.W - 16, h: desk.H - desk.TOP - 96 };
    for (const [app, x, y, ww, hh, src] of want) {
      if (src) desk.scene(app, src);
      const r = { x: wk.x + x * wk.w, y: wk.y + y * wk.h, w: ww * wk.w, h: hh * wk.h };
      const ex = desk.byApp(app);
      if (ex) { if (ex.min) desk.restore(ex.id); ex.tile = null; desk.setRect(ex, r); }
      else { const w = desk.open(app); if (w) desk.setRect(w, r, { animate: false }); }
    }
    desk.focus([...desk.wins.values()].at(-1)?.id, { quiet: true });
    await sleep(280);
  }

  const target = () => { try { return sc?.steps[i]?.target?.(desk) ?? null; } catch { return null; } };
  function place() {
    const el = target();
    if (!el || !el.isConnected || el.hidden || !el.getBoundingClientRect().width) { spot.hidden = true; return; }
    let r = el.getBoundingClientRect();
    // A target inside a real surface: add its frame's place on the page.
    const fe = el.ownerDocument !== document ? el.ownerDocument.defaultView?.frameElement : null;
    if (fe) { const f = fe.getBoundingClientRect(); r = { left: f.left + r.left * desk.k, top: f.top + r.top * desk.k, width: r.width * desk.k, height: r.height * desk.k }; }
    const c = desk.canvas.getBoundingClientRect(), k = desk.k, pad = 6;
    Object.assign(spot.style, { transform: `translate3d(${(r.left - c.left) / k - pad}px, ${(r.top - c.top) / k - pad}px, 0)`, width: `${r.width / k + pad * 2}px`, height: `${r.height / k + pad * 2}px` });
    spot.hidden = false;
  }
  let raf = 0;
  const follow = () => { cancelAnimationFrame(raf); const loop = () => { if (!sc) return; place(); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); };

  const state = () => ({ showcase: sc, index: i, total: sc?.steps.length ?? 0, step: sc?.steps[i] ?? null, busy, done: !!sc && i >= sc.steps.length - 1 });
  const changed = () => onChange?.(state());

  async function start(id) {
    const s = SHOWCASES.find((x) => x.id === id);
    if (!s) return false;
    const my = ++gen;
    sc = s; i = 0; busy = true; changed();
    await look(s);
    if (my !== gen) return true;
    busy = false; changed(); follow();
    return true;
  }
  async function runStep(k, { fast = false } = {}) {
    const st = sc?.steps[k];
    if (!st?.run) return;
    try { await st.run(desk, { fast }); } catch (e) { console.warn(e); }
  }
  async function next() {
    if (!sc || busy || i >= sc.steps.length - 1) return;
    busy = true; spot.hidden = true; changed();
    const my = gen;
    await runStep(i);
    await sleep(380);
    if (my !== gen) return;
    i++; busy = false; changed();
  }
  async function back() {
    if (!sc || busy || i === 0) return;
    const to = i - 1, s = sc, my = ++gen;
    busy = true; changed();
    await look(s);
    for (let k = 0; k < to; k++) { if (my !== gen) return; await runStep(k, { fast: true }); await sleep(120); }
    if (my !== gen) return;
    i = to; busy = false; changed(); follow();
  }
  function exit() {
    gen++; sc = null; i = 0; busy = false; spot.hidden = true; cancelAnimationFrame(raf);
    changed();
  }

  // Doing the highlighted thing yourself counts as Next (a click, or a right-click where asked).
  const hit = (e) => {
    if (!sc || busy) return false;
    const el = target();
    return !!el && el.ownerDocument === document && (el === e.target || el.contains(e.target));
  };
  desk.canvas.addEventListener("click", (e) => {
    if (sc?.steps[i]?.on === "contextmenu" || !hit(e) || !sc.steps[i].run) return;
    e.preventDefault(); e.stopPropagation(); next();
  }, true);
  desk.canvas.addEventListener("contextmenu", (e) => {
    if (sc?.steps[i]?.on !== "contextmenu" || !hit(e)) return;
    e.preventDefault(); e.stopPropagation(); next();
  }, true);

  return {
    list: SHOWCASES, start, next, back, exit,
    reset: () => (sc ? start(sc.id) : null),
    get current() { return sc; }, get index() { return i; }, get busy() { return busy; }, state,
  };
}

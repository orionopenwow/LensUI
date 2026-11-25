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
  docks: [["browser", 0.04, 0.04, 0.56, 0.8, "browser.html?scene=home"], ["notes", 0.62, 0.1, 0.34, 0.66, "coreapps.html?app=notes"]],
  browser: [["browser", 0.05, 0.03, 0.9, 0.94, "browser.html?scene=home"]],
  themes: [["browser", 0.04, 0.04, 0.56, 0.8, "browser.html?scene=home"], ["notes", 0.62, 0.1, 0.34, 0.66, "coreapps.html?app=notes"]],
  magic: [["browser", 0.02, 0.04, 0.6, 0.9, "browser.html?scene=frame"]],
  agent: [["browser", 0.02, 0.04, 0.62, 0.9, "browser.html?scene=agent"]],
  desktop: [["browser", 0.02, 0.04, 0.56, 0.84, "browser.html?scene=home"], ["notes", 0.6, 0.1, 0.38, 0.66, "coreapps.html?app=notes"]],
};

/** Every dock style, in the order the tour shows them: [style, name, line, shape?, pack?]. */
const DOCK_TOUR = [
  ["floating", "Floating", "the default: a glass pill above your windows", null, "obsidian"],
  ["taskbar", "Taskbar", "full width with Windows 11 proportions", null, "obsidian"],
  ["slim", "Slim", "the same dock, thinner and quieter", null, "obsidian"],
  ["studio", "Studio", "labels and room to breathe on big screens", null, "obsidian"],
  ["minimal", "Minimal", "just the icons, nothing else", null, "obsidian"],
  ["split", "Split", "apps on one side, status on the other", null, "obsidian"],
  ["islands", "Islands", "grouped pills", null, "catppuccin-mocha"],
  ["islands", "Expressive", "soft, bold shapes with its own pack", "expressive", "lens-expressive"],
  ["islands", "Dot Matrix", "drawn in dots, with its own pack", "dotmatrix", "lens-dot-matrix"],
];
const setPack = async (d, id) => { const p = (await getPacks()).find((x) => x.id === id); if (p && d.pack?.id !== p.id) d.setPack(p); };
const dockStep = ([style, name, line, shape, pack], k) => ({
  cap: k === 0 ? `Pick your dock. ${name}: ${line}. Press Next to try the others on this desk.` : `${name}: ${line}.`,
  target: (d) => d.frame,
  run: async (d) => { const nx = DOCK_TOUR[k + 1]; if (!nx) return; await setPack(d, nx[4]); d.dockStyle(nx[0], nx[3] ?? "classic"); },
});

/** Theme tour stops: [pack, line]. */
const THEME_TOUR = [
  ["catppuccin-mocha", "Catppuccin Mocha: soft pastels on dark."],
  ["alabaster-daylight", "Alabaster Daylight: a light look for bright rooms."],
  ["living-sky", "Living Sky: the wallpaper follows the time of day."],
  ["lens-expressive", "Lens Expressive: bold shapes, its own dock."],
];

/**
 * step: { cap, target?(desk) → element (may be inside a surface), run(desk) }
 * `run` must be quick to replay (Back replays earlier steps with no pauses).
 * Order follows the page: docks first, then Lens Browser, then themes and the rest.
 */
export const SHOWCASES = [
  {
    id: "docks", title: "Docks", line: "Nine styles. Floating by default.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [...DOCK_TOUR.map(dockStep), { cap: "Keep the one you like in Settings › Dock. Floating stays the default.", target: (d) => d.frame }].map((st, k, all) => (k === all.length - 2 ? { ...st, run: undefined } : st)),
  },
  {
    id: "browser", title: "Lens Browser", line: "Light, with an AI that asks first.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Lens Browser opens on one box: search, an address, or a question. Most visited and recently closed sit underneath.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=suggest") },
      { cap: "Typing searches your open tabs, bookmarks and history as you go.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=agent") },
      { cap: "Ask it to do something, and the AI works beside the page, not instead of it. Every click and every word it types is listed.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=approval") },
      { cap: "Anything that books, pays or sends waits for you. Here a $25 no-show fee: you see the exact button and the details, then hold to approve.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=results") },
      { cap: "Then it shows what it found: a map, a table and its pick, with why.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=permission") },
      { cap: "Optional stop: a site that wants your camera or location asks under the address bar. Block, allow once, or allow for that site.", target: (d) => winEl(d, "browser"), run: (d) => d.scene("browser", "browser.html?scene=agent") },
      { cap: "Optional stop: text hidden in a page that tries to steer the AI is flagged in the log, not obeyed. Look for “Flagged” in the panel.", target: (d) => winEl(d, "browser") },
    ],
  },
  {
    id: "themes", title: "Themes", line: "Every surface follows one look.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      ...THEME_TOUR.map(([id, line], k) => ({
        cap: k === 0 ? "One theme colours everything: the top bar, the dock, every window. Press Next to switch." : THEME_TOUR[k - 1][1],
        target: (d) => d.topbar,
        run: async (d) => { await setPack(d, id); if (id === "lens-expressive") d.dockStyle("islands", "expressive"); },
      })),
      { cap: `${THEME_TOUR.at(-1)[1]} The Theme lab further down has all of them.`, target: (d) => d.topbar },
    ],
  },
  {
    id: "magic", title: "Right-click", line: "Right-click anything; Lens knows what it is.",
    look: { pack: "tokyo-night", dock: "floating" },
    steps: [
      { cap: "Right-click a link in Lens Browser.", target: (d) => winEl(d, "browser"), run: (d) => d.openMagic("link", pointIn(d, "browser", 0.42, 0.3)) },
      { cap: "The Lens menu opens right where you clicked. Pick Summarise: the answer appears in the same window.", target: (d) => d.overs.magic.el, run: (d) => d.openMagic("summary", pointIn(d, "browser", 0.42, 0.3)) },
      { cap: "On a video page, the same menu gets the transcript.", target: (d) => d.overs.magic.el, run: (d) => { d.scene("browser", "browser.html?scene=transcript"); d.openMagic("transcript", pointIn(d, "browser", 0.42, 0.3)); } },
      { cap: "Right-click an image and save it to your Shelf. Undo is right there.", target: (d) => d.overs.magic.el, run: (d) => d.openMagic("shelf", pointIn(d, "browser", 0.3, 0.42)) },
      { cap: "Anything that would change your PC waits for your OK.", target: (d) => d.overs.magic.el, run: (d) => d.openMagic("approval", pointIn(d, "browser", 0.36, 0.36)) },
      { cap: "Now try it yourself: right-click anywhere on the desk or in a window.", run: (d) => d.hideMenu() },
    ],
  },
  {
    id: "agent", title: "Your agent", line: "Claude or your own, across your apps.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Connect Claude Desktop, a local model or any MCP agent. It can use Lens's tools in your apps: here, Lens Browser.", target: (d) => winEl(d, "browser"), run: (d) => { const w = d.open("approval"); if (w) d.setRect(w, { x: d.W - 470, y: d.TOP + 40, w: 440, h: Math.min(520, d.H - d.TOP - 150) }); } },
      { cap: "Before anything changes, Lens shows “Needs your OK”: who is asking, what it will do, and a preview.", target: (d) => winEl(d, "approval") },
    ],
  },
  {
    id: "desktop", title: "Desktop", line: "Windows, Quick Settings and Command.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Every window here is the app's real one. Snap Lens Browser to the left half.", target: (d) => winEl(d, "browser"), run: (d) => d.snap(d.byApp("browser")?.id, "left") },
      { cap: "And Notes to the right.", target: (d) => winEl(d, "notes"), run: (d) => d.snap(d.byApp("notes")?.id, "right") },
      { cap: "Quick Settings opens from the top bar: Wi-Fi, sound, battery, theme.", target: (d) => d.overs.qs.el, run: (d) => d.openFly() },
      { cap: "Ctrl+Space opens Lens Command: one box to ask, search and run things.", target: (d) => d.overs.cmd.el, run: (d) => d.openCmd("compact") },
      { cap: "That's the everyday desk. Close Command and play.", run: (d) => d.closeCmd() },
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

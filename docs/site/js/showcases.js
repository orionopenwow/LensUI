// Showcases: the hero desk's demo. It plays by itself, slowly and on repeat: each part (the Dock, Lens
// Browser, Right-click, Themes, the agentic desktop) sets a look, then shows its feature in three calm
// steps, ~5 s each, and hands over to the next part. Pointing at the desk or focusing it holds the
// current step; Pause stops it; doing anything on the desk yourself stops it until you press Play. With
// reduced motion it shows the first step of the first part, still. Every step shows a real Lens surface
// in a real state: the window's frame loads that scene of the app's own component (js/desk.js).
import { reducedMotion } from "./site.js";
import { getPacks } from "./desk.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? 0 : ms));
/** An element inside a real surface (a window's app id, or "top" | "qs" | "cmd" | "magic"). */
const inApp = (desk, app, sel) => desk.doc(app)?.querySelector(sel) ?? null;
const winEl = (desk, app) => desk.byApp(app)?.el ?? null;
/** A desk point inside a window, as fractions of it (where a right-click lands). */
const pointIn = (desk, app, fx, fy) => { const w = desk.byApp(app); return w ? { x: w.x + w.w * fx, y: w.y + w.h * fy } : { x: desk.W / 2, y: desk.H / 2 }; };
void inApp;
export const STEP_MS = 5200;

/** Window layouts as fractions of the work area: [app, x, y, w, h, scene?]. */
const LAYOUT = {
  docks: [["browser", 0.04, 0.04, 0.56, 0.8, "browser.html?scene=home"], ["notes", 0.62, 0.1, 0.34, 0.66, "coreapps.html?app=notes"]],
  browser: [["browser", 0.05, 0.03, 0.9, 0.94, "browser.html?scene=home"]],
  themes: [["browser", 0.04, 0.04, 0.56, 0.8, "browser.html?scene=home"], ["notes", 0.62, 0.1, 0.34, 0.66, "coreapps.html?app=notes"]],
  magic: [["browser", 0.02, 0.04, 0.6, 0.9, "browser.html?scene=frame"]],
  agent: [["browser", 0.02, 0.04, 0.62, 0.9, "browser.html?scene=dinner-plan"]],
};

/** Dock styles the Dock part cycles through, one per loop: [style, name, line, shape?, pack]. */
const DOCK_TOUR = [
  ["floating", "Floating", "the default: a glass pill above your windows", null, "obsidian"],
  ["taskbar", "Taskbar", "full width, at Windows 11 proportions", null, "obsidian"],
  ["islands", "Islands", "grouped pills", null, "catppuccin-mocha"],
  ["slim", "Slim", "the same dock, thinner and quieter", null, "obsidian"],
  ["split", "Split", "apps on one side, status on the other", null, "obsidian"],
];
const setPack = async (d, id) => { const p = (await getPacks()).find((x) => x.id === id); if (p && d.pack?.id !== p.id) d.setPack(p); };
let dockTurn = 0;
const dockNow = () => DOCK_TOUR[dockTurn % DOCK_TOUR.length];

/**
 * A part: { id, title, line, look, steps: [three × { cap, go(desk), target?(desk) }] }.
 * `go` puts the desk into that step's state (it runs when the step begins).
 * Order follows the page: the Dock first, then Lens Browser, Right-click, Themes, the agentic desktop.
 */
export const SHOWCASES = [
  {
    id: "docks", title: "The Dock", line: "Nine styles, any edge.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: () => `The Dock, ${dockNow()[1]}: ${dockNow()[2]}. Nine styles, on any edge of the screen.`, target: (d) => { try { return d.frame.contentDocument?.querySelector(".dock-pill"); } catch { return null; } },
        go: async (d) => { const [style, , , shape, pack] = dockNow(); await setPack(d, pack); d.dockStyle(style, shape ?? "classic"); } },
      { cap: () => (dockNow()[0] === "taskbar" ? "Settings opens from the gear like Windows' Start menu: its own size, just above the bar. A second click, its ×, or Esc closes it." : "Settings opens from the gear, joined to the dock as one shape, at its own size. A second click, its ×, or Esc closes it."),
        go: (d) => d.openSettings() },
      { cap: "Search opens from the dock too, in the same place: apps, files and answers as you type.",
        go: async (d) => { d.closeSettings(); await sleep(300); d.search(true, "notes", { focus: false }); } },
    ],
    leave: (d) => { d.search(false, undefined, { focus: false }); d.closeSettings(); dockTurn++; },
  },
  {
    id: "browser", title: "Lens Browser", line: "Light, with AI beside the page.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Lens Browser opens on one box: a search, an address, or a question.", target: (d) => winEl(d, "browser"), go: (d) => d.scene("browser", "browser.html?scene=home") },
      { cap: "Ask it to do something: the AI works beside the page and lists every click and word.", target: (d) => winEl(d, "browser"), go: (d) => d.scene("browser", "browser.html?scene=agent") },
      { cap: "Then it shows what it found: a map, a table and its pick, with why.", target: (d) => winEl(d, "browser"), go: (d) => d.scene("browser", "browser.html?scene=results") },
    ],
  },
  {
    id: "magic", title: "Right-click", line: "Right-click anything.",
    look: { pack: "tokyo-night", dock: "floating" },
    steps: [
      { cap: "Right-click a link: the Lens menu opens right where you clicked, and knows it's a link.", target: (d) => d.overs.magic.el, go: (d) => d.openMagic("link", pointIn(d, "browser", 0.42, 0.3)) },
      { cap: "Pick Summarise: the answer appears in the same window.", target: (d) => d.overs.magic.el, go: (d) => d.openMagic("summary", pointIn(d, "browser", 0.42, 0.3)) },
      { cap: "On a video page, the same menu gets the transcript.", target: (d) => d.overs.magic.el, go: (d) => { d.scene("browser", "browser.html?scene=transcript"); d.openMagic("transcript", pointIn(d, "browser", 0.42, 0.3)); } },
    ],
    leave: (d) => d.hideMenu(),
  },
  {
    id: "themes", title: "Themes", line: "One look for everything.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "One theme colours everything: the top bar, the dock, every window. Catppuccin Mocha.", target: (d) => d.topbar, go: (d) => setPack(d, "catppuccin-mocha") },
      { cap: "Alabaster Daylight: a light look for bright rooms.", target: (d) => d.topbar, go: (d) => setPack(d, "alabaster-daylight") },
      { cap: "Living Sky: the wallpaper follows the time of day. 89 looks in all.", target: (d) => d.topbar, go: (d) => setPack(d, "living-sky") },
    ],
  },
  {
    id: "agent", title: "Agentic desktop", line: "Your agent, across your apps.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Claude Code, connected over MCP, asks Lens to book Friday dinner for 4. Lens Browser searches and picks a place.", target: (d) => winEl(d, "browser"), go: (d) => d.scene("browser", "browser.html?scene=dinner-plan") },
      { cap: "Booking has a $25 no-show fee, so that step waits in the AI panel. Reading and searching ran on their own.", target: (d) => winEl(d, "browser"), go: (d) => d.scene("browser", "browser.html?scene=dinner") },
      { cap: "“Needs your OK”: the form it will submit and what each step may do. Then the calendar and three messages, each asking first.", target: (d) => winEl(d, "approval"),
        go: (d) => { d.scene("approval", "approval.html?scene=dinner&drag=0"); const w = d.byApp("approval"); if (w) d.setRect(w, { x: d.W - 480, y: d.TOP + 24, w: 460, h: Math.min(600, d.H - d.TOP - 140) }); } },
    ],
    leave: (d) => { const w = d.byApp("approval"); if (w) d.close(w.id); },
  },
];

export function createShowcases(desk, { onChange } = {}) {
  let sc = null, i = 0, busy = false, gen = 0, timer = 0;
  let paused = false, held = false, seen = false, stopped = false;
  const spot = document.createElement("div");
  spot.className = "lx-spot"; spot.setAttribute("aria-hidden", "true"); spot.hidden = true;
  desk.canvas.append(spot);

  async function look(s) {
    const packs = await getPacks();
    const p = packs.find((x) => x.id === s.look.pack);
    if (p && desk.pack?.id !== p.id) desk.setPack(p);
    desk.dockStyle(s.look.dock, s.look.shape ?? "classic");
    desk.resetWallpaper?.();
    desk.closeCmd(); desk.hideMenu(); desk.closeFly(); desk.closeSettings?.();
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
    const fe = el.ownerDocument !== document ? el.ownerDocument.defaultView?.frameElement : null;
    if (fe) { const f = fe.getBoundingClientRect(); r = { left: f.left + r.left * desk.k, top: f.top + r.top * desk.k, width: r.width * desk.k, height: r.height * desk.k }; }
    const c = desk.canvas.getBoundingClientRect(), k = desk.k, pad = 6;
    Object.assign(spot.style, { transform: `translate3d(${(r.left - c.left) / k - pad}px, ${(r.top - c.top) / k - pad}px, 0)`, width: `${r.width / k + pad * 2}px`, height: `${r.height / k + pad * 2}px` });
    spot.hidden = false;
  }
  let raf = 0;
  const follow = () => { cancelAnimationFrame(raf); const loopF = () => { if (!sc) return; place(); raf = requestAnimationFrame(loopF); }; raf = requestAnimationFrame(loopF); };

  const capOf = (st) => (typeof st?.cap === "function" ? st.cap() : st?.cap ?? "");
  const playing = () => !paused && !stopped && !held && seen && !document.hidden && !reducedMotion();
  const state = () => ({ showcase: sc, index: i, total: sc?.steps.length ?? 0, step: sc?.steps[i] ?? null, cap: capOf(sc?.steps[i]), busy, paused: paused || stopped, playing: playing() });
  const changed = () => onChange?.(state());

  async function enter(k) {
    const st = sc?.steps[k];
    i = k;
    desk.auto = true;
    try { await st?.go?.(desk); } catch (e) { console.warn(e); } finally { desk.auto = false; }
  }
  /** Shows a part from its first step. */
  async function start(id, { user = false } = {}) {
    const s = SHOWCASES.find((x) => x.id === id);
    if (!s) return false;
    const my = ++gen;
    clearTimeout(timer);
    if (sc?.leave && sc !== s) try { sc.leave(desk); } catch { /* */ }
    if (user) { paused = false; stopped = false; }
    sc = s; i = 0; busy = true; changed();
    await look(s);
    if (my !== gen) return true;
    await enter(0);
    if (my !== gen) return true;
    busy = false; changed(); follow(); arm();
    return true;
  }
  /** One beat: the next step of this part, or the next part. */
  async function next() {
    if (!sc || busy) return;
    const my = gen;
    if (i < sc.steps.length - 1) {
      busy = true; spot.hidden = true; changed();
      await enter(i + 1);
      if (my !== gen) return;
      busy = false; changed(); arm();
    } else {
      const k = SHOWCASES.indexOf(sc);
      await start(SHOWCASES[(k + 1) % SHOWCASES.length].id);
    }
  }
  function arm() { clearTimeout(timer); if (sc && playing()) timer = setTimeout(next, STEP_MS); }
  function setPaused(p) { paused = p; stopped = false; changed(); arm(); }
  function exit() {
    gen++; clearTimeout(timer);
    if (sc?.leave) try { sc.leave(desk); } catch { /* */ }
    sc = null; i = 0; busy = false; spot.hidden = true; cancelAnimationFrame(raf);
    changed();
  }
  /** The visitor did something on the desk: the demo steps aside until Play. */
  function yieldTo() { if (stopped) return; stopped = true; clearTimeout(timer); spot.hidden = true; cancelAnimationFrame(raf); changed(); }
  desk.on?.("user", () => { if (!busy) yieldTo(); });

  const host = desk.root.parentElement ?? desk.root;
  const hold = (on) => { held = on; changed(); arm(); };
  host.addEventListener("pointerenter", () => hold(true));
  host.addEventListener("pointerleave", () => hold(false));
  // Keyboard focus inside the desk holds the step (a script's focus doesn't).
  let kb = 0;
  addEventListener("keydown", () => { kb = Date.now(); }, true);
  host.addEventListener("focusin", () => { if (Date.now() - kb < 1000) hold(true); });
  host.addEventListener("focusout", (e) => { if (!host.contains(e.relatedTarget)) hold(false); });
  document.addEventListener("visibilitychange", arm);
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; changed(); arm(); }, { threshold: 0.3 }).observe(host);

  return {
    list: SHOWCASES, start, next, exit, setPaused,
    play: () => { setPaused(false); if (!sc) start(SHOWCASES[0].id); else if (stopped || spot.hidden) follow(); },
    pause: () => setPaused(true),
    reset: () => (sc ? start(sc.id) : null),
    get current() { return sc; }, get index() { return i; }, get busy() { return busy; }, get paused() { return paused || stopped; }, get playing() { return playing(); }, state,
  };
}

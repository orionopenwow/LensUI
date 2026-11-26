// The Lens desk: a live Lens desktop on the website, made of the app's real surfaces. One module,
// used by the hero and the Theme lab. The backdrop is the real ambient theme scene (src/playground);
// the dock is the real DockSurface; the top bar, Quick Settings, Lens Command, the magic right-click
// window and every app window are the real React surfaces too, each in a same-origin frame built by
// tools/site/live/build-live.mjs (live/app/*.html) on the parity harness's mock backend with scripted
// demo data. This file only does what Windows and the Lens backend do for those surfaces: it places,
// drags, snaps, minimises and closes their (frameless) windows, and routes what one surface asks of
// another. It draws no app UI of its own. Nothing here touches the visitor's system.
import { reducedMotion, isLight } from "./site.js";

const SITE = new URL("../", import.meta.url);
export const iconUrl = (id) => new URL(id.includes("/") ? id : `media/icons/${id}.svg`, SITE).href;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let packsP = null;
export const getPacks = () => (packsP ??= fetch(new URL("data/packs.json", SITE)).then((r) => r.json()));

/**
 * Desk apps: id → name, the real surface it hosts (a page under live/app/), its default size in
 * design px, and the class the real component's root carries (the checks assert on it).
 * Pinned order matches tools/site/live/site-core.ts. Every entry is a surface that exists in Lens.
 */
export const APPS = {
  browser: { name: "Lens Browser", icon: "lens-browser", src: "browser.html?scene=home", w: 860, h: 600, marker: ".lb-root" },
  notes: { name: "Notes", icon: "lens-notes", src: "coreapps.html?app=notes", w: 600, h: 560, marker: ".ca-app-notes" },
  music: { name: "Lens Music", icon: "lens-music", src: "music.html?scene=np-expanded", w: 820, h: 520, marker: ".lm-np" },
  monitor: { name: "Monitor", icon: "lens-monitor", src: "coreapps.html?app=monitor", w: 720, h: 500, marker: ".ca-app-monitor" },
  timer: { name: "Timer", icon: "lens-timer", src: "coreapps.html?app=timer", w: 420, h: 500, marker: ".ca-app-timer" },
  cleaner: { name: "Lens Cleaner", icon: "lens-cleaner", src: "cleaner.html?scene=cleanup", w: 860, h: 560, marker: ".cl-app" },
  store: { name: "Lens Apps", icon: "lens-apps", src: "shell.html?surface=apps", w: 900, h: 580, marker: ".lens-glass" },
  // Settings is the dock's pop-out in Lens, never a free window: it opens joined to the dock (see placeFly).
  settings: { name: "Settings", icon: "lens-settings", src: "shell.html?surface=settings&settingsMode=simple&esc=1&drag=0", w: 760, h: 560, marker: ".cc-shell", fly: true },
  // Not pinned to the dock: opened from the core apps grid, Command, or a tour.
  calculator: { name: "Calculator", icon: "lens-calculator", src: "coreapps.html?app=calculator", w: 380, h: 560, marker: ".ca-app-calculator" },
  color: { name: "Color", icon: "lens-color", src: "coreapps.html?app=color", w: 520, h: 520, marker: ".ca-app-color" },
  power: { name: "Power", icon: "lens-power", src: "coreapps.html?app=power", w: 600, h: 500, marker: ".ca-app-power" },
  network: { name: "Network", icon: "lens-network", src: "coreapps.html?app=network", w: 680, h: 500, marker: ".ca-app-network" },
  clipboard: { name: "Clipboard", icon: "lens-clipboard", src: "coreapps.html?app=clipboard", w: 520, h: 540, marker: ".ca-app-clipboard" },
  startup: { name: "Startup", icon: "lens-startup", src: "coreapps.html?app=startup", w: 720, h: 520, marker: ".ca-app-startup" },
  approval: { name: "Needs your OK", icon: "lens-command", src: "approval.html?scene=window&drag=0", w: 440, h: 520, marker: "[class^='ap-']", glass: true },
};
/** Real surfaces that float over the desk instead of living in a window. */
const OVER = {
  qs: { src: "shell.html?surface=quicksettings&esc=1&drag=0", w: 400, h: 600, label: "Quick Settings", marker: ".qs-shell" },
  cmd: { src: "command.html?scene=compact&esc=1&drag=0", w: 720, h: 470, label: "Lens Command", marker: ".cmd-root" },
  magic: { src: "magic.html?esc=1&drag=0&magic=0", w: 360, h: 440, label: "Magic right-click", marker: "[class^='magic-']" },
};
export const OVERS = OVER;
export const appUrl = (src, preset) => new URL(`live/app/${src}${src.includes("?") ? "&" : "?"}preset=${encodeURIComponent(preset || "obsidian")}`, SITE).href;
const TOP = 34;          // the real top bar's height (config.topBar.height)
const DOCK_H = 132;      // the dock frame's resting height: the dock, its lift and tooltips
const WORK_BOTTOM = 112; // windows tile above the dock (the tallest resting dock, plus a gap)

let uid = 0;
/**
 * createDesk(host, { label, layout })
 * host: an element the desk fills (it sets its height from the 16:10 design size).
 */
export function createDesk(host, { label = "Lens desktop", layout = [["browser", 0.06, 0.06], ["notes", 0.56, 0.12]], fitViewport = false, accentLayer = false } = {}) {
  const n = ++uid;
  host.classList.add("lx-host");
  host.innerHTML = `<div class="lx" tabindex="0" role="application" aria-roledescription="desktop" aria-label="${esc(label)}" aria-describedby="lx-help-${n}">
    <div class="lx-canvas">
      <div class="lx-bg" aria-hidden="true"><div class="lx-wall"></div><div class="lx-glow"></div></div>
      <div class="lx-wins"></div>
      <div class="lx-snap" hidden></div>
      <iframe class="lx-topbar" title="Lens top bar (live): search, Quick Settings, the clock" loading="lazy"></iframe>
      <iframe class="lx-dock" title="Lens dock (live): click an app to open or focus it, right-click for its menu" loading="lazy"></iframe>
      <div class="lx-over" data-over="qs" role="dialog" aria-label="Quick Settings" hidden></div>
      <div class="lx-over" data-over="cmd" role="dialog" aria-label="Lens Command" hidden></div>
      <div class="lx-dim" aria-hidden="true" hidden></div>
      <div class="lx-over" data-over="magic" role="dialog" aria-label="Magic right-click" hidden></div>
    </div>
    <p class="sr" id="lx-help-${n}">A live demo of the Lens desktop, made of the app's real windows. Tab to a window. With a window focused: Ctrl+Alt+Arrow keys snap or maximise it, Ctrl+Alt+M minimises, Delete closes. Ctrl+Space opens Lens Command. Right-click for the Lens menu. Nothing here touches your computer.</p>
  </div>`;
  const root = host.querySelector(".lx");
  const cv = root.querySelector(".lx-canvas");
  const winsEl = cv.querySelector(".lx-wins");
  const snapEl = cv.querySelector(".lx-snap");
  const frame = cv.querySelector(".lx-dock");
  const topbar = cv.querySelector(".lx-topbar");
  const dimEl = cv.querySelector(".lx-dim");
  const listeners = {};
  const emit = (ev, d) => (listeners[ev] ?? []).forEach((f) => f(d));
  const on = (ev, f) => ((listeners[ev] ??= []).push(f), () => (listeners[ev] = listeners[ev].filter((x) => x !== f)));
  let pack = null, accent = null, committed = null, visible = false;
  const packMsg = () => (pack ? { lens: "pack", pack: { id: pack.id, label: pack.label, base: baseOf(pack), accent: accent ?? pack.accent, radius: pack.radius, scheme: pack.scheme, frameStyle: pack.frameStyle, controlStyle: pack.controlStyle } } : null);
  const tell = (f, m) => { try { if (m) f?.contentWindow?.postMessage(m, location.origin); } catch { /* frame gone */ } };
  // The Theme lab's accent layer (css/lab-accent.css): the accent at full strength on every real
  // surface on this desk, easing from one colour to the next, with ink that reads on it.
  const onAccent = (hex) => { const n = parseInt(String(hex).slice(1, 7), 16); if (Number.isNaN(n)) return "#09090b"; const l = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] > 0.18 ? "#09090b" : "#fafafa"; };
  function dress(f) {
    if (!accentLayer) return;
    try {
      const doc = f?.contentDocument;
      if (!doc?.head) return;
      if (!doc.getElementById("lab-accent")) doc.head.append(Object.assign(doc.createElement("link"), { id: "lab-accent", rel: "stylesheet", href: new URL("css/lab-accent.css", SITE).href }));
      const r = doc.documentElement;
      r.style.setProperty("--lab-on-accent", onAccent(accent ?? pack?.accent ?? "#fafafa"));
      r.classList.toggle("lab-still", reducedMotion());
      r.classList.toggle("lab-motion", !reducedMotion());
    } catch { /* not ready yet */ }
  }
  const dressAll = () => { for (const f of [frame, topbar, ...[...wins.values()].map((w) => w.frame), ...Object.values(overs).map((o) => o.frame)]) dress(f); };

  // ---- size: a 16:10 design canvas, scaled down on small screens --------------------------------
  let W = 1280, H = 800, k = 1, full = false;
  function fit() {
    const cw = host.clientWidth || 1280;
    if (full) { W = innerWidth; H = innerHeight; k = 1; }
    else if (cw < 768) { W = 900; H = 1080; k = cw / W; }
    else {
      // Real Lens windows are desktop-sized, so the desk keeps a desktop's width (1600 design px at
      // least) and scales down to fit the page, the way a screenshot of a monitor would.
      W = Math.max(cw, 1600); k = cw / W; H = Math.round(W * 10 / 16);
      /* tabs above + step bar below stay on screen */ if (fitViewport) H = Math.round(Math.max(560 / k, Math.min(H, (innerHeight - 280) / k)));
    }
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    cv.style.transform = k === 1 ? "" : `scale(${k})`;
    host.style.height = full ? "" : `${Math.round(H * k)}px`;
    for (const w of wins.values()) { clampWin(w); paint(w); }
    sizeFrame();
    placeFly();
    topbar.style.height = `${TOP}px`;
  }
  const toDesk = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; };

  // ---- windows ------------------------------------------------------------------------------------
  const wins = new Map();
  let z = 10, hw = 100, focusedId = null;
  const work = () => ({ x: 0, y: TOP, w: W, h: H - TOP - WORK_BOTTOM });
  function paint(w, extra = "") { w.el.style.transform = `translate3d(${w.x}px, ${w.y}px, 0)${extra}`; w.el.style.width = `${w.w}px`; w.el.style.height = `${w.h}px`; }
  function clampWin(w) {
    w.w = Math.min(w.w, W); w.h = Math.min(w.h, H - TOP);
    w.x = Math.max(80 - w.w, Math.min(W - 80, w.x));
    w.y = Math.max(TOP, Math.min(H - 60, w.y));
  }
  function open(id, at) {
    const a = APPS[id];
    if (!a) return null;
    if (a.fly && !open.raw) return openFly(id);
    const ex = [...wins.values()].find((w) => w.app === id);
    if (ex) { if (ex.min) restore(ex.id); focus(ex.id); return ex; }
    const el = document.createElement("section");
    el.className = `lw${a.glass ? " lw-glass" : ""}`;
    el.tabIndex = 0;
    el.dataset.app = id;
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", `${a.name} window`);
    // A Lens window is frameless: the real surface inside draws its own title bar and buttons.
    el.innerHTML = `<div class="lw-body"><div class="lw-loading" aria-hidden="true"></div><iframe class="lw-frame" title="${esc(a.name)} (the real Lens surface, live)"></iframe></div>${["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => `<i class="rz rz-${d}" data-rz="${d}" aria-hidden="true"></i>`).join("")}`;
    const wk = work(), cnt = wins.size;
    const w = { id: ++hw, app: id, el, frame: el.querySelector("iframe"), src: a.src, w: Math.min(a.w, W - 24), h: Math.min(a.h, wk.h - 12), x: 0, y: 0, min: false, max: false, prev: null, tile: null, ready: false };
    w.x = at ? at[0] * W : Math.round(W * 0.14 + (cnt % 5) * 36);
    w.y = at ? TOP + at[1] * wk.h : Math.round(TOP + 24 + (cnt % 5) * 30);
    // Keep a new window's bottom edge (and its resize corner) clear of the dock on shorter desks:
    // above the resting dock (WORK_BOTTOM), not its lift-and-tooltip frame, so windows get the room.
    w.h = Math.max(240, Math.min(w.h, H - WORK_BOTTOM - w.y - 8));
    clampWin(w);
    wins.set(w.id, w);
    paint(w);
    winsEl.append(el);
    wire(w);
    if (!reducedMotion()) el.animate([{ opacity: 0, transform: `translate3d(${w.x}px, ${w.y + 14}px, 0) scale(.96)` }, { opacity: 1, transform: `translate3d(${w.x}px, ${w.y}px, 0)` }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
    if (visible) w.frame.src = appUrl(w.src, pack?.id);
    focus(w.id, { quiet: true });
    sync();
    emit("open", w);
    return w;
  }
  /** Shows another scene of the same real surface in an open window (tours step through these). */
  function scene(app, src) {
    const w = open(app);
    if (!w || w.src === src) return w;
    w.src = src; w.ready = false; w.el.classList.remove("is-ready");
    if (visible) w.frame.src = appUrl(src, pack?.id);
    return w;
  }
  function focus(hwnd, { quiet = false, user = false } = {}) {
    const w = wins.get(hwnd);
    if (!w) return;
    w.el.style.zIndex = String(++z);
    focusedId = hwnd;
    for (const x of wins.values()) x.el.classList.toggle("is-focused", x === w);
    // A focus ring only after a real click or keyboard focus, never from a script.
    if (user) w.el.classList.add("was-clicked");
    if (!quiet) sync();
  }
  function blurAll() { focusedId = null; for (const x of wins.values()) x.el.classList.remove("is-focused"); sync(); }
  /** The dock icon's centre, in desk px (for the genie). */
  function dockIconAt(app) {
    try {
      const d = frame.contentDocument, name = APPS[app].name;
      const b = [...d.querySelectorAll(".dock-item")].find((x) => (x.getAttribute("aria-label") ?? "").startsWith(name));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: frame.offsetTop + r.top + r.height / 2 };
    } catch { return null; }
  }
  function minimize(hwnd) {
    const w = wins.get(hwnd);
    if (!w || w.min) return;
    w.min = true;
    const t = dockIconAt(w.app) ?? { x: W / 2, y: H - 40 };
    const go = () => { w.el.classList.add("is-min"); if (focusedId === hwnd) blurAll(); sync(); };
    if (reducedMotion()) return go();
    const dx = t.x - (w.x + w.w / 2), dy = t.y - (w.y + w.h / 2);
    w.el.animate([{ transform: `translate3d(${w.x}px, ${w.y}px, 0)`, opacity: 1 }, { transform: `translate3d(${w.x + dx}px, ${w.y + dy}px, 0) scale(.06, .04)`, opacity: 0 }], { duration: 380, easing: "cubic-bezier(.5,0,.75,0)", fill: "none" }).finished.then(go, go);
    w.el.style.transformOrigin = "50% 50%";
  }
  function restore(hwnd) {
    const w = wins.get(hwnd);
    if (!w || !w.min) return;
    w.min = false;
    w.el.classList.remove("is-min");
    focus(hwnd);
    if (!reducedMotion()) {
      const t = dockIconAt(w.app) ?? { x: W / 2, y: H - 40 };
      const dx = t.x - (w.x + w.w / 2), dy = t.y - (w.y + w.h / 2);
      w.el.animate([{ transform: `translate3d(${w.x + dx}px, ${w.y + dy}px, 0) scale(.06, .04)`, opacity: 0 }, { transform: `translate3d(${w.x}px, ${w.y}px, 0)`, opacity: 1 }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    sync();
  }
  function close(hwnd) {
    const w = wins.get(hwnd);
    if (!w) return;
    wins.delete(hwnd);
    if (fly?.id === hwnd) { fly = null; send({ lens: "settings", open: false, docked: dstyle !== "taskbar" }); }
    if (focusedId === hwnd) { const top = [...wins.values()].filter((x) => !x.min).sort((a, b) => +b.el.style.zIndex - +a.el.style.zIndex)[0]; top ? focus(top.id, { quiet: true }) : blurAll(); }
    const done = () => { w.el.remove(); w.cleanup?.(); };
    if (reducedMotion()) done(); else w.el.animate([{ opacity: 1 }, { opacity: 0, transform: `translate3d(${w.x}px, ${w.y}px, 0) scale(.96)` }], { duration: 160 }).finished.then(done, done);
    sync();
    emit("close", w);
  }
  /** Animates a window to a rect; transforms for the move, one size change at the end. */
  function setRect(w, r, { animate = true } = {}) {
    const from = { x: w.x, y: w.y, w: w.w, h: w.h };
    Object.assign(w, r);
    paint(w);
    if (!animate || reducedMotion() || !w.el.animate) return;
    const sx = from.w / w.w, sy = from.h / w.h;
    w.el.animate([{ transformOrigin: "0 0", transform: `translate3d(${from.x}px, ${from.y}px, 0) scale(${sx}, ${sy})` }, { transformOrigin: "0 0", transform: `translate3d(${w.x}px, ${w.y}px, 0)` }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  const SLOTS = {
    left: (wk) => ({ x: wk.x + 6, y: wk.y + 6, w: wk.w / 2 - 9, h: wk.h - 12 }),
    right: (wk) => ({ x: wk.x + wk.w / 2 + 3, y: wk.y + 6, w: wk.w / 2 - 9, h: wk.h - 12 }),
    max: (wk) => ({ x: wk.x, y: wk.y, w: wk.w, h: wk.h + WORK_BOTTOM }),
    tl: (wk) => ({ x: wk.x + 6, y: wk.y + 6, w: wk.w / 2 - 9, h: wk.h / 2 - 9 }),
    tr: (wk) => ({ x: wk.x + wk.w / 2 + 3, y: wk.y + 6, w: wk.w / 2 - 9, h: wk.h / 2 - 9 }),
    bl: (wk) => ({ x: wk.x + 6, y: wk.y + wk.h / 2 + 3, w: wk.w / 2 - 9, h: wk.h / 2 - 9 }),
    br: (wk) => ({ x: wk.x + wk.w / 2 + 3, y: wk.y + wk.h / 2 + 3, w: wk.w / 2 - 9, h: wk.h / 2 - 9 }),
  };
  function snap(hwnd, slot) {
    const w = wins.get(hwnd);
    if (!w) return;
    if (slot === "restore" || (slot === "max" && w.tile === "max")) { if (w.prev) setRect(w, w.prev); w.tile = null; w.max = false; w.el.classList.remove("is-max"); return; }
    if (!w.tile) w.prev = { x: w.x, y: w.y, w: w.w, h: w.h };
    setRect(w, SLOTS[slot](work()));
    w.tile = slot; w.max = slot === "max";
    w.el.classList.toggle("is-max", w.max);
    focus(hwnd);
    emit("snap", { w, slot });
  }
  function slotAt(p) {
    const e = 10, c = 70;
    const L = p.x <= e, R = p.x >= W - e, T = p.y <= TOP + e;
    if (T && p.x < c) return "tl";
    if (T && p.x > W - c) return "tr";
    if (L && p.y > H - WORK_BOTTOM - c) return "bl";
    if (R && p.y > H - WORK_BOTTOM - c) return "br";
    if (L) return "left";
    if (R) return "right";
    if (T) return "max";
    return null;
  }
  function showSnap(slot) {
    if (!slot) { snapEl.hidden = true; return; }
    const r = SLOTS[slot](work());
    snapEl.hidden = false;
    snapEl.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
    snapEl.style.width = `${r.w}px`; snapEl.style.height = `${r.h}px`;
  }

  // Pointer: the real surface's own title bar drags its window (the frame reports the pointer, see
  // tools/site/live/surfaces/embed.ts); Alt+drag or the edges work from the page.
  let dragging = null;
  function wire(w) {
    const el = w.el;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      focus(w.id, { user: e.isTrusted });
      const rz = e.target.closest("[data-rz]");
      if (!rz && !e.altKey) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const p = toDesk(e);
      startDrag(w, rz ? rz.dataset.rz : "move", p, e.pointerId);
    });
    el.addEventListener("pointermove", (e) => { if (dragging?.w === w && dragging.id === e.pointerId) move(toDesk(e)); });
    const end = (e) => { if (dragging?.w === w && dragging.id === e.pointerId) drop(); };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
    el.addEventListener("focus", (e) => { if (e.target === el) focus(w.id, { user: true }); });
  }
  function startDrag(w, mode, p, id) {
    dragging = { w, mode, start: p, orig: { x: w.x, y: w.y, w: w.w, h: w.h }, last: p, t: performance.now(), vx: 0, slot: null, id };
    root.classList.add("is-dragging");
    calm(true);
    root.classList.toggle("is-pagedrag", id !== "frame"); // frames stay live while their own title bar drags
    play?.setStill(true); // the window gets the frames while it moves
    emit("user", "drag");
  }
  /** While a window moves, the embedded surfaces hold still and drop their glass blur: every blur
   *  over a moving window would otherwise be recomputed each frame. Restored on drop. */
  function calm(on) {
    document.documentElement.classList.toggle("is-calm", on); // the page's own ambient loops pause too
    for (const f of document.querySelectorAll("iframe")) {
      try {
        const doc = f.contentDocument;
        if (!doc?.documentElement) continue;
        if (on && !doc.getElementById("site-calm")) {
          const st = doc.createElement("style");
          st.id = "site-calm";
          st.textContent = ".site-calm *, .site-calm *::before, .site-calm *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; animation-play-state: paused !important; }";
          doc.head.appendChild(st);
        }
        doc.documentElement.classList.toggle("site-calm", on);
      } catch { /* not ready yet */ }
    }
  }
  let raf = 0, pending = null;
  function move(p) {
    pending = p;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; apply(pending); });
  }
  /** Applies the latest pointer position to the window being moved or resized. */
  function apply(q) {
    {
      const d = dragging;
      if (!d || !q) return;
      const w = d.w, dx = q.x - d.start.x, dy = q.y - d.start.y;
      if (d.mode === "move") {
        if (w.tile && Math.hypot(dx, dy) > 6) {
          // Dragging a tiled window off restores its size under the pointer.
          const pr = w.prev ?? d.orig, fx = (d.start.x - d.orig.x) / d.orig.w;
          w.w = pr.w; w.h = pr.h; d.orig = { x: d.start.x - fx * pr.w, y: d.orig.y, w: pr.w, h: pr.h };
          w.tile = null; w.max = false; w.el.classList.remove("is-max");
        }
        w.x = d.orig.x + dx; w.y = Math.max(TOP, d.orig.y + dy);
        const now = performance.now(), vx = (q.x - d.last.x) / Math.max(8, now - d.t);
        d.vx = d.vx * 0.7 + vx * 0.3; d.last = q; d.t = now;
        const tilt = reducedMotion() ? 0 : Math.max(-3, Math.min(3, d.vx * 2.2));
        paint(w, tilt ? ` rotate(${tilt.toFixed(2)}deg)` : "");
        d.slot = slotAt(q);
        showSnap(d.slot);
      } else {
        const o = d.orig, m = d.mode, minW = 280, minH = 170;
        let { x, y, w: ww, h: hh } = o;
        if (m.includes("e")) ww = Math.max(minW, o.w + dx);
        if (m.includes("s")) hh = Math.max(minH, o.h + dy);
        if (m.includes("w")) { ww = Math.max(minW, o.w - dx); x = o.x + o.w - ww; }
        if (m.includes("n")) { hh = Math.max(minH, o.h - dy); y = Math.max(TOP, o.y + o.h - hh); }
        Object.assign(w, { x, y, w: ww, h: hh });
        w.tile = null;
        paint(w);
      }
    }
  }
  function drop() {
    const d = dragging;
    if (!d) return;
    // A fast flick can end before the next frame: apply its last position first.
    if (raf) { cancelAnimationFrame(raf); raf = 0; apply(pending); }
    pending = null;
    dragging = null;
    root.classList.remove("is-dragging", "is-pagedrag");
    calm(false);
    play?.setStill(still());
    showSnap(null);
    const w = d.w;
    if (d.slot) snap(w.id, d.slot);
    else {
      clampWin(w);
      paint(w);
      if (!reducedMotion() && Math.abs(d.vx) > 0.05) w.el.animate([{ transform: `translate3d(${w.x}px, ${w.y}px, 0) rotate(${Math.max(-3, Math.min(3, d.vx * 2.2))}deg)` }, { transform: `translate3d(${w.x}px, ${w.y}px, 0) rotate(${-Math.max(-1, Math.min(1, d.vx))}deg)`, offset: 0.6 }, { transform: `translate3d(${w.x}px, ${w.y}px, 0)` }], { duration: 420, easing: "ease-out" });
    }
    emit("moved", w);
  }


  // ---- the dock frame: real Lens dock, bridged ------------------------------------------------------
  let frameReady = false, tall = false;
  const outbox = [];
  const send = (m) => (frameReady ? frame.contentWindow?.postMessage(m, location.origin) : outbox.push(m));
  function sizeFrame() {
    frame.style.height = `${tall ? H - TOP : DOCK_H}px`;
    frame.style.top = `${tall ? TOP : H - DOCK_H}px`;
  }
  function sync() {
    const list = [...wins.values()].map((w) => ({ hwnd: w.id, app: w.app, title: APPS[w.app].name, focused: w.id === focusedId && !w.min, min: w.min }));
    send({ lens: "windows", list });
    emit("windows", list);
  }
  addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow) return;
    const m = e.data ?? {};
    if (m.lens === "ready" && !frameReady) { frameReady = true; dress(frame); root.classList.add("dock-live"); outbox.splice(0).forEach((x) => frame.contentWindow.postMessage(x, location.origin)); sync(); }
    else if (m.lens === "tall") { if (m.on) closeFly2(); tall = !!m.on; sizeFrame(); frame.classList.toggle("is-tall", tall); emit("dock-tall", tall); }
    else if (m.lens === "act") { emit("user", "dock"); act(m.cmd, m.args); }
  });
  frame.addEventListener("load", () => frame.contentWindow?.postMessage({ lens: "ping" }, location.origin));
  // The frame only takes the pointer over the dock itself, so windows under its empty band stay clickable.
  let pill = null;
  function pillRect() {
    try { const p = frame.contentDocument?.querySelector(".dock-pill"); if (!p) return null; const r = p.getBoundingClientRect(); return { l: r.left - 12, r: r.right + 12, t: frame.offsetTop + r.top - 70, b: frame.offsetTop + r.bottom + 10 }; } catch { return null; }
  }
  function pillTest(p) {
    pill = pillRect();
    frame.style.pointerEvents = pill && p.x > pill.l && p.x < pill.r && p.y > pill.t && p.y < pill.b ? "auto" : "none";
  }
  cv.addEventListener("pointermove", (e) => { if (!dragging && !tall) pillTest(toDesk(e)); });
  const post = (m) => send(m);


  // ---- the dock's pop-outs: Settings (and Monitor) open joined to the dock --------------------------------
  // Mirrors src-tauri/src/app/flyout_geom.rs: Settings has its own width (760 px; a wider pill is matched
  // so the join lines up), sits centred on the dock and overlaps its top edge by 1 px so no seam shows.
  // The Taskbar style opens it like Windows' Start menu instead: 680 px, 12 px above the bar, apart.
  // A second click on its dock button, its own ×, or Esc closes it; opening search closes it.
  let fly = null, dstyle = "floating", dalign = "center";
  const FLY = { settings: [760, 560], monitor: [760, 520] };
  function pillBox() {
    try { const p = frame.contentDocument?.querySelector(".dock-pill"); if (!p) return null; const r = p.getBoundingClientRect(); if (!r.width) return null; return { l: r.left, r: r.right, t: frame.offsetTop + r.top, w: r.width }; } catch { return null; }
  }
  function placeFly() {
    const w = fly && wins.get(fly.id);
    if (!w) return;
    const p = pillBox(), bar = dstyle === "taskbar";
    const [ow, oh] = FLY[w.app] ?? FLY.settings;
    // A wider pill is matched so the join lines up; a full-width row (Islands' container) is not a pill.
    const pw = p && p.w <= W * 0.75 ? p.w : 0;
    const ww = Math.round(Math.max(320, Math.min(W - 24, bar ? Math.min(ow, 680) : Math.max(ow, pw))));
    const top = p ? p.t : H - 64, gap = bar ? 12 : 0;
    const hh = Math.round(Math.max(300, Math.min(oh, top - gap - TOP - 4)));
    const x = Math.round(bar && dalign === "left" ? 12 : (W - ww) / 2);
    const y = Math.round(bar ? top - gap - hh : top - hh + 1);
    Object.assign(w, { x, y, w: ww, h: hh }); paint(w);
    w.el.classList.toggle("is-fused", !bar);
    w.el.classList.add("is-fly");
    send({ lens: "settings", open: true, docked: !bar });
  }
  function openFly(app = "settings") {
    if (fly && wins.get(fly.id)?.app === app) { focus(fly.id); return wins.get(fly.id); }
    if (fly) closeFly2();
    // One pop-out at a time, as in the app: search and Quick Settings go when Settings opens.
    if (tall) send({ lens: "search", open: false, focus: false });
    closeOver("qs");
    open.raw = true;
    let w;
    try { w = open(app); } finally { open.raw = false; }
    if (!w) return null;
    w.fly = true; fly = { id: w.id };
    placeFly();
    // The pill can settle a beat after a style change: place again once it has.
    setTimeout(placeFly, 260);
    return w;
  }
  function closeFly2() { if (fly) close(fly.id); }


  // ---- the real surfaces: what each frame asks of its window, and of the desk ---------------------------
  const overs = Object.fromEntries([...cv.querySelectorAll(".lx-over")].map((el) => [el.dataset.over, { el, frame: null, src: null }]));
  const ownerOf = (src) => {
    for (const w of wins.values()) if (w.frame.contentWindow === src) return { w };
    for (const [k2, o] of Object.entries(overs)) if (o.frame?.contentWindow === src) return { over: k2 };
    if (topbar.contentWindow === src) return { top: true };
    return null;
  };
  /** A real surface asked for something outside itself (the backend's job in the app). */
  function act(cmd, args = {}) {
    if (cmd === "launch_app_cmd") { const id = String(args.path ?? "").replace("lens://", "").split("/")[0]; open(APPS[id] ? id : "browser"); }
    else if (cmd === "focus_window_cmd") { const w = wins.get(args.hwnd); if (!w) return; if (w.min) restore(w.id); else if (focusedId === w.id) minimize(w.id); else focus(w.id); }
    else if (cmd === "window_action_cmd") { const w = wins.get(args.hwnd); if (!w) return; ({ minimize: () => minimize(w.id), close: () => close(w.id), maximize: () => snap(w.id, "max"), restore: () => restore(w.id) })[args.action]?.(); }
    else if (cmd === "open_quicksettings_tab_cmd") openOver("qs", { toggle: true });
    // The dock's own Monitor and Settings buttons.
    else if (cmd === "open_dock_popout_tab_cmd") openFly(args.tab === "monitor" ? "monitor" : "settings");
    else if (cmd === "toggle_settings_docked") fly ? closeFly2() : openFly("settings");
    else if (cmd === "hide_surface") { if (args.label === "settings") closeFly2(); else if (args.label === "quicksettings") closeOver("qs"); }
    else if (cmd === "show_command_cmd") openCmd();
    else if (cmd === "browser_open") open("browser");
    else if (cmd === "open_surface" || cmd === "toggle_surface") {
      const to = { settings: "settings", nowplaying: "music", apps: "store", cleaner: "cleaner", browser: "browser", approval: "approval" }[args.label];
      if (to) open(to); else if (args.label === "command" || args.label === "launcher" || args.label === "palette") openCmd(); else if (args.label === "quicksettings") openOver("qs", { toggle: true });
    }
  }
  addEventListener("message", (e) => {
    const who = e.source && e.origin === location.origin ? ownerOf(e.source) : null;
    const m = e.data ?? {};
    if (!who) return;
    if (m.lens === "act") { emit("user", "surface"); if (who.over === "magic" || who.over === "cmd") closeOver(who.over); return act(m.cmd, m.args); }
    if (m.lens !== "win") return;
    const w = who.w;
    if (m.a === "ready") {
      tell(e.source, packMsg());
      dress(e.source.frameElement);
      if (w) { w.ready = true; w.el.classList.add("is-ready"); emit("ready", w); }
      else if (who.over) { overs[who.over].el.classList.add("is-ready"); emit("ready", { over: who.over }); }
      else { root.classList.add("top-live"); emit("ready", { top: true }); }
      return;
    }
    if (m.a === "hover") { if (w && !dragging && !tall) pillTest({ x: w.x + m.x, y: w.y + m.y }); return; }
    if (m.a === "command") { emit("user", "key"); return overs.cmd.el.hidden ? openCmd() : closeCmd(); }
    if (m.a === "focus") { if (who.over !== "qs") closeOver("qs"); if (who.over !== "magic") closeOver("magic"); if (who.over !== "cmd") closeOver("cmd"); if (w) focus(w.id, { user: true }); return; }
    if (m.a === "magic") { const r = e.source.frameElement.getBoundingClientRect(), c = cv.getBoundingClientRect(); emit("user", "menu"); return openMagic(m.kind || "window", { x: (r.left - c.left) / k + m.x, y: (r.top - c.top) / k + m.y }); }
    if (who.over) { if (m.a === "hide" || m.a === "close") closeOver(who.over); return; }
    if (!w) return;
    if (m.a === "close" || m.a === "hide") close(w.id);
    else if (m.a === "min") minimize(w.id);
    else if (m.a === "max") snap(w.id, "max");
    else if (m.a === "drag-start" && w.fly) return;
    else if (m.a === "drag-start") {
      // The frame reports screen px; the desk knows where its window is, so the two line up here.
      const at = { x: w.x + m.cx, y: w.y + m.cy };
      startDrag(w, "move", at, "frame");
      dragging.off = { x: at.x - m.sx / k, y: at.y - m.sy / k };
    } else if (m.a === "drag-move" && dragging?.id === "frame") move({ x: m.sx / k + dragging.off.x, y: m.sy / k + dragging.off.y });
    else if (m.a === "drag-end" && dragging?.id === "frame") drop();
  });

  function openOver(which, { toggle = false, src, at } = {}) {
    const o = overs[which], spec = OVER[which];
    if (!o.el.hidden && toggle) return closeOver(which);
    for (const k2 of Object.keys(overs)) if (k2 !== which) closeOver(k2);
    const want = src ?? spec.src;
    if (!o.frame) { o.frame = document.createElement("iframe"); o.frame.title = `${spec.label} (the real Lens surface, live)`; o.el.append(o.frame); }
    if (o.src !== want) { o.src = want; o.el.classList.remove("is-ready"); o.frame.src = appUrl(want, pack?.id); }
    const ww = Math.min(spec.w, W - 16), hh = Math.min(spec.h, H - TOP - 16);
    const x = which === "qs" ? W - ww - 10 : which === "cmd" ? (W - ww) / 2 : Math.max(8, Math.min(at?.x ?? 0, W - ww - 8));
    const y = which === "qs" ? TOP + 6 : which === "cmd" ? Math.max(TOP + 8, H * 0.14) : Math.max(TOP + 4, Math.min(at?.y ?? 0, H - hh - 8));
    Object.assign(o.el.style, { transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`, width: `${ww}px`, height: `${hh}px` });
    o.el.hidden = false;
    if (!reducedMotion()) o.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 });
    // The demo opening it by itself never takes the visitor's keyboard focus.
    if (!api.auto) try { o.frame.focus({ preventScroll: true }); } catch { /* not focusable yet */ }
    emit("over", { which, open: true });
    return o;
  }
  function closeOver(which) { if (which === "magic") dimEl.hidden = true; const o = overs[which]; if (!o || o.el.hidden) return; o.el.hidden = true; emit("over", { which, open: false }); if (which === "cmd") emit("cmd", false); }
  const closeFly = () => closeOver("qs");
  const hideMenu = () => closeOver("magic");
  /** The real magic right-click window, opened at a desk point on a kind of thing (or a result step). */
  function openMagic(kindOrScene, at, over = {}) {
    const qs2 = new URLSearchParams({ scene: kindOrScene, ...over }).toString();
    const o = openOver("magic", { src: `${OVER.magic.src}&${qs2}`, at });
    // Right-click is the star of its moment: everything but the clicked spot and the menu that came
    // off it dims and softens, so the eye goes straight there.
    const p = at ?? { x: W / 2, y: H / 2 };
    dimEl.style.setProperty("--x", `${Math.round(p.x)}px`);
    dimEl.style.setProperty("--y", `${Math.round(p.y)}px`);
    dimEl.hidden = false;
    return o;
  }
  function openCmd(sceneId = "compact") { closeFly(); hideMenu(); const o = openOver("cmd", { src: `command.html?scene=${sceneId}&esc=1&drag=0` }); emit("cmd", true); return o; }
  const closeCmd = () => closeOver("cmd");
  // Right-click on the desktop itself: the same real window, on the desktop target.
  cv.addEventListener("contextmenu", (e) => {
    if (e.target.closest("iframe, input, textarea")) return;
    e.preventDefault();
    emit("user", "menu");
    hint?.remove(); hint = null;
    openMagic("desktop", toDesk(e));
  });
  cv.addEventListener("pointerdown", (e) => { if (e.target === cv || e.target.closest(".lx-bg")) { for (const k2 of Object.keys(overs)) closeOver(k2); blurAll(); emit("user", "desktop"); } });
  // A one-time hint: right-click is the feature people miss.
  let hint = document.createElement("div");
  hint.className = "lx-hint";
  hint.innerHTML = "Try right-click <b>✦</b>";
  cv.append(hint);
  setTimeout(() => { hint?.remove(); hint = null; }, 14000);

  // ---- keyboard ---------------------------------------------------------------------------------------
  root.addEventListener("keydown", (e) => {
    if (e.ctrlKey && (e.code === "Space" || e.key === " ")) { e.preventDefault(); emit("user", "key"); overs.cmd.el.hidden ? openCmd() : closeCmd(); return; }
    if (/input|textarea/i.test(e.target.tagName) || e.target.isContentEditable) return;
    const w = wins.get(focusedId);
    if (e.ctrlKey && e.altKey && w) {
      const s = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "max", ArrowDown: "restore" }[e.key];
      if (s) { e.preventDefault(); emit("user", "key"); snap(w.id, s); w.el.focus({ preventScroll: true }); return; }
      if (e.key.toLowerCase() === "m") { e.preventDefault(); minimize(w.id); root.focus({ preventScroll: true }); return; }
    }
    if (e.key === "Delete" && w && document.activeElement === w.el) { e.preventDefault(); close(w.id); root.focus({ preventScroll: true }); }
    if (e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement === root) { e.preventDefault(); api.shuffle(); }
    if (e.key === "Escape") { for (const k2 of Object.keys(overs)) closeOver(k2); closeFly2(); }
  });

  // ---- backdrop: the real ambient theme scene, with a cursor glow and a little parallax -----------
  const wall = cv.querySelector(".lx-wall"), glow = cv.querySelector(".lx-glow");
  let pg = null, play = null;
  let par = null;
  let parRaf = 0;
  cv.addEventListener("pointermove", (e) => {
    // No parallax while a window is dragged: the window gets the frames.
    if (reducedMotion() || dragging) return;
    par = toDesk(e);
    if (!parRaf) parRaf = requestAnimationFrame(() => {
      parRaf = 0;
      if (!par) return;
      glow.style.transform = `translate3d(${par.x - 300}px, ${par.y - 300}px, 0)`;
      wall.style.transform = `translate3d(${(par.x / W - 0.5) * -14}px, ${(par.y / H - 0.5) * -10}px, 0)`;
    });
  });
  const still = () => reducedMotion() || !visible || document.hidden;
  async function mountBackdrop() {
    if (pg) return;
    pg = await import(new URL("live/playground/playground.js", SITE).href);
    const p = pack ?? { base: "#09090b", accent: "#fafafa", scheme: "dark" };
    play = pg.mount(wall, { scene: "ambient", fps: 24, seed: n * 7, still: still(), ripples: false, options: { motion: "lively" }, palette: pg.packPalette({ base: p.base ?? "#09090b", accent: accent ?? p.accent, scheme: p.scheme }) });
  }
  const WALLS = ["ambient", "drift-aurora", "aurora", "star-drift", "glow-contours", "caustics"];
  let wi = 0;


  // ---- theme -------------------------------------------------------------------------------------------
  const baseOf = (p) => p.base ?? (p.scheme === "light" ? "#f4f4f5" : "#09090b");
  /** Applies a pack (and optional accent) to everything on the desk: tokens, backdrop, dock. */
  function setPack(p, { acc = null, preview = false, dockStyle } = {}) {
    if (!p) return;
    pack = p; accent = acc;
    if (!preview) committed = { p, acc };
    const light = p.scheme === "light", s = root.style;
    root.classList.add("lx-fade");
    clearTimeout(setPack.t); setPack.t = setTimeout(() => root.classList.remove("lx-fade"), 460);
    s.setProperty("--lx-base", baseOf(p));
    s.setProperty("--lx-accent", acc ?? p.accent ?? "#fafafa");
    s.setProperty("--lx-radius", `${Math.max(6, Math.min(16, p.radius ?? 10))}px`);
    root.dataset.scheme = light ? "light" : "dark";
    api.light = light;
    play?.setPalette(pg.packPalette({ base: baseOf(p), accent: acc ?? p.accent, scheme: p.scheme }));
    if (!p.collection) document.documentElement.dataset.preset = p.id;
    send({ lens: "pack", pack: { id: p.id, label: p.label, base: baseOf(p), accent: acc ?? p.accent, radius: p.radius, scheme: p.scheme, frameStyle: p.frameStyle, controlStyle: p.controlStyle }, ...(dockStyle ? { dockStyle } : {}) });
    for (const f of [topbar, ...[...wins.values()].map((w) => w.frame), ...Object.values(overs).map((o) => o.frame)]) tell(f, packMsg());
    dressAll();
    emit("theme", { p, acc, preview });
  }
  const revert = () => { if (committed) setPack(committed.p, { acc: committed.acc }); };
  /** A short wash of the accent across the desk from a point (desk px; the centre by default). */
  function wash(color, at) {
    if (reducedMotion()) return;
    const el = document.createElement("div");
    el.className = "lx-wash";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--wash", color);
    el.style.setProperty("--x", `${Math.round(at?.x ?? W / 2)}px`);
    el.style.setProperty("--y", `${Math.round(at?.y ?? H / 2)}px`);
    cv.append(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 1500);
  }


  // ---- visibility: frames load when the desk is near the screen; the backdrop pauses off-screen ---------
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !frame.src) frame.src = new URL("live/dock/index.html", SITE).href;
    if (visible && !topbar.src) topbar.src = appUrl("shell.html?surface=topbar&drag=0&magic=0", pack?.id);
    if (visible) for (const w of wins.values()) if (!w.frame.src) w.frame.src = appUrl(w.src, pack?.id);
    if (visible) mountBackdrop();
    play?.setStill(still());
    root.classList.toggle("is-off", !visible);
  }, { rootMargin: "200px" }).observe(root);
  document.addEventListener("visibilitychange", () => play?.setStill(still()));
  new ResizeObserver(() => fit()).observe(host);
  if (fitViewport) addEventListener("resize", () => fit());

  const api = {
    root, canvas: cv, frame, topbar, wins, overs, light: isLight(), get W() { return W; }, get H() { return H; }, get k() { return k; }, TOP,
    on, open, scene, close, focus, minimize, restore, snap, setRect, openCmd, closeCmd, openMagic, hideMenu, openFly: () => openOver("qs"), closeFly, closeOver, post, revert,
    focused: () => wins.get(focusedId) ?? null,
    /** The dock's Settings pop-out: open (joined to the dock), close, and whether it is open. */
    openSettings: (tab) => openFly(tab === "monitor" ? "monitor" : "settings"), closeSettings: () => closeFly2(), get fly() { return fly ? wins.get(fly.id) ?? null : null; },
    byApp: (app) => [...wins.values()].find((w) => w.app === app) ?? null,
    /** The document of a real surface (a window's app id, or "qs" | "cmd" | "magic" | "top"), for tours and checks. */
    doc: (id) => { try { return (id === "top" ? topbar : overs[id]?.frame ?? api.byApp(id)?.frame)?.contentDocument ?? null; } catch { return null; } },
    get pack() { return pack; }, get committed() { return committed; },
    setPack, wash, toDesk,
    async setMode(m) { const ps = await getPacks(); setPack(ps.find((x) => x.id === (m === "light" ? "alabaster-daylight" : "obsidian"))); },
    async shuffle() { const ps = (await getPacks()).filter((x) => !x.collection || Math.random() < 0.25); const cur = pack?.id; let p; do p = ps[Math.floor(Math.random() * ps.length)]; while (p.id === cur && ps.length > 1); setPack(p); },
    dockStyle(style, shape, align) {
      dstyle = String(style || "floating").toLowerCase(); if (align) dalign = align;
      setTimeout(placeFly, 60); setTimeout(placeFly, 420);
      const m = { lens: "config", patch: { dock: { style }, ...(shape ? { theme: { shapeStyle: shape } } : {}) } };
      send(m);
      // The top bar hands its clock and system icons to a Taskbar-style dock, as in the app.
      tell(topbar, m);
    },
    search(open2 = true, q, opts = {}) { send({ lens: "search", open: open2, focus: opts.focus !== false, ...(q != null ? { q } : {}) }); },
    /** Any backdrop scene from the Lens playground, e.g. the living "living-sky". */
    setWallpaper(id, opts = {}) { if (!play) return; play.setScene(id); for (const [k2, v] of Object.entries(opts)) play.setOption(k2, v); wi = -1; if (pack) play.setPalette(pg.packPalette({ base: baseOf(pack), accent: accent ?? pack.accent, scheme: pack.scheme })); },
    /** Puts the theme's own backdrop back (tours start from it). */
    resetWallpaper() { if (!play || wi === 0) return; wi = 0; play.setScene("ambient"); play.setOption("motion", "lively"); if (pack) play.setPalette(pg.packPalette({ base: baseOf(pack), accent: accent ?? pack.accent, scheme: pack.scheme })); },
    nextWallpaper() { if (!play) return; const id = WALLS[++wi % WALLS.length]; play.setScene(id); if (id === "ambient") play.setOption("motion", "lively"); if (pack) play.setPalette(pg.packPalette({ base: baseOf(pack), accent: accent ?? pack.accent, scheme: pack.scheme })); },
    tileAll() { const ws = [...wins.values()].filter((w) => !w.min); const slots = ws.length === 1 ? ["max"] : ws.length === 2 ? ["left", "right"] : ["tl", "tr", "bl", "br"]; ws.slice(0, slots.length).forEach((w, i) => snap(w.id, slots[i])); },
    showDesktop() { for (const w of wins.values()) minimize(w.id); },
    reset() { for (const w of [...wins.values()]) { wins.delete(w.id); w.el.remove(); } blurAll(); for (const k2 of Object.keys(overs)) closeOver(k2); layout.forEach(([id, x, y]) => open(id, [x, y])); blurAll(); },
    setQuiet() {},
    setFull(f) { full = f; root.classList.toggle("is-full", f); fit(); },
    dockIconAt, fit, slotAt, showSnap, emit,
  };
  fit();
  layout.forEach(([id, x, y]) => open(id, [x, y]));
  blurAll();
  return api;
}

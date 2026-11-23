// The Lens desk: a live, 1:1-styled Lens desktop on the website. One module, used by the hero and
// the Theme lab. It draws the real ambient theme backdrop (src/playground), Lens's top bar with its
// Quick Settings and notification flyouts, desktop icons, app windows you can drag, resize, snap,
// maximise, minimise to the dock and close, and Lens Command (Ctrl+Space). The dock is the real
// Lens dock (src/surfaces/DockSurface.tsx in an iframe, see tools/site/live/); the page and the dock
// talk with postMessage, so the dock's running dots, clicks, menus and minimise all drive these windows.
// Apps' contents load on demand from js/apps.js. Nothing here touches the visitor's system.
import { reducedMotion, isLight } from "./site.js";

const SITE = new URL("../", import.meta.url);
export const iconUrl = (id) => new URL(id.includes("/") ? id : `media/icons/${id}.svg`, SITE).href;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let packsP = null;
export const getPacks = () => (packsP ??= fetch(new URL("data/packs.json", SITE)).then((r) => r.json()));

/** Desk apps: id → name, icon, default size (design px). Pinned order matches tools/site/live/site-core.ts. */
export const APPS = {
  browser: { name: "Lens Browser", icon: "lens-browser", w: 720, h: 470 },
  files: { name: "Files", icon: "explorer", w: 560, h: 360 },
  notes: { name: "Notes", icon: "lens-notes", w: 420, h: 380 },
  music: { name: "Lens Music", icon: "lens-music", w: 380, h: 232 },
  monitor: { name: "Monitor", icon: "lens-monitor", w: 440, h: 300 },
  timer: { name: "Timer", icon: "lens-timer", w: 320, h: 300 },
  cleaner: { name: "Lens Cleaner", icon: "lens-cleaner", w: 560, h: 420 },
  terminal: { name: "Terminal", icon: "terminal", w: 560, h: 330 },
  code: { name: "VSCodium", icon: "vscodium", w: 680, h: 430 },
  chat: { name: "Discord", icon: "discord", w: 420, h: 430 },
  store: { name: "Lens Apps", icon: "lens-apps", w: 560, h: 470 },
  settings: { name: "Settings", icon: "lens-settings", w: 660, h: 470 },
};
const TOP = 32;          // top bar height (design px)
const DOCK_H = 132;      // the dock frame's resting height: the dock, its lift and tooltips
const WORK_BOTTOM = 96;  // windows tile above the dock
const ICONS = [["notes", "Launch plan.md", "file-doc"], ["browser", "Release notes", "lens-browser"], ["files", "Downloads", "explorer"], ["store", "Lens Apps", "lens-apps"]];
const NOTES = [
  { icon: "discord", app: "Discord", title: "Maya", body: "The islands dock looks great on Nord." },
  { icon: "lens-settings", app: "Lens", title: "Theme schedule", body: "Alabaster Daylight at sunrise." },
  { icon: "lens-apps", app: "Lens Apps", title: "Krita 5.3 is ready", body: "Official release, checked." },
  { icon: "lens-notes", app: "Notes", title: "Reminder", body: "Demo with the team, Friday 10:00." },
];

let uid = 0;
/**
 * createDesk(host, { label, layout, notify, quiet })
 * host: an element the desk fills (it sets its height from the 16:10 design size).
 */
export function createDesk(host, { label = "Lens desktop", layout = [["browser", 0.04, 0.1], ["code", 0.33, 0.17], ["music", 0.72, 0.52]], notify = true, fitViewport = false } = {}) {
  const n = ++uid;
  host.classList.add("lx-host");
  host.innerHTML = `<div class="lx" tabindex="0" role="application" aria-roledescription="desktop" aria-label="${esc(label)}" aria-describedby="lx-help-${n}">
    <div class="lx-canvas">
      <div class="lx-bg" aria-hidden="true"><div class="lx-wall"></div><div class="lx-glow"></div></div>
      <div class="lx-icons" role="group" aria-label="Desktop icons">${ICONS.map(([app, name, ic]) => `<button type="button" class="lx-ic" data-open="${app}"><img src="${iconUrl(ic)}" alt="" width="44" height="44"><span>${esc(name)}</span></button>`).join("")}</div>
      <div class="lx-marquee" hidden></div>
      <div class="lx-wins"></div>
      <div class="lx-snap" hidden></div>
      <div class="lx-top">
        <button type="button" class="lt-logo" data-cmd aria-label="Lens Command"><img src="${new URL("brand/lens-logo-small.svg", SITE)}" alt="" width="16" height="16"></button>
        <b class="lt-app">Desktop</b>
        <span class="lt-sp"></span>
        <button type="button" class="lt-search" data-cmd><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>Search<kbd>Ctrl Space</kbd></button>
        <span class="lt-sp"></span>
        <button type="button" class="lt-btn" data-fly="notes" aria-label="Notifications" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><i class="lt-badge">2</i></button>
        <button type="button" class="lt-btn lt-qs" data-fly="qs" aria-label="Quick Settings" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a12 12 0 0 1 16 0M7 13.5a7.5 7.5 0 0 1 10 0M10.5 17a2.5 2.5 0 0 1 3 0"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg><span class="lt-bat"><i></i></span></button>
        <time class="lt-clock"></time>
      </div>
      <div class="lx-fly lx-qs" role="dialog" aria-label="Quick Settings" hidden></div>
      <div class="lx-fly lx-nc" role="dialog" aria-label="Notifications" hidden></div>
      <iframe class="lx-dock" title="Lens dock (live): click an app to open or focus it, right-click for its menu" loading="lazy"></iframe>
      <div class="lx-toasts" aria-hidden="true"></div>
      <div class="lx-menu" role="menu" hidden></div>
      <div class="lx-cmd" role="dialog" aria-label="Lens Command" hidden><div class="lc-box"><div class="lc-in"><img src="${new URL("brand/lens-logo-small.svg", SITE)}" alt="" width="18" height="18"><input type="text" aria-label="Ask Lens or search" placeholder="Ask Lens or search apps, themes, actions…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="lc-res" role="listbox" aria-label="Results"></div></div></div>
    </div>
    <p class="sr" id="lx-help-${n}">A live demo of the Lens desktop. Tab to a window or a desktop icon. With a window focused: Ctrl+Alt+Arrow keys snap or maximise it, Ctrl+Alt+M minimises, Delete closes. Ctrl+Space opens Lens Command. Nothing here touches your computer.</p>
  </div>`;
  const root = host.querySelector(".lx");
  const cv = root.querySelector(".lx-canvas");
  const winsEl = cv.querySelector(".lx-wins");
  const snapEl = cv.querySelector(".lx-snap");
  const menuEl = cv.querySelector(".lx-menu");
  const toastsEl = cv.querySelector(".lx-toasts");
  const frame = cv.querySelector(".lx-dock");
  const cmdEl = cv.querySelector(".lx-cmd");
  const appLabel = cv.querySelector(".lt-app");
  const listeners = {};
  const emit = (ev, d) => (listeners[ev] ?? []).forEach((f) => f(d));
  const on = (ev, f) => ((listeners[ev] ??= []).push(f), () => (listeners[ev] = listeners[ev].filter((x) => x !== f)));

  // ---- size: a 16:10 design canvas, scaled down on small screens --------------------------------
  let W = 1280, H = 800, k = 1, full = false;
  function fit() {
    const cw = host.clientWidth || 1280;
    if (full) { W = innerWidth; H = innerHeight; k = 1; }
    else if (cw < 768) { W = 900; H = 1080; k = cw / W; }
    else { W = cw; H = Math.round(cw * 10 / 16); /* tabs above + step bar below stay on screen */ if (fitViewport) H = Math.max(520, Math.min(H, innerHeight - 300)); k = 1; }
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    cv.style.transform = k === 1 ? "" : `scale(${k})`;
    host.style.height = full ? "" : `${Math.round(H * k)}px`;
    for (const w of wins.values()) { clampWin(w); paint(w); }
    sizeFrame();
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
    const ex = [...wins.values()].find((w) => w.app === id);
    if (ex) { if (ex.min) restore(ex.id); focus(ex.id); return ex; }
    const el = document.createElement("section");
    el.className = "lw";
    el.tabIndex = 0;
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", `${a.name} window`);
    el.innerHTML = `<header class="lw-bar"><img src="${iconUrl(a.icon)}" alt="" width="16" height="16"><span class="lw-t">${esc(a.name)}</span>
      <span class="lw-btns"><button type="button" data-a="min" aria-label="Minimise ${esc(a.name)}"><i aria-hidden="true">−</i></button><button type="button" data-a="max" aria-label="Maximise ${esc(a.name)}"><i aria-hidden="true">+</i></button><button type="button" data-a="close" aria-label="Close ${esc(a.name)}"><i aria-hidden="true">×</i></button></span></header>
      <div class="lw-body"><div class="lw-loading" aria-hidden="true"></div></div>${["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => `<i class="rz rz-${d}" data-rz="${d}" aria-hidden="true"></i>`).join("")}`;
    const wk = work(), cnt = wins.size;
    const w = { id: ++hw, app: id, el, w: Math.min(a.w, W - 40), h: Math.min(a.h, wk.h - 20), x: 0, y: 0, min: false, max: false, prev: null, tile: null };
    w.x = at ? at[0] * W : Math.round(W * 0.18 + (cnt % 5) * 36);
    w.y = at ? TOP + at[1] * wk.h : Math.round(TOP + 30 + (cnt % 5) * 30);
    // Keep a new window's bottom edge (and its resize corner) clear of the dock on shorter desks.
    w.h = Math.max(240, Math.min(w.h, H - DOCK_H - w.y - 8));
    clampWin(w);
    wins.set(w.id, w);
    paint(w);
    winsEl.append(el);
    wire(w);
    if (!reducedMotion()) el.animate([{ opacity: 0, transform: `translate3d(${w.x}px, ${w.y + 14}px, 0) scale(.96)` }, { opacity: 1, transform: `translate3d(${w.x}px, ${w.y}px, 0)` }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
    import("./apps.js").then((m) => { el.querySelector(".lw-body").replaceChildren(); m.mount(id, el.querySelector(".lw-body"), api); });
    focus(w.id, { quiet: true });
    sync();
    emit("open", w);
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
    appLabel.textContent = APPS[w.app].name;
    if (!quiet) sync();
  }
  function blurAll() { focusedId = null; for (const x of wins.values()) x.el.classList.remove("is-focused"); appLabel.textContent = "Desktop"; sync(); }
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

  // Pointer: drag by the title bar (or Alt+drag anywhere), resize from edges, double-click maximises.
  let dragging = null;
  function wire(w) {
    const el = w.el;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      focus(w.id, { user: e.isTrusted });
      const rz = e.target.closest("[data-rz]");
      const onBar = e.target.closest(".lw-bar") && !e.target.closest("button");
      if (!rz && !onBar && !e.altKey) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const p = toDesk(e);
      dragging = { w, mode: rz ? rz.dataset.rz : "move", start: p, orig: { x: w.x, y: w.y, w: w.w, h: w.h }, last: p, t: performance.now(), vx: 0, slot: null, id: e.pointerId };
      root.classList.add("is-dragging");
      play?.setStill(true); // the window gets the frames while it moves
      emit("user", "drag");
    });
    el.addEventListener("pointermove", (e) => { if (dragging?.w === w && dragging.id === e.pointerId) move(toDesk(e)); });
    const end = (e) => { if (dragging?.w === w && dragging.id === e.pointerId) drop(); };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
    el.querySelector(".lw-bar").addEventListener("dblclick", (e) => { if (!e.target.closest("button")) snap(w.id, "max"); });
    el.querySelector(".lw-btns").addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "min") minimize(w.id); else if (a === "max") snap(w.id, "max"); else if (a === "close") close(w.id);
    });
    el.addEventListener("focus", (e) => { if (e.target === el) focus(w.id, { user: true }); });
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
    root.classList.remove("is-dragging");
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
    const list = [...wins.values()].map((w) => ({ hwnd: w.id, app: w.app, title: w.el.querySelector(".lw-t").textContent, focused: w.id === focusedId && !w.min, min: w.min }));
    send({ lens: "windows", list });
    emit("windows", list);
  }
  addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow) return;
    const m = e.data ?? {};
    if (m.lens === "ready" && !frameReady) { frameReady = true; root.classList.add("dock-live"); outbox.splice(0).forEach((x) => frame.contentWindow.postMessage(x, location.origin)); sync(); }
    else if (m.lens === "tall") { tall = !!m.on; sizeFrame(); frame.classList.toggle("is-tall", tall); emit("dock-tall", tall); }
    else if (m.lens === "act") {
      emit("user", "dock");
      const { cmd, args = {} } = m;
      if (cmd === "launch_app_cmd") { const id = String(args.path ?? "").replace("lens://", "").split("/")[0]; open(APPS[id] ? id : "browser"); }
      else if (cmd === "focus_window_cmd") { const w = wins.get(args.hwnd); if (!w) return; if (w.min) restore(w.id); else if (focusedId === w.id) minimize(w.id); else focus(w.id); }
      else if (cmd === "window_action_cmd") { const w = wins.get(args.hwnd); if (!w) return; ({ minimize: () => minimize(w.id), close: () => close(w.id), maximize: () => snap(w.id, "max"), restore: () => restore(w.id) })[args.action]?.(); }
    }
  });
  frame.addEventListener("load", () => frame.contentWindow?.postMessage({ lens: "ping" }, location.origin));
  // The frame only takes the pointer over the dock itself, so windows under its empty band stay clickable.
  let pill = null;
  function pillRect() {
    try { const p = frame.contentDocument?.querySelector(".dock-pill"); if (!p) return null; const r = p.getBoundingClientRect(); return { l: r.left - 12, r: r.right + 12, t: frame.offsetTop + r.top - 70, b: frame.offsetTop + r.bottom + 10 }; } catch { return null; }
  }
  cv.addEventListener("pointermove", (e) => {
    if (dragging || tall) return;
    const p = toDesk(e);
    pill = pillRect();
    frame.style.pointerEvents = pill && p.x > pill.l && p.x < pill.r && p.y > pill.t && p.y < pill.b ? "auto" : "none";
  });
  const post = (m) => send(m);

  // ---- desktop: icons, drag-select, right-click menu ---------------------------------------------------
  const iconsEl = cv.querySelector(".lx-icons");
  iconsEl.addEventListener("click", (e) => { const b = e.target.closest(".lx-ic"); if (!b) return; iconsEl.querySelectorAll(".lx-ic").forEach((x) => x.classList.toggle("sel", x === b)); });
  iconsEl.addEventListener("dblclick", (e) => { const b = e.target.closest(".lx-ic"); if (b) open(b.dataset.open); });
  iconsEl.addEventListener("keydown", (e) => { const b = e.target.closest(".lx-ic"); if (b && e.key === "Enter") open(b.dataset.open); });
  const marq = cv.querySelector(".lx-marquee");
  let sel = null;
  cv.querySelector(".lx-bg").parentElement.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target !== cv) return;
    closeFly(); hideMenu();
    blurAll();
    const p = toDesk(e);
    sel = { p, id: e.pointerId };
    cv.setPointerCapture(e.pointerId);
    emit("user", "desktop");
  });
  cv.addEventListener("pointermove", (e) => {
    if (!sel || sel.id !== e.pointerId) return;
    const q = toDesk(e), x = Math.min(q.x, sel.p.x), y = Math.min(q.y, sel.p.y), w = Math.abs(q.x - sel.p.x), h = Math.abs(q.y - sel.p.y);
    marq.hidden = w + h < 4;
    Object.assign(marq.style, { transform: `translate3d(${x}px, ${y}px, 0)`, width: `${w}px`, height: `${h}px` });
    const cr = cv.getBoundingClientRect();
    iconsEl.querySelectorAll(".lx-ic").forEach((b) => { const r = b.getBoundingClientRect(), bx = (r.left - cr.left) / k, by = (r.top - cr.top) / k; b.classList.toggle("sel", bx < x + w && bx + r.width / k > x && by < y + h && by + r.height / k > y); });
  });
  const endSel = () => { sel = null; marq.hidden = true; };
  cv.addEventListener("pointerup", endSel); cv.addEventListener("pointercancel", endSel);

  function showMenu(x, y, items) {
    menuEl.innerHTML = items.map((it, i) => it === "-" ? `<hr>` : `<button type="button" role="menuitem" data-i="${i}">${it.icon ? `<img src="${iconUrl(it.icon)}" alt="" width="16" height="16">` : `<span class="mi"></span>`}${esc(it.label)}${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ""}</button>`).join("");
    menuEl.hidden = false;
    const mw = 230, mh = menuEl.offsetHeight || 260;
    menuEl.style.transform = `translate3d(${Math.min(x, W - mw - 8)}px, ${Math.min(y, H - mh - 8)}px, 0)`;
    menuEl.onclick = (e) => { const b = e.target.closest("[data-i]"); if (!b) return; hideMenu(); items[+b.dataset.i].run(); };
    menuEl.querySelector("button")?.focus({ preventScroll: true });
  }
  function hideMenu() { menuEl.hidden = true; }
  menuEl.addEventListener("keydown", (e) => {
    const bs = [...menuEl.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    if (e.key === "Escape") { e.stopPropagation(); hideMenu(); root.focus({ preventScroll: true }); }
  });
  cv.addEventListener("contextmenu", async (e) => {
    if (e.target.closest(".lx-top, .lx-fly, .lx-cmd, .lx-menu, .lx-magic, input, textarea, [contenteditable]")) return;
    e.preventDefault();
    emit("user", "menu");
    const p = toDesk(e);
    hint?.remove(); hint = null;
    if (e.target.closest(".lw, .lx-ic")) {
      const M = await import("./magic.js");
      const ic = e.target.closest(".lx-ic");
      const ctx = ic ? { kind: "file", label: ic.textContent.trim(), el: { dataset: { app: ic.dataset.open } } } : M.contextOf(e.target);
      if (ctx) return M.magicMenu(api, ctx, p);
    }
    desktopMenu(p.x, p.y);
  });
  // A one-time hint: right-click is the feature people miss.
  let hint = document.createElement("div");
  hint.className = "lx-hint";
  hint.innerHTML = "Try right-click <b>✦</b>";
  cv.append(hint);
  setTimeout(() => { hint?.remove(); hint = null; }, 14000);
  function desktopMenu(x, y) {
    showMenu(x, y, [
      { label: "New note", icon: "lens-notes", run: () => open("notes") },
      { label: "Change wallpaper", icon: "lens-settings", run: () => api.nextWallpaper() },
      { label: "Next theme", icon: "lens-settings", hint: "T", run: () => api.shuffle() },
      "-",
      { label: "Tile open windows", icon: "lens-command", run: () => api.tileAll() },
      { label: "Show desktop", icon: "explorer", run: () => api.showDesktop() },
      { label: "Lens Command", icon: "lens-command", hint: "Ctrl Space", run: () => openCmd() },
    ]);
  }
  addEventListener("pointerdown", (e) => { if (!menuEl.hidden && !menuEl.contains(e.target)) hideMenu(); if (!e.target.closest?.(".lx-fly, [data-fly]")) closeFly(); }, true);

  // ---- top bar: clock, flyouts ---------------------------------------------------------------------
  const clock = cv.querySelector(".lt-clock");
  const tick = () => { const d = new Date(); clock.textContent = `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}  ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; clock.dateTime = d.toISOString(); };
  tick(); setInterval(tick, 15000);
  const state = { wifi: true, bt: true, dnd: false, night: false, volume: 62, bright: 90, unread: 2, notes: [...NOTES.slice(0, 2)] };
  const qs = cv.querySelector(".lx-qs"), nc = cv.querySelector(".lx-nc");
  function renderQS() {
    const tile = (k2, label, on) => `<button type="button" class="qt${on ? " on" : ""}" data-qt="${k2}" aria-pressed="${on}">${label}</button>`;
    qs.innerHTML = `<div class="qg">${tile("wifi", "Wi-Fi", state.wifi)}${tile("bt", "Bluetooth", state.bt)}${tile("dnd", "Do not disturb", state.dnd)}${tile("night", "Night light", state.night)}${tile("dark", "Dark mode", !api.light)}${tile("focus", "Tile windows", false)}</div>
      <label class="qsl">Volume<input type="range" min="0" max="100" value="${state.volume}" data-q="volume"></label>
      <label class="qsl">Brightness<input type="range" min="40" max="100" value="${state.bright}" data-q="bright"></label>`;
  }
  qs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-qt]");
    if (!b) return;
    const q = b.dataset.qt;
    if (q === "dark") api.setMode(api.light ? "dark" : "light");
    else if (q === "focus") api.tileAll();
    else { state[q] = !state[q]; if (q === "night") cv.classList.toggle("is-night", state.night); }
    renderQS();
  });
  qs.addEventListener("input", (e) => { const s = e.target.dataset.q; if (!s) return; state[s] = +e.target.value; if (s === "bright") cv.style.setProperty("--lx-bright", String(state.bright / 100)); });
  function renderNC() {
    nc.innerHTML = `<div class="nh"><b>Notifications</b><button type="button" data-clear>Clear all</button></div>${state.notes.length ? state.notes.map((x) => `<div class="ni"><img src="${iconUrl(x.icon)}" alt="" width="28" height="28"><div><span class="nm">${esc(x.app)}</span><strong>${esc(x.title)}</strong><span>${esc(x.body)}</span></div></div>`).join("") : `<p class="ne">You're all caught up.</p>`}`;
  }
  nc.addEventListener("click", (e) => { if (e.target.closest("[data-clear]")) { state.notes = []; state.unread = 0; renderNC(); badge(); } });
  const badge = () => { const b = cv.querySelector(".lt-badge"); b.textContent = String(state.unread); b.hidden = !state.unread; b.parentElement.setAttribute("aria-label", state.unread ? `${state.unread} Notifications` : "Notifications"); };
  function openFly(which) {
    const el = which === "qs" ? qs : nc, other = which === "qs" ? nc : qs;
    other.hidden = true;
    const was = !el.hidden;
    cv.querySelectorAll("[data-fly]").forEach((b) => b.setAttribute("aria-expanded", String(!was && b.dataset.fly === which)));
    if (was) { el.hidden = true; return; }
    which === "qs" ? renderQS() : (renderNC(), (state.unread = 0), badge());
    el.hidden = false;
    el.querySelector("button")?.focus({ preventScroll: true });
    emit("user", "fly");
  }
  function closeFly() { qs.hidden = true; nc.hidden = true; cv.querySelectorAll("[data-fly]").forEach((b) => b.setAttribute("aria-expanded", "false")); }
  cv.querySelectorAll("[data-fly]").forEach((b) => b.addEventListener("click", () => openFly(b.dataset.fly)));
  [qs, nc].forEach((f) => f.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeFly(); root.focus({ preventScroll: true }); } }));

  // Toasts: they slide in and are removed for good (never left half-faded).
  let ni = 0, nTimer = 0, visible = false, quiet = false;
  function toast(x) {
    state.notes.unshift(x); state.notes.length = Math.min(state.notes.length, 6);
    if (nc.hidden) { state.unread++; badge(); }
    const c = document.createElement("div");
    c.className = "lx-toast";
    c.innerHTML = `<img src="${iconUrl(x.icon)}" alt="" width="28" height="28"><div><span class="nm">${esc(x.app)} · now</span><strong>${esc(x.title)}</strong><span>${esc(x.body)}</span></div>`;
    toastsEl.prepend(c);
    while (toastsEl.children.length > 2) toastsEl.lastChild.remove();
    const gone = () => c.remove();
    setTimeout(() => { if (reducedMotion() || !c.animate) return gone(); c.animate([{ opacity: 1 }, { opacity: 0, transform: "translateX(16px)" }], { duration: 300, fill: "forwards" }).finished.then(gone, gone); }, 4200);
    return c;
  }
  const loop = () => {
    clearTimeout(nTimer);
    if (!notify || !visible || document.hidden || quiet || reducedMotion()) return;
    toast(NOTES[(ni++ + 2) % NOTES.length]);
    nTimer = setTimeout(loop, 11000 + Math.random() * 5000);
  };
  badge();

  // ---- Lens Command ---------------------------------------------------------------------------------
  const cmdIn = cmdEl.querySelector("input"), cmdRes = cmdEl.querySelector(".lc-res");
  let cmdSel = 0, cmdItems = [];
  function openCmd(q = "") {
    closeFly(); hideMenu();
    cmdEl.hidden = false;
    cmdIn.value = q;
    renderCmd();
    cmdIn.focus({ preventScroll: true });
    emit("cmd", true);
  }
  function closeCmd() { if (cmdEl.hidden) return; cmdEl.hidden = true; root.focus({ preventScroll: true }); emit("cmd", false); }
  async function renderCmd() {
    const q = cmdIn.value.trim();
    const A = await import("./actions.js");
    cmdItems = await A.suggest(q, api);
    cmdSel = 0;
    cmdRes.innerHTML = cmdItems.map((it, i) => `<button type="button" role="option" class="lc-r${i === 0 ? " sel" : ""}" aria-selected="${i === 0}" data-i="${i}"><img src="${iconUrl(it.icon)}" alt="" width="22" height="22"><span><b>${esc(it.title)}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ""}</span><kbd>${esc(it.kind)}</kbd></button>`).join("") || `<p class="lc-empty">Try “dark mode”, “tile left”, “timer 1 min”, “open notes”.</p>`;
  }
  const runCmd = async (i) => { const it = cmdItems[i]; if (!it) return; closeCmd(); await it.run(); };
  cmdIn.addEventListener("input", renderCmd);
  cmdIn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      cmdSel = (cmdSel + (e.key === "ArrowDown" ? 1 : -1) + cmdItems.length) % Math.max(1, cmdItems.length);
      cmdRes.querySelectorAll(".lc-r").forEach((b, i) => { b.classList.toggle("sel", i === cmdSel); b.setAttribute("aria-selected", String(i === cmdSel)); });
    } else if (e.key === "Enter") { e.preventDefault(); runCmd(cmdSel); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCmd(); }
  });
  cmdRes.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) runCmd(+b.dataset.i); });
  cmdEl.addEventListener("pointerdown", (e) => { if (e.target === cmdEl) closeCmd(); });
  cv.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => { emit("user", "cmd"); openCmd(); }));

  // ---- keyboard ---------------------------------------------------------------------------------------
  root.addEventListener("keydown", (e) => {
    if (e.ctrlKey && (e.code === "Space" || e.key === " ")) { e.preventDefault(); emit("user", "key"); cmdEl.hidden ? openCmd() : closeCmd(); return; }
    if (/input|textarea/i.test(e.target.tagName) || e.target.isContentEditable) return;
    const w = wins.get(focusedId);
    if (e.ctrlKey && e.altKey && w) {
      const s = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "max", ArrowDown: "restore" }[e.key];
      if (s) { e.preventDefault(); emit("user", "key"); snap(w.id, s); w.el.focus({ preventScroll: true }); return; }
      if (e.key.toLowerCase() === "m") { e.preventDefault(); minimize(w.id); root.focus({ preventScroll: true }); return; }
    }
    if (e.key === "Delete" && w && document.activeElement === w.el) { e.preventDefault(); close(w.id); root.focus({ preventScroll: true }); }
    if (e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement === root) { e.preventDefault(); api.shuffle(); }
    if (e.key === "Escape") { if (!menuEl.hidden) hideMenu(); closeFly(); }
  });

  // ---- backdrop: the real ambient theme scene, with a cursor glow and a little parallax -----------
  const wall = cv.querySelector(".lx-wall"), glow = cv.querySelector(".lx-glow");
  let pg = null, play = null, pack = null, accent = null, committed = null;
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
    emit("theme", { p, acc, preview });
  }
  const revert = () => { if (committed) setPack(committed.p, { acc: committed.acc }); };

  // ---- visibility: pause the backdrop and toasts off-screen ----------------------------------------------
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !frame.src) frame.src = new URL("live/dock/index.html", SITE).href;
    if (visible) mountBackdrop();
    play?.setStill(still());
    if (visible && !was) nTimer = setTimeout(loop, 4000); else if (!visible) clearTimeout(nTimer);
    root.classList.toggle("is-off", !visible);
  }, { rootMargin: "200px" }).observe(root);
  document.addEventListener("visibilitychange", () => play?.setStill(still()));
  new ResizeObserver(() => fit()).observe(host);
  if (fitViewport) addEventListener("resize", () => fit());

  const api = {
    root, canvas: cv, frame, wins, light: isLight(), get W() { return W; }, get H() { return H; }, get k() { return k; }, TOP,
    on, open, close, focus, minimize, restore, snap, setRect, toast, openCmd, closeCmd, showMenu, hideMenu, desktopMenu, openFly, closeFly, post, revert,
    focused: () => wins.get(focusedId) ?? null,
    byApp: (app) => [...wins.values()].find((w) => w.app === app) ?? null,
    get pack() { return pack; }, get committed() { return committed; },
    setPack,
    async setMode(m) { const ps = await getPacks(); setPack(ps.find((x) => x.id === (m === "light" ? "alabaster-daylight" : "obsidian"))); },
    async shuffle() { const ps = (await getPacks()).filter((x) => !x.collection || Math.random() < 0.25); const cur = pack?.id; let p; do p = ps[Math.floor(Math.random() * ps.length)]; while (p.id === cur && ps.length > 1); setPack(p); toast({ icon: "lens-settings", app: "Lens", title: `Theme: ${p.label}`, body: p.description ?? `${p.collection} collection` }); },
    dockStyle(style, shape) { send({ lens: "config", patch: { dock: { style }, ...(shape ? { theme: { shapeStyle: shape } } : {}) } }); },
    search(open = true, q, opts = {}) { send({ lens: "search", open, focus: opts.focus !== false, ...(q != null ? { q } : {}) }); },
    /** Any backdrop scene from the Lens playground, e.g. the living "living-sky". */
    setWallpaper(id, opts = {}) { if (!play) return; play.setScene(id); for (const [k, v] of Object.entries(opts)) play.setOption(k, v); wi = -1; if (pack) play.setPalette(pg.packPalette({ base: baseOf(pack), accent: accent ?? pack.accent, scheme: pack.scheme })); },
    /** Puts the theme's own backdrop back (scenes start from it). */
    resetWallpaper() { if (!play || wi === 0) return; wi = 0; play.setScene("ambient"); play.setOption("motion", "lively"); if (pack) play.setPalette(pg.packPalette({ base: baseOf(pack), accent: accent ?? pack.accent, scheme: pack.scheme })); },
    nextWallpaper() { if (!play) return; const id = WALLS[++wi % WALLS.length]; play.setScene(id); if (id === "ambient") play.setOption("motion", "lively"); if (pack) play.setPalette(pg.packPalette({ base: baseOf(pack), accent: accent ?? pack.accent, scheme: pack.scheme })); toast({ icon: "lens-settings", app: "Lens", title: "Wallpaper changed", body: id === "ambient" ? "Theme backdrop" : id.replace(/-/g, " ") }); },
    tileAll() { const ws = [...wins.values()].filter((w) => !w.min); const slots = ws.length === 1 ? ["max"] : ws.length === 2 ? ["left", "right"] : ["tl", "tr", "bl", "br"]; ws.slice(0, slots.length).forEach((w, i) => snap(w.id, slots[i])); },
    showDesktop() { for (const w of wins.values()) minimize(w.id); },
    reset() { for (const w of [...wins.values()]) { wins.delete(w.id); w.el.remove(); w.cleanup?.(); } blurAll(); closeCmd(); closeFly(); hideMenu(); toastsEl.replaceChildren(); layout.forEach(([id, x, y]) => open(id, [x, y])); blurAll(); },
    setQuiet(q) { quiet = q; if (!q) loop(); else clearTimeout(nTimer); },
    setFull(f) { full = f; root.classList.toggle("is-full", f); fit(); },
    dockIconAt, fit, slotAt, showSnap, emit,
  };
  fit();
  layout.forEach(([id, x, y]) => open(id, [x, y]));
  blurAll();
  return api;
}

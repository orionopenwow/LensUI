// A small living desktop for the home page's exhibits: Lens's top bar, a few believable app
// windows with real content, notifications that pop in, and (optionally) a light HTML dock with real
// app icons. The hero stage puts the real Lens dock (an iframe) on top of it instead.
// It wears a theme pack through CSS variables, so a pack change restyles everything at once.
// Nothing here touches the visitor's system: it is a picture of a desktop that you can poke.
import { reducedMotion } from "./site.js";

const SITE = new URL("../", import.meta.url);
const icon = (id) => new URL(id.includes("/") ? id : `media/icons/${id}.svg`, SITE).href;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---- windows ------------------------------------------------------------------------------------
const CODE = [
  ["c", "// Lens dock: magnify the icon under the pointer"],
  ["k", "export function ", "f", "magnify", "p", "(icons, x) {"],
  ["p", "  for (const ", "v", "el", "p", " of icons) {"],
  ["p", "    const ", "v", "d", "p", " = Math.", "f", "abs", "p", "(x - centre(el));"],
  ["p", "    el.style.scale = ", "n", "1 + 0.24", "p", " * falloff(d);"],
  ["p", "  }"],
  ["p", "}"],
  ["c", "// Respect reduced motion"],
  ["k", "if ", "p", "(prefersReducedMotion) magnification = ", "s", "\"off\"", "p", ";"],
  ["p", ""],
  ["c", "// Super search: apps, files and settings, ranked as you type"],
  ["k", "export async function ", "f", "search", "p", "(query) {"],
  ["p", "  const ", "v", "hits", "p", " = await ", "f", "invoke", "p", "(", "s", "\"search_all\"", "p", ", { query });"],
  ["p", "  return hits.", "f", "sort", "p", "((a, b) => b.score - a.score).", "f", "slice", "p", "(", "n", "0", "p", ", ", "n", "8", "p", ");"],
  ["p", "}"],
  ["p", ""],
  ["c", "// Every change undoes"],
  ["k", "export function ", "f", "apply", "p", "(change) {"],
  ["p", "  history.", "f", "push", "p", "(change.", "f", "inverse", "p", "());"],
  ["p", "  return change.", "f", "run", "p", "();"],
  ["p", "}"],
];
const WINDOWS = {
  browser: {
    title: "Release notes · Lens Browser", app: "Lens Browser", icon: "lens-browser",
    body: `<div class="w-tabs"><span class="on">Release notes</span><span>Lens Apps</span><span>Docs</span></div>
      <div class="w-url"><span class="lock"></span>lens.dev/release-notes</div>
      <article class="w-page"><b class="h">Lens 0.9: the everything desktop</b>
        <p>Nine dock styles, 80 themes and a helper that asks before it acts. Every change undoes.</p>
        <div class="w-hero"></div>
        <ul><li>Super search lives inside the dock</li><li>Animated backdrops for every pack</li><li>Open-source apps in one click</li></ul>
        <p class="w-mail">Questions? <span class="pii">maya.chen@example.com</span></p></article>`,
  },
  code: {
    title: "dock.ts — lens-ui — VSCodium", app: "VSCodium", icon: "vscodium",
    body: `<div class="w-code"><nav><b>LENS-UI</b><span>src</span><span class="on">dock.ts</span><span>themes.ts</span><span>search.ts</span><span>README.md</span></nav>
      <pre>${CODE.map((l, i) => `<i>${i + 1}</i>${l.reduce((a, t, j) => (j % 2 ? a + `<span class="t-${l[j - 1]}">${esc(t)}</span>` : a), "")}`).join("\n")}</pre></div>`,
  },
  notes: {
    title: "Launch plan — Obsidian", app: "Obsidian", icon: "obsidian",
    body: `<div class="w-notes"><b class="h">Launch plan</b><label><input type="checkbox" checked tabindex="-1"> Record the dock tour</label><label><input type="checkbox" checked tabindex="-1"> Ship 80 themes</label><label><input type="checkbox" tabindex="-1"> Write the FAQ</label><label><input type="checkbox" tabindex="-1"> Ask Maya about the icons</label><p>Friday 10:00 · demo with the team</p></div>`,
  },
  music: {
    title: "Now Playing", app: "Music", icon: "spotify", widget: true,
    body: `<div class="w-music"><div class="art"></div><div class="meta-m"><strong>Midnight Drive</strong><span>Neon Coast</span><div class="bar"><i></i></div><div class="ctl"><b>⏮</b><b class="pp">⏸</b><b>⏭</b></div></div></div>`,
  },
  files: {
    title: "Downloads — File Explorer", app: "File Explorer", icon: "explorer",
    body: `<div class="w-files">${[["Launch plan.md", "doc"], ["dock-tour.webm", "vid"], ["Nord Frost.lenstheme", "thm"], ["krita-5.3.exe", "exe"], ["photos", "dir"], ["invoice-0412.pdf", "pdf"]].map(([n, k]) => `<span class="fi ${k}"><i></i>${esc(n)}</span>`).join("")}</div>`,
  },
  chat: {
    title: "#design — Discord", app: "Discord", icon: "discord",
    body: `<div class="w-chat"><p><b>Maya</b> the islands dock looks great on Nord</p><p><b>Sam</b> can we try dot matrix for the demo?</p><p><b>Maya</b> shipping the tour Friday</p></div>`,
  },
};
// Window positions, in % of the area between the top bar and the dock.
const LAYOUTS = {
  hero: { browser: [3, 5, 47, 80], code: [30, 13, 48, 80], music: [80, 56, 19, 34] },
  themes: { browser: [3, 6, 52, 80], notes: [42, 18, 36, 66], music: [74, 58, 24, 34] },
  ai: { browser: [4, 6, 48, 80], code: [30, 14, 50, 78], chat: [72, 8, 25, 50], notes: [58, 30, 34, 58] },
  apps: { files: [2, 10, 34, 56] },
};

// ---- notifications that pop in ------------------------------------------------------------------
const NOTES = [
  { icon: "discord", app: "Discord", title: "Maya", body: "The new dock looks great on Nord." },
  { icon: "lens-settings", app: "Lens", title: "Theme schedule", body: "Switching to Alabaster Daylight at sunrise." },
  { icon: "spotify", app: "Now Playing", title: "Midnight Drive", body: "Neon Coast" },
  { icon: "lens-apps", app: "Lens Apps", title: "Krita 5.3 is ready", body: "Official release, checked. Install when you like." },
  { icon: "obsidian", app: "Obsidian", title: "Reminder", body: "Demo with the team, Friday 10:00." },
];

/**
 * createDesk(host, { layout, dock: [ids] | null, backdrop: "css" | Element | null })
 * Returns an API the exhibits and the tour drive.
 */
export function createDesk(host, { layout = "hero", dock = null, backdrop = "css", label = "Demo desktop" } = {}) {
  const el = document.createElement("div");
  el.className = "desk";
  el.setAttribute("aria-label", label);
  el.setAttribute("role", "group");
  const L = LAYOUTS[layout];
  el.innerHTML = `${backdrop === "css" ? `<div class="desk-bg" aria-hidden="true"><i></i><i></i><i></i></div>` : ""}
    <div class="desk-top" aria-hidden="true"><img src="${icon("lens-browser")}" alt="" width="14" height="14"><b class="app-n">VSCodium</b><span>File</span><span>Edit</span><span>View</span><span class="sp"></span><span class="mode">◐</span><span class="wifi"></span><span class="bat"></span><span class="clock"></span></div>
    <div class="desk-area" aria-hidden="true">${Object.entries(L).map(([id, [l, t, w, h]], i) => win(id, l, t, w, h, i)).join("")}</div>
    <div class="desk-notes" aria-hidden="true"></div>
    ${dock ? `<div class="desk-dock">${dock.map((id) => `<button type="button" class="dk" data-app="${id}" aria-label="${esc(nameOf(id))}"><img src="${icon(id)}" alt="" width="34" height="34" loading="lazy"><span class="run"></span></button>`).join("")}</div>` : ""}`;
  host.append(el);
  if (backdrop && backdrop !== "css") el.prepend(backdrop);
  const area = el.querySelector(".desk-area");
  const notes = el.querySelector(".desk-notes");
  const clock = el.querySelector(".clock");
  const appLabel = el.querySelector(".desk-top .app-n");
  const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
  tick();
  setInterval(tick, 30000);
  let z = 10, home = structuredClone(L);
  // On small screens the windows keep a laptop-sized layout and the whole area scales down, like a
  // screenshot, instead of squeezing their content.
  const MIN_W = 760;
  const fitArea = () => {
    area.style.cssText = "";
    const W = area.clientWidth, H = area.clientHeight, k = Math.min(1, W / MIN_W);
    if (k < 1) Object.assign(area.style, { right: "auto", bottom: "auto", width: `${W / k}px`, height: `${H / k}px`, transform: `scale(${k})`, transformOrigin: "0 0" });
  };
  new ResizeObserver(fitArea).observe(el);

  function win(id, l, t, w, h, i) {
    const d = WINDOWS[id];
    return `<div class="dw ${d.widget ? "widget" : ""}" data-win="${id}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%;z-index:${i + 1}">
      ${d.widget ? "" : `<div class="dw-bar"><img src="${icon(d.icon)}" alt="" width="14" height="14"><span>${esc(d.title)}</span><i></i><i></i><i></i></div>`}
      <div class="dw-body">${d.body}</div></div>`;
  }
  function nameOf(id) { return Object.values(WINDOWS).find((w) => w.icon === id)?.app ?? { "lens-apps": "Lens Apps", "lens-settings": "Lens Settings", "lens-command": "Lens Command", terminal: "Terminal", krita: "Krita", steam: "Steam", figma: "Figma" }[id] ?? id; }
  const W = (id) => area.querySelector(`[data-win="${id}"]`);
  const running = () => { el.querySelectorAll(".dk").forEach((b) => b.classList.toggle("on", [...area.querySelectorAll(".dw:not(.min)")].some((w) => WINDOWS[w.dataset.win].icon === b.dataset.app))); };
  running();

  function focus(id) {
    const w = W(id);
    if (!w) return null;
    w.classList.remove("min");
    w.style.zIndex = String(++z);
    area.querySelectorAll(".dw").forEach((x) => x.classList.toggle("active", x === w));
    if (!WINDOWS[id].widget) appLabel.textContent = WINDOWS[id].app;
    running();
    return w;
  }
  /** Moves a window. The move animates with a transform (FLIP), so nothing else on the page reflows. */
  function place(id, [l, t, w, h]) {
    const x = W(id);
    if (!x) return;
    const a = x.getBoundingClientRect();
    Object.assign(x.style, { left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` });
    if (reducedMotion() || !x.animate || !a.width) return;
    const b = x.getBoundingClientRect();
    if (Math.abs(a.left - b.left) + Math.abs(a.top - b.top) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height) < 1) return;
    x.animate([{ transformOrigin: "0 0", transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})` }, { transformOrigin: "0 0", transform: "none" }], { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  /** Opens a window that isn't in this layout (it fades in where `at` says). */
  function open(id, at = [20, 10, 50, 70]) {
    if (!W(id)) { area.insertAdjacentHTML("beforeend", win(id, ...at, 0)); }
    return focus(id);
  }
  function tile(slot, id) {
    const target = id ?? area.querySelector(".dw.active:not(.widget)")?.dataset.win ?? area.querySelector(".dw:not(.widget)")?.dataset.win;
    const others = [...area.querySelectorAll(".dw:not(.widget):not(.min)")].map((x) => x.dataset.win).filter((x) => x !== target);
    const left = slot !== "right";
    place(target, [left ? 1 : 50.5, 2, 48.5, 94]);
    others.forEach((o, i) => place(o, [left ? 50.5 : 1, 2 + i * (94 / others.length), 48.5, 94 / others.length - 1.5]));
    focus(target);
    return target;
  }
  function minimize(id) { const w = W(id); if (w) { w.classList.add("min"); running(); } }
  function reset() {
    area.querySelectorAll(".dw").forEach((x) => { if (!home[x.dataset.win]) x.remove(); else x.classList.remove("min"); });
    for (const [id, p] of Object.entries(home)) place(id, p);
    Object.keys(home).forEach((id, i) => { const x = W(id); if (x) x.style.zIndex = String(i + 1); });
    area.querySelectorAll(".dw").forEach((x) => x.classList.remove("active"));
    const top = Object.keys(home).filter((k) => !WINDOWS[k].widget).at(-1);
    if (top) focus(top);
  }
  reset();

  function setPack(p, accent) {
    const light = p.scheme === "light", s = el.style;
    s.setProperty("--m-base", p.base ?? (light ? "#f4f4f5" : "#09090b"));
    s.setProperty("--m-accent", accent ?? p.accent ?? "#fafafa");
    s.setProperty("--m-radius", `${Math.max(4, Math.min(16, p.radius ?? 8))}px`);
    el.dataset.scheme = light ? "light" : "dark";
  }

  // Notifications: one every few seconds while the desk is on screen (one static card with reduced motion).
  let ni = 0, nTimer = 0, visible = false;
  function notify(n) {
    const c = document.createElement("div");
    c.className = "dn";
    c.innerHTML = `<img src="${icon(n.icon)}" alt="" width="26" height="26"><div><span class="meta-n">${esc(n.app)} · now</span><strong>${esc(n.title)}</strong><span>${esc(n.body)}</span></div>`;
    notes.prepend(c);
    while (notes.children.length > 2) notes.lastChild.remove();
    if (!reducedMotion()) { setTimeout(() => c.classList.add("out"), 4600); setTimeout(() => c.remove(), 5100); }
    return c;
  }
  const loop = () => {
    clearTimeout(nTimer);
    if (!visible || document.hidden || el.dataset.quiet) return;
    if (reducedMotion()) { if (!notes.children.length) notify(NOTES[0]); return; }
    notify(NOTES[ni++ % NOTES.length]);
    nTimer = setTimeout(loop, 7000 + Math.random() * 3000);
  };
  new IntersectionObserver(([e]) => { const was = visible; visible = e.isIntersecting; el.classList.toggle("paused", !visible); if (visible && !was) nTimer = setTimeout(loop, 1800); if (!visible) clearTimeout(nTimer); }).observe(el);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && visible) nTimer = setTimeout(loop, 1500); else clearTimeout(nTimer); });

  // The light dock: click focuses (or minimises) that app's window, with a bounce.
  el.querySelector(".desk-dock")?.addEventListener("click", (e) => {
    const b = e.target.closest(".dk");
    if (!b) return;
    bounce(b.dataset.app);
    const id = Object.keys(WINDOWS).find((k) => WINDOWS[k].icon === b.dataset.app);
    if (!id) return;
    const w = W(id);
    if (w && w.classList.contains("active") && !w.classList.contains("min")) minimize(id); else open(id);
  });
  function bounce(app) {
    const b = el.querySelector(`.dk[data-app="${app}"]`);
    if (!b || reducedMotion()) return b;
    b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce");
    return b;
  }
  function addToDock(id, src) {
    const d = el.querySelector(".desk-dock");
    if (!d || d.querySelector(`[data-app="${id}"]`)) return d?.querySelector(`[data-app="${id}"]`);
    d.insertAdjacentHTML("beforeend", `<button type="button" class="dk new" data-app="${id}" aria-label="${esc(id)}"><img src="${src}" alt="" width="34" height="34"><span class="run"></span></button>`);
    return d.lastElementChild;
  }

  return { el, area, win: W, focus, open, tile, minimize, reset, setPack, notify, bounce, addToDock, setQuiet: (q) => { if (q) el.dataset.quiet = "1"; else { delete el.dataset.quiet; loop(); } }, icon };
}

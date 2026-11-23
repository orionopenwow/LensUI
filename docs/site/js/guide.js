// The Lens Guide on the website: the floating Lens orb (bottom right, or press /) opens into a Lens
// glass window with a chat thread. Answers come from the same offline search Lens uses
// (src/guide/search.ts → live/guide/search.js) over the Guide index and this site's pages: no
// network, no model, no keys. When a question is about something on the page, the Guide does it:
// the orb flies to the target, the page scrolls there, and the step list ticks off as Lens works,
// using the site's one action engine (js/actions.js) and scene engine (js/scenes.js).
import { reducedMotion } from "./site.js";

const SITE = new URL("../", import.meta.url);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const CHIPS = ["Show me the docks", "Make it dark", "Tile two windows", "Show me the magic right-click", "How do I connect Claude?", "What's open source here?", "How do I install?", "Take the tour"];
const HOME = new URL("index.html", SITE).href;
const onHome = () => !!window.lensSite?.desk;
let search, launcher, win, thread, input, lastFocus, busy = null;

async function load() {
  if (search) return;
  const [{ GuideSearch }, idx] = await Promise.all([import(new URL("live/guide/search.js", SITE).href), fetch(new URL("data/guide-index.json", SITE)).then((r) => r.json())]);
  search = new GuideSearch(idx);
}


function build() {
  win = document.createElement("section");
  win.className = "gw";
  win.id = "guide-window";
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-modal", "true");
  win.setAttribute("aria-labelledby", "gw-title");
  win.hidden = true;
  win.innerHTML = `<header class="gw-bar"><span class="gw-orb" aria-hidden="true"><span class="lens-cloud" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span></span><strong id="gw-title">Lens</strong><span class="gw-sub">offline · on this page</span>
      <button type="button" data-max aria-label="Expand the Guide"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg></button>
      <button type="button" data-close aria-label="Collapse the Guide"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg></button></header>
    <div class="gw-thread" aria-live="polite"></div>
    <div class="gw-chips">${CHIPS.map((c) => `<button type="button" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    <form class="gw-in"><label class="sr" for="gw-q">Ask Lens</label><input id="gw-q" type="text" placeholder="Ask Lens how to do anything…" autocomplete="off"><button type="submit" aria-label="Ask">↵</button></form>
    <i class="gw-rz" aria-hidden="true"></i>`;
  document.body.append(win);
  thread = win.querySelector(".gw-thread");
  input = win.querySelector("input");
  win.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ""; ask(v); } });
  win.querySelector(".gw-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-chip]"); if (b) ask(b.dataset.chip); });
  win.querySelector("[data-close]").addEventListener("click", () => close());
  win.querySelector("[data-max]").addEventListener("click", () => win.classList.toggle("is-max"));
  win.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); if (busy) stopAgent("Stopped. Nothing else will run."); else close(); }
    if (e.key === "Tab") {
      const f = [...win.querySelectorAll("button, input, a[href]")].filter((x) => x.offsetParent !== null);
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });
  // Drag by the header, resize from the corner.
  const barEl = win.querySelector(".gw-bar");
  let d = null;
  barEl.addEventListener("pointerdown", (e) => { if (e.target.closest("button") || matchMedia("(max-width: 640px)").matches) return; const r = win.getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId }; barEl.setPointerCapture(e.pointerId); });
  barEl.addEventListener("pointermove", (e) => { if (!d || d.id !== e.pointerId) return; win.style.left = `${Math.max(8, Math.min(innerWidth - 120, e.clientX - d.x))}px`; win.style.top = `${Math.max(8, Math.min(innerHeight - 60, e.clientY - d.y))}px`; win.style.right = "auto"; win.style.bottom = "auto"; });
  barEl.addEventListener("pointerup", () => { d = null; });
  const rz = win.querySelector(".gw-rz");
  let r0 = null;
  rz.addEventListener("pointerdown", (e) => { const r = win.getBoundingClientRect(); r0 = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, id: e.pointerId }; rz.setPointerCapture(e.pointerId); });
  rz.addEventListener("pointermove", (e) => { if (!r0 || r0.id !== e.pointerId) return; win.style.width = `${Math.max(320, r0.w + e.clientX - r0.x)}px`; win.style.height = `${Math.max(380, r0.h + e.clientY - r0.y)}px`; });
  rz.addEventListener("pointerup", () => { r0 = null; });
  // Any click on the page while the agent works stops it.
  addEventListener("pointerdown", (e) => { if (busy && e.isTrusted && !win.contains(e.target)) stopAgent("You took over. Nothing else will run."); }, true);
  restore();
}

// ---- open / close: the window opens out of the orb ---------------------------------------------
function orbClip() {
  const o = launcher?.querySelector(".orb-logo")?.getBoundingClientRect(), w = win.getBoundingClientRect();
  if (!o || !w.width) return null;
  const cx = o.left + o.width / 2 - w.left, cy = o.top + o.height / 2 - w.top, r0 = o.width / 2;
  const r1 = Math.hypot(Math.max(cx, w.width - cx), Math.max(cy, w.height - cy));
  return { from: `circle(${r0}px at ${cx}px ${cy}px)`, to: `circle(${r1}px at ${cx}px ${cy}px)` };
}
export async function open(q) {
  if (!win) build();
  if (!win.hidden) { if (q) ask(q); return; }
  lastFocus = document.activeElement;
  win.hidden = false;
  launcher?.setAttribute("aria-expanded", "true");
  launcher?.classList.add("is-open");
  sessionStorage.setItem("lens-guide-open", "1");
  // The window grows out of the orb itself: a circle centred on the orb opens into the window.
  // Nothing scales or flips; the orb stays put underneath.
  const grow = orbClip();
  if (grow && !reducedMotion() && win.animate) {
    win.animate([{ clipPath: grow.from }, { clipPath: grow.to }], { duration: 420, easing: "cubic-bezier(.2,.9,.25,1)" });
  } else if (win.animate) win.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  input.focus({ preventScroll: true });
  if (!thread.children.length) say("lens", `Hi, I'm Lens. Ask me how to do anything, or tap a suggestion: I'll show you right here on the page.`);
  load().catch(() => {});
  if (q) ask(q);
}
export const isOpen = () => !!win && !win.hidden;
export function close() {
  if (!win || win.hidden) return;
  stopAgent();
  const done = () => { win.hidden = true; launcher?.classList.remove("is-open"); };
  launcher?.setAttribute("aria-expanded", "false");
  sessionStorage.setItem("lens-guide-open", "0");
  const grow = orbClip();
  if (grow && !reducedMotion() && win.animate) win.animate([{ clipPath: grow.to }, { clipPath: grow.from }], { duration: 300, easing: "cubic-bezier(.5,0,.75,0)" }).finished.then(done, done)
  else done();
  (lastFocus && document.contains(lastFocus) ? lastFocus : launcher)?.focus?.({ preventScroll: true });
}
const save = () => sessionStorage.setItem("lens-guide-thread", thread.innerHTML.slice(-40000));
function restore() { const t = sessionStorage.getItem("lens-guide-thread"); if (t) thread.innerHTML = t; }

// ---- the thread ---------------------------------------------------------------------------------
function say(who, html, { stream = false } = {}) {
  const m = document.createElement("div");
  m.className = `gm ${who}`;
  thread.append(m);
  if (!stream || reducedMotion()) { m.innerHTML = html; thread.scrollTop = 1e6; save(); return Promise.resolve(m); }
  // Streaming-style reveal: words appear in order (the markup stays intact).
  m.innerHTML = html;
  const words = [];
  const walk = (n) => { for (const c of [...n.childNodes]) { if (c.nodeType === 3) { const parts = c.textContent.split(/(\s+)/); const frag = document.createDocumentFragment(); for (const p of parts) { const s = document.createElement("span"); s.textContent = p; s.className = "w"; frag.append(s); words.push(s); } c.replaceWith(frag); } else walk(c); } };
  walk(m);
  return new Promise((res) => {
    let i = 0;
    const step = () => { for (let k = 0; k < 3 && i < words.length; k++) words[i++].classList.add("on"); thread.scrollTop = 1e6; if (i < words.length) setTimeout(step, 28); else { m.querySelectorAll(".w").forEach((w) => w.replaceWith(w.textContent)); m.normalize(); save(); res(m); } };
    step();
  });
}
function typingDots() { const d = document.createElement("div"); d.className = "gm lens typing"; d.innerHTML = "<i></i><i></i><i></i>"; d.setAttribute("aria-label", "Lens is typing"); thread.append(d); thread.scrollTop = 1e6; return d; }
function steps(list) {
  const el = document.createElement("ol");
  el.className = "gm lens steps";
  el.innerHTML = `<li class="hd">Lens is doing…</li>${list.map((s) => `<li>${esc(s)}</li>`).join("")}`;
  thread.append(el); thread.scrollTop = 1e6;
  return { tick(i, st) { const li = el.children[i + 1]; if (li) li.className = st; }, end(note) { el.querySelector(".hd").textContent = note ?? "Done"; el.classList.add("finished"); save(); } };
}
function stopAgent(note) {
  if (!busy) return;
  busy.stop();
  busy = null;
  if (note) say("lens", esc(note));
}

/** Flies a copy of the orb from the Guide window to an element on the page, and rings it. */
async function flyTo(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  await new Promise((r) => setTimeout(r, reducedMotion() ? 50 : 520));
  const from = win.querySelector(".gw-orb").getBoundingClientRect(), to = el.getBoundingClientRect();
  if (!reducedMotion()) {
    const o = document.createElement("span");
    o.className = "fly-orb";
    document.body.append(o);
    const a = o.animate([{ transform: `translate(${from.left}px, ${from.top}px)` }, { transform: `translate(${(from.left + to.left) / 2}px, ${Math.min(from.top, to.top) - 80}px)`, offset: 0.5 }, { transform: `translate(${to.left + to.width / 2 - 14}px, ${to.top + Math.min(40, to.height / 2) - 14}px)` }], { duration: 700, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" });
    await a.finished.catch(() => {});
    setTimeout(() => o.remove(), 400);
  }
  el.classList.remove("guide-ring"); void el.offsetWidth; el.classList.add("guide-ring");
  setTimeout(() => el.classList.remove("guide-ring"), 2200);
}

// ---- answers -------------------------------------------------------------------------------------
const goHome = (hash) => { location.href = `${HOME}${hash}`; };
async function ask(q) {
  if (busy) stopAgent();
  say("you", esc(q));
  const t = typingDots();
  const ql = q.toLowerCase();
  await new Promise((r) => setTimeout(r, reducedMotion() ? 50 : 420));
  t.remove();
  const L = window.lensSite;

  if (/\btour\b/.test(ql)) {
    if (!onHome()) return goHome("#tour/desktop");
    await say("lens", "Pick a tour under the desk. Each one goes one step at a time: press Next, or do the highlighted thing yourself. I'll start with the desktop.", { stream: true });
    await flyTo(document.getElementById("sc-tabs"));
    L.playScene("desktop");
    return;
  }
  // A scene by name ("show me the magic right-click", "how do I connect Claude?").
  const SC = (await import("./scenes.js")).SCENES;
  const sceneHit = SC.find((s) => ql.includes(s.id.replace(/-/g, " ")) || ql.includes(s.title.toLowerCase())) ?? (/\bclaude|agent|mcp\b/.test(ql) ? SC.find((s) => s.id === "claude") : /right.?click/.test(ql) ? SC.find((s) => s.id === "magic-right-click") : null);
  if (/\bdocks?\b/.test(ql) && !/\bdark|tile\b/.test(ql)) {
    if (!onHome()) return goHome("#docks");
    await say("lens", "Lens has nine dock styles. These are the real docks, live. I'll put Islands on the desk.", { stream: true });
    const st = steps(["Scroll to the dock styles", "Pick Islands", "Apply it to the desk"]);
    st.tick(0, "doing");
    const rail = document.getElementById("dock-rail");
    await flyTo(rail);
    st.tick(0, "done"); st.tick(1, "doing");
    const tile = [...rail.querySelectorAll(".dr")].find((b) => /Islands/.test(b.textContent));
    await flyTo(tile);
    st.tick(1, "done"); st.tick(2, "doing");
    tile?.click();
    st.tick(2, "done"); st.end("Done · try another dock in the row");
    return;
  }
  if (sceneHit && /\b(show|how|play|see|connect)\b/.test(ql)) {
    if (!onHome()) return goHome(`#scene/${sceneHit.id}`); // home maps #scene/… to the nearest tour
    await say("lens", `${esc(sceneHit.line)} I've opened that tour on the desk: press Next to go step by step.`, { stream: true });
    await flyTo(document.getElementById("stage"));
    L.playScene(sceneHit.id);
    if (sceneHit.id === "claude") say("lens", `To connect for real: in Lens, Settings › AI › Claude, then add Lens to Claude Desktop's MCP config (<a href="${new URL("docs/", SITE)}">docs</a>). Every risky action still asks you first.`);
    return;
  }
  if (onHome()) {
    const A = await import("./actions.js");
    const desk = L.desk;
    const plan = await A.plan(q, desk);
    if (plan.length) {
      await say("lens", `On it. I'll do it on the desk; press Esc or click anywhere to stop me.`, { stream: true });
      L.scenes.pause();
      await flyTo(document.getElementById("stage"));
      const st = steps(plan.map((s) => s.say));
      const o = A.orbFor(desk);
      busy = { stop: () => o.stop() };
      try { await A.run(desk, plan, { onStep: (i, _s, state) => st.tick(i, state) }); st.end("Done · every change undoes"); } catch { st.end("Stopped"); }
      busy = null;
      return;
    }
  }
  if (/\bopen.?source\b/.test(ql)) {
    await say("lens", `Lens itself is open source (MIT), and Lens Apps installs free and open-source tools like ArtCraft, Concat, Krita and Blender from their official releases.`, { stream: true });
    if (onHome()) await flyTo(document.getElementById("apps"));
    return;
  }
  if (/\binstall|download|get lens\b/.test(ql)) {
    await say("lens", `Lens runs on Windows 10 and 11. It's in beta: build it from source today (a few minutes), and signed installers arrive on GitHub Releases. macOS and Linux are on the roadmap. <a href="${new URL("download.html", SITE)}">Download page</a>`, { stream: true });
    return;
  }
  // Everything else: the Guide index.
  try { await load(); } catch { return say("lens", `The Guide index didn't load. The <a href="${new URL("docs/", SITE)}">user guide</a> has the same answers.`); }
  const hits = search.search(q, { limit: 3 });
  if (!hits.length || hits[0].score < 1.2) return say("lens", `I couldn't find that in Lens's settings or docs. Try other words, or browse the <a href="${new URL("docs/", SITE)}">user guide</a>.`, { stream: true });
  const e = hits[0].entry;
  const where = (e.path || []).join(" › ");
  const text = (e.text || "").replace(/\s+/g, " ");
  const short = text.length > 260 ? `${text.slice(0, text.lastIndexOf(" ", 260))}…` : text;
  await say("lens", `<b>${esc(e.title)}</b>${where ? ` <span class="where">${esc(where)}</span>` : ""}<br>${esc(short || "Here's where it lives in Lens.")}${e.doc ? ` <a href="${new URL(e.doc, SITE)}">Read more</a>` : ""}${hits[1] ? `<span class="also">Also: ${hits.slice(1).map((h) => esc(h.entry.title)).join(" · ")}</span>` : ""}`, { stream: true });
}

launcher = document.getElementById("guide-orb");

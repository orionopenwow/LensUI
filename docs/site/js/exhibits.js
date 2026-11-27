// The home page's exhibits: each one is a real Lens surface (a frame from live/app/, the same
// components the app ships) shown at its true size and scaled to fit, loaded when it comes near the
// screen. Each plays three steps slowly, on repeat (see loop): it holds while pointed at or focused, has
// a Pause button, and stays still with reduced motion. The magic right-click exhibit lays the real magic
// window over a real Lens Browser; the visitor can right-click the page instead.
import { reducedMotion, isLight } from "./site.js";
import { appUrl, createDesk, getPacks } from "./desk.js";

const preset = () => (isLight() ? "alabaster-daylight" : "obsidian");
const near = (el, f, margin = "400px") => new IntersectionObserver(([e], ob) => { if (e.isIntersecting) { ob.disconnect(); f(el); } }, { rootMargin: margin }).observe(el);

/** A stage holds frames at design size (data-w × data-h) and scales them to its width. */
function stage(el) {
  const W = +el.dataset.w, H = +el.dataset.h;
  const inner = document.createElement("div");
  inner.className = "xstage-in";
  inner.style.width = `${W}px`; inner.style.height = `${H}px`;
  inner.append(...el.childNodes);
  el.append(inner);
  const fit = () => { const k = el.clientWidth / W; inner.style.transform = `scale(${k})`; el.style.height = `${Math.round(H * k)}px`; el._k = k; };
  new ResizeObserver(fit).observe(el);
  fit();
  return { W, H, inner };
}
/** Mounts the real surface in a holder. Returns the frame. */
function mount(holder, src = holder.dataset.xf) {
  let f = holder.querySelector("iframe");
  if (!f) {
    f = document.createElement("iframe");
    f.title = holder.getAttribute("aria-label") ?? "Lens (live)";
    f.tabIndex = holder.getAttribute("aria-hidden") === "true" ? -1 : 0;
    holder.append(f);
  }
  if (holder._src !== src) { holder._src = src; holder.classList.remove("is-ready"); f.src = appUrl(src, preset()); }
  return f;
}
const frames = new Map(); // contentWindow → holder
addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.lens !== "win") return;
  const holder = [...document.querySelectorAll(".xf")].find((h) => h.querySelector("iframe")?.contentWindow === e.source);
  if (!holder) return;
  if (e.data.a === "ready") { holder.classList.add("is-ready"); holder.dispatchEvent(new CustomEvent("xf-ready")); }
  else holder.dispatchEvent(new CustomEvent("xf-msg", { detail: e.data }));
});
void frames;

/**
 * The calm loop under an exhibit: three steps, each held ~5 s, on repeat. It waits until the exhibit is
 * on screen, holds while the pointer or focus is inside, and stops on Pause (or for good once the visitor
 * takes over, e.g. by right-clicking). With reduced motion it shows step one, still.
 */
export const STEP_MS = 5200;
function loop(ex, n, onStep, caps = [], labels = [], ms = STEP_MS) {
  const cap = ex.querySelector(".xcap-t") ?? ex.querySelector(".xcap"), dots = [...ex.querySelectorAll(".xdots i")], pause = ex.querySelector("[data-xpause]");
  const capK = ex.querySelector(".xcap-k"), capL = ex.querySelector(".xcap-l"), strip = ex.querySelector(".xcap");
  let i = 0, timer = 0, seen = false, held = false, paused = false, taken = false;
  const show = (k) => {
    i = (k + n) % n;
    dots.forEach((d, j) => d.classList.toggle("on", j === i));
    if (cap && caps[i] != null) {
      const put = () => { cap.textContent = caps[i]; if (capK) capK.textContent = `${i + 1} of ${n}`; if (capL && labels[i] != null) capL.textContent = labels[i]; };
      if (reducedMotion()) put();
      else { strip.classList.add("is-fade"); setTimeout(() => { put(); strip.classList.remove("is-fade"); }, 260); }
    }
    onStep(i);
  };
  // While a desk window is being dragged (html.is-calm) the loop waits, so the drag gets the frames.
  const run = () => { clearTimeout(timer); if (seen && !held && !paused && !taken && !reducedMotion()) timer = setTimeout(() => { if (!document.documentElement.classList.contains("is-calm")) show(i + 1); run(); }, ms); };
  const hold = (on) => { held = on; run(); };
  ex.addEventListener("pointerenter", () => hold(true));
  ex.addEventListener("pointerleave", () => hold(false));
  ex.addEventListener("focusin", () => hold(true));
  ex.addEventListener("focusout", (e) => { if (!ex.contains(e.relatedTarget)) hold(false); });
  pause?.addEventListener("click", () => {
    paused = !paused; taken = false;
    pause.setAttribute("aria-pressed", String(paused));
    const sr = pause.querySelector(".sr"); if (sr) sr.textContent = sr.textContent.replace(/^(Pause|Play)/, paused ? "Play" : "Pause");
    run();
  });
  // The first step starts when the exhibit is first on screen (not merely near), so nothing off screen
  // loads windows or plays while the visitor is busy elsewhere on the page.
  let started = false;
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen && !started) { started = true; show(0); } run(); }, { threshold: 0.35 }).observe(ex);
  return ex._xloop = { show: (k) => { started = true; show(k); run(); }, take: () => { taken = true; clearTimeout(timer); }, get index() { return i; }, get playing() { return seen && !held && !paused && !taken && !reducedMotion(); } };
}
const data = (ex) => { try { return JSON.parse(ex.querySelector(".xdata")?.textContent ?? "[]"); } catch { return []; } };

// ---- Magic Mouse: hold for Magic at the pointer; hold, then drag, to grab an area ---------------------
// The page is the real Lens Browser and the window is the real Magic window (src/magic); the pointer is
// the Lens cloud, with a ring that fills while the button is held (the hold time, ~400 ms in Lens).
function magic(ex) {
  const st = stage(ex.querySelector(".xstage"));
  const target = ex.querySelector(".mx-target"), menu = ex.querySelector(".mx-menu"), menuHolder = menu.querySelector(".xf");
  const dim = ex.querySelector(".mx-dim"), ptr = ex.querySelector(".mm-ptr"), grab = ex.querySelector(".mm-grab");
  const spotlight = (x, y) => { dim.style.setProperty("--x", `${Math.round(x)}px`); dim.style.setProperty("--y", `${Math.round(y)}px`); dim.hidden = false; };
  const place = (x, y) => { const mx = Math.max(8, Math.min(x, st.W - 368)), my = Math.max(8, Math.min(y, st.H - 448)); menu.style.transform = `translate3d(${mx}px, ${my}px, 0)`; };
  let gen = 0;
  const wait = (ms, g) => new Promise((r) => setTimeout(() => r(g === gen), reducedMotion() ? 0 : ms));
  const moveTo = (x, y, ms = 700) => { ptr.style.transition = reducedMotion() ? "none" : `transform ${ms}ms var(--lens-ease-out)`; ptr.style.transform = `translate3d(${x}px, ${y}px, 0)`; };
  const hold = (on) => ptr.classList.toggle("is-held", on);
  const openMenu = (scene, x, y, extra = "") => {
    mount(menuHolder, `magic.html?scene=${scene}&drag=0&magic=0${extra}`);
    place(x + 6, y + 6);
    menu.hidden = false;
    if (!reducedMotion()) menu.animate([{ opacity: 0, transform: `${menu.style.transform} scale(.96)` }, { opacity: 1, transform: menu.style.transform }], { duration: 180, easing: "cubic-bezier(.22,1,.36,1)" });
  };
  const box = (a, b) => { const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]); Object.assign(grab.style, { transform: `translate3d(${x}px, ${y}px, 0)`, width: `${Math.abs(a[0] - b[0])}px`, height: `${Math.abs(a[1] - b[1])}px` }); };
  const A = [300, 150], B = [720, 420], LINK = [470, 150];
  // The real Snip studio sits in its own frame over the page, shown when the grab lands (both stay
  // loaded, so the loop never reloads a frame).
  const snipH = Object.assign(document.createElement("div"), { className: "xf mx-target mx-snip" });
  Object.assign(snipH.dataset, { xf: "snip.html?scene=studio", marker: ".snip-root" });
  snipH.setAttribute("role", "img"); snipH.setAttribute("aria-label", "Lens Snip, the real app, with the grabbed area and its actions");
  snipH.hidden = true;
  target.after(snipH);
  mount(target);
  async function step(id) {
    const g = ++gen;
    menu.hidden = true; dim.hidden = true; hold(false); grab.hidden = true; grab.classList.remove("is-done"); ptr.hidden = false;
    snipH.hidden = id !== "grab";
    if (id === "grab") mount(snipH);
    if (id === "hold") {
      moveTo(LINK[0] - 160, LINK[1] + 140, 0); if (!(await wait(60, g))) return;
      moveTo(...LINK); if (!(await wait(800, g))) return;
      hold(true); if (!(await wait(650, g))) return;
      hold(false); spotlight(...LINK); openMenu("link", ...LINK);
    } else if (id === "drag") {
      moveTo(A[0] - 60, A[1] - 40, 0); if (!(await wait(60, g))) return;
      moveTo(...A); if (!(await wait(700, g))) return;
      hold(true); if (!(await wait(650, g))) return;
      grab.hidden = false; box(A, A);
      if (reducedMotion()) { box(A, B); moveTo(...B, 0); return; }
      const t0 = performance.now(), D = 1400;
      const tick = (t) => { if (g !== gen) return; const k = Math.min(1, (t - t0) / D), e = 1 - (1 - k) ** 3; const p = [A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e]; box(A, p); ptr.style.transition = "none"; ptr.style.transform = `translate3d(${p[0]}px, ${p[1]}px, 0)`; if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    } else {
      // Let go: the grabbed area opens in the real Snip studio, with its actions.
      ptr.hidden = true;
    }
  }
  const st3 = data(ex);
  loop(ex, st3.length || 3, (k) => step(st3[k]?.[0] ?? "hold"), st3.map((x) => x[2]), st3.map((x) => x[1]), 6400);
}

// ---- agentic desktop: a spoken command, then the Lens cursor works a real desk on its own ------------------
// The desk is the real one (js/desk.js: real dock, top bar and windows); the cursor is the real "Lens at
// work" presence (src/presence, live/app/presence.html) and the voice card is the real VoiceHud
// (live/app/voice.html). Each step moves the cursor to a real element and does what it shows: the dock
// icon really opens Lens Browser, the page really changes. The risky step shows the real approval card.
function agent(ex) {
  ex.querySelectorAll(".ag-card .xstage").forEach((x) => stage(x));
  const host = ex.querySelector("#agent-desk"), card = ex.querySelector(".ag-card"), cardH = card.querySelector(".xf");
  const plan = [...ex.querySelectorAll(".ag-plan li")];
  const desk = createDesk(host, { label: "Agentic desktop demo", layout: [], ratio: 0.5625, mobileRatio: 1, hint: false, minDesktop: 600, designW: 1200 });
  getPacks().then((ps) => desk.setPack(ps.find((p) => p.id === (isLight() ? "alabaster-daylight" : "obsidian"))));
  // The cursor and the voice card float over the whole desk, in desk px.
  // A layer's messages wait until its real surface has mounted (it says so with {lens:"win", a:"ready"}).
  const layer = (src, title) => {
    const f = document.createElement("iframe"); f.className = "ag-layer"; f.title = title; f.tabIndex = -1; f.setAttribute("aria-hidden", "true");
    f._q = []; f._ready = false;
    addEventListener("message", (e) => { if (e.source === f.contentWindow && e.data?.lens === "win" && e.data.a === "ready" && !f._ready) { f._ready = true; f._q.splice(0).forEach((m) => f.contentWindow.postMessage(m, location.origin)); } });
    f._src = appUrl(src, preset()); desk.canvas.append(f); return f;
  };
  // The layers load with the first step (when the exhibit is on screen), not when it comes near.
  const wake = () => { for (const f of [cursor, voice]) if (!f.src) f.src = f._src; };
  const cursor = layer("presence.html", "The Lens cursor (live)"), voice = layer("voice.html", "Lens voice (live)");
  const post = (f, m) => { if (!f._ready) { if (m.lens === "clear") f._q.length = 0; else f._q.push(m); return; } try { f.contentWindow?.postMessage(m, location.origin); } catch { /* gone */ } };
  const mark = (done, now) => plan.forEach((li, k) => { li.classList.toggle("is-done", done.includes(k)); li.classList.toggle("is-now", now.includes(k)); });
  let at = [desk.W * 0.5, desk.H * 0.45], gen = 0;
  const wait = (ms, g) => new Promise((r) => setTimeout(() => r(g === gen), reducedMotion() ? 0 : ms));
  /** Sends the Lens cursor to a desk rect with a step caption; returns when it has had time to arrive. */
  const go = (rect, kind, label, text, index) => { post(cursor, { lens: "go", from: at, target: rect, kind, label, text, actor: "Lens", index, total: 5 }); at = [rect.x + rect.w / 2, rect.y + rect.h / 2]; };
  const inWin = (app, sel) => { const w = desk.byApp(app), el = desk.doc(app)?.querySelector(sel); if (!w || !el) return null; const r = el.getBoundingClientRect(); return { x: w.x + r.left, y: w.y + r.top, w: r.width, h: r.height }; };
  const ready = (app, g) => new Promise((res) => { const t0 = Date.now(); const chk = () => { if (g !== gen) return res(false); const w = desk.byApp(app); if (w?.ready || Date.now() - t0 > 6000) return res(true); setTimeout(chk, 120); }; chk(); });
  const clickDock = (name) => { try { [...desk.frame.contentDocument.querySelectorAll(".dock-item[aria-label]")].find((b) => b.getAttribute("aria-label").startsWith(name))?.click(); } catch { /* not ready */ } };
  async function step(k) {
    const g = ++gen;
    wake();
    card.hidden = true;
    if (k === 0) {
      for (const w of [...desk.wins.values()]) desk.close(w.id);
      post(cursor, { lens: "clear" });
      mark([], [0]);
      post(voice, { lens: "say", text: "Lens, book Friday dinner for four near me" });
      if (!(await wait(3800, g))) return;
      post(voice, { lens: "clear" });
      const d = desk.dockIconAt("browser") ?? { x: desk.W / 2, y: desk.H - 40 };
      mark([0], [1]);
      go({ x: d.x - 22, y: d.y - 22, w: 44, h: 44 }, "click", "Open Lens Browser", null, 2);
      if (!(await wait(1300, g))) return;
      clickDock("Lens Browser");
      if (!desk.byApp("browser")) desk.open("browser", [0.18, 0.02]);
    } else if (k === 1) {
      if (!desk.byApp("browser")) desk.open("browser", [0.18, 0.02]);
      const w = desk.byApp("browser"); if (w) desk.setRect(w, { x: desk.W * 0.12, y: desk.TOP + 10, w: desk.W * 0.76, h: desk.H - desk.TOP - 130 }, { animate: false });
      desk.scene("browser", "browser.html?scene=home");
      if (!(await ready("browser", g))) return;
      mark([0, 1], [2]);
      const box = inWin("browser", ".lb-newtab-search") ?? { x: desk.W * 0.4, y: desk.H * 0.3, w: 300, h: 40 };
      go(box, "type", "Type the search", "dinner for 4 near me, Friday 8 pm", 3);
      if (!(await wait(2400, g))) return;
      desk.scene("browser", "browser.html?scene=dinner-plan");
      mark([0, 1, 2], [3]);
    } else {
      if (!desk.byApp("browser")) desk.open("browser", [0.12, 0.02]);
      desk.scene("browser", "browser.html?scene=dinner");
      mark([0, 1, 2, 3], [4]);
      const w = desk.byApp("browser");
      go(w ? { x: w.x + w.w * 0.62, y: w.y + w.h * 0.62, w: 120, h: 36 } : { x: desk.W * 0.6, y: desk.H * 0.6, w: 120, h: 36 }, "click", "Book: asks first", null, 5);
      if (!(await wait(1500, g))) return;
      mount(cardH);
      card.hidden = false;
      if (!reducedMotion()) card.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" });
    }
  }
  const st3 = data(ex);
  loop(ex, st3.length || 3, (k) => step(k), st3.map((x) => x[2]), st3.map((x) => x[1]), 7600);
  window.lensSite = { ...(window.lensSite ?? {}), agentDesk: desk };
}

// ---- Lens Browser: the real BrowserSurface, three of its states --------------------------------------
function browser(ex) {
  stage(ex.querySelector(".xstage"));
  const holder = ex.querySelector(".xf");
  const st3 = data(ex);
  loop(ex, st3.length || 3, (k) => mount(holder, `browser.html?scene=${st3[k]?.[0] ?? "home"}`), st3.map((x) => x[2]), st3.map((x) => x[1]));
}

const KINDS = { magic, agent, browser };
export function init() {
  document.querySelectorAll("[data-exhibit]").forEach((ex) => near(ex, () => KINDS[ex.dataset.exhibit]?.(ex)));
  // The site's own light/dark switch re-themes the exhibits.
  new MutationObserver(() => document.querySelectorAll(".xf iframe").forEach((f) => { const h = f.parentElement; const src = h._src; if (src) { h._src = null; mount(h, src); } })).observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme"] });

  // Core apps: all nine at once; a highlight moves through them until the visitor points at one.
  document.querySelectorAll("[data-cycle]").forEach((grid) => {
    const items = [...grid.children];
    let i = -1, timer = 0, seen = false, held = false;
    const mark = (n) => { i = n; items.forEach((el, k) => el.classList.toggle("is-on", k === i)); };
    const run = () => { clearInterval(timer); if (seen && !held && !reducedMotion()) timer = setInterval(() => mark((i + 1) % items.length), 2600); };
    grid.addEventListener("pointerenter", () => { held = true; clearInterval(timer); mark(-1); });
    grid.addEventListener("pointerleave", () => { held = false; run(); });
    grid.addEventListener("focusin", () => { held = true; clearInterval(timer); mark(-1); });
    grid.addEventListener("focusout", () => { held = false; run(); });
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen && i < 0 && !held && !reducedMotion()) mark(0); run(); }, { threshold: 0.3 }).observe(grid);
  });
}

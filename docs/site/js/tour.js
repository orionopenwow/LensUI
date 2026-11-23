// "▶ Take the tour": about 75 seconds through Lens on the hero stage, driven by the Lens orb with a
// caption per step. Skip, pause and step with ←/→; the dots jump to any step; click anywhere on the
// desktop (or into the dock) to take over. With reduced motion it is a slideshow: each step shows its
// end state and you move on with Next. Loaded on demand by js/stage.js. Nothing touches your system.
import { reducedMotion } from "./site.js";

const SITE = new URL("../", import.meta.url);
const REPO = "https://github.com/orionopenwow/LensUI";
const icon = (id) => new URL(id.includes("/") ? id : `media/icons/${id}.svg`, SITE).href;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
class Stop extends Error {}

export function createTour(api) {
  const { stage, screen, desk } = api;
  const layer = document.createElement("div");
  layer.className = "tour";
  layer.hidden = true;
  layer.innerHTML = `<div class="tour-scene" aria-hidden="true"></div>
    <div class="lens-orb" aria-hidden="true"><span></span></div>
    <div class="lens-typing" aria-hidden="true"></div>
    <div class="tour-bar" role="region" aria-label="Lens tour">
      <p class="tour-cap" aria-live="polite"></p>
      <div class="tour-row"><div class="tour-dots" role="group" aria-label="Tour steps"></div>
        <div class="tour-btns"><button type="button" data-prev aria-label="Previous step">←</button><button type="button" data-pause aria-label="Pause">❚❚</button><button type="button" data-next aria-label="Next step">→</button><button type="button" data-skip>Skip tour <kbd>Esc</kbd></button></div></div>
    </div>`;
  screen.append(layer);
  const scene = layer.querySelector(".tour-scene");
  const orb = layer.querySelector(".lens-orb");
  const typing = layer.querySelector(".lens-typing");
  const cap = layer.querySelector(".tour-cap");
  const dots = layer.querySelector(".tour-dots");
  const pauseBtn = layer.querySelector("[data-pause]");

  let selfFocus = false, idx = 0, token = 0, paused = false, active = false, slideshow = false, enteredFs = false, saved = null, pos = null;

  // ---- timing and the orb --------------------------------------------------------------------
  async function wait(ms, t) {
    if (slideshow) ms = Math.min(ms, 40);
    const end = performance.now() + ms;
    for (;;) {
      if (t !== token) throw new Stop();
      if (paused) { await new Promise((r) => setTimeout(r, 80)); continue; }
      const left = end - performance.now();
      if (left <= 0) return;
      await new Promise((r) => setTimeout(r, Math.min(80, left)));
    }
  }
  const local = (el) => {
    const s = screen.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, r };
  };
  const place = (p) => { orb.style.transform = `translate3d(${p.x - 13}px, ${p.y - 13}px, 0)`; };
  function glide(to, t) {
    if (slideshow) { pos = to; place(to); return Promise.resolve(); }
    orb.classList.add("on");
    const from = pos ?? { x: screen.clientWidth / 2, y: screen.clientHeight + 20 };
    const d = Math.hypot(to.x - from.x, to.y - from.y), dur = Math.min(850, 300 + d * 0.8), lift = Math.min(60, d * 0.18);
    return new Promise((res, rej) => {
      let t0 = performance.now(), pausedAt = 0;
      const step = (now) => {
        if (t !== token) return rej(new Stop());
        if (paused) { pausedAt ||= now; return requestAnimationFrame(step); }
        if (pausedAt) { t0 += now - pausedAt; pausedAt = 0; }
        const k = Math.min(1, (now - t0) / dur), e = ease(k);
        place({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * e) * lift });
        if (k < 1) requestAnimationFrame(step); else { pos = to; res(); }
      };
      requestAnimationFrame(step);
    });
  }
  /** Moves the orb to an element (in the page or in the dock frame) or a point. */
  async function to(target, t) {
    if (!target) return;
    let p;
    if (target.x != null) p = target;
    else if (target.ownerDocument !== document) {
      const fr = api.frame.getBoundingClientRect(), s = screen.getBoundingClientRect(), r = target.getBoundingClientRect();
      const k = fr.width / (api.frame.offsetWidth || fr.width);
      p = { x: fr.left - s.left + (r.left + r.width / 2) * k, y: fr.top - s.top + (r.top + r.height / 2) * k };
    } else p = local(target);
    await glide(p, t);
    return p;
  }
  function ripple(p) {
    if (slideshow || !p) return;
    const r = document.createElement("span");
    r.className = "lens-ripple";
    r.style.transform = `translate3d(${p.x - 20}px, ${p.y - 20}px, 0)`;
    layer.append(r);
    setTimeout(() => r.remove(), 700);
  }
  async function click(target, t) { const p = await to(target, t); ripple(p); await wait(220, t); return p; }
  async function type(text, near, t) {
    const p = near.x != null ? near : local(near);
    typing.style.transform = `translate3d(${Math.max(8, Math.min(screen.clientWidth - 240, p.x - 110))}px, ${Math.max(30, p.y - 50)}px, 0)`;
    typing.textContent = "";
    typing.classList.add("on");
    if (slideshow) typing.textContent = text;
    else for (const ch of text) { typing.textContent += ch; await wait(32 + Math.random() * 36, t); }
    await wait(500, t);
    typing.classList.remove("on");
  }
  const add = (html, cls) => { const d = document.createElement("div"); d.className = `ts ${cls}`; d.innerHTML = html; scene.append(d); return d; };
  const fd = () => api.frameDoc();
  const inFrame = (sel) => fd()?.querySelector(sel);

  // ---- the steps ---------------------------------------------------------------------------------
  const STEPS = [
    { cap: "One dock, nine styles. Hover to magnify.", async run(t) {
      const pill = inFrame(".dock-pill");
      await to(pill ?? { x: screen.clientWidth / 2, y: screen.clientHeight - 40 }, t);
      if (pill && !slideshow) {
        const r = pill.getBoundingClientRect(), y = r.top + r.height / 2;
        for (let k = 0; k <= 1.0001; k += 0.04) { pill.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: r.left + 30 + (r.width - 60) * k, clientY: y })); await wait(45, t); }
        pill.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
      }
      for (const s of ["islands", "taskbar", "floating"]) { api.setStyle(s, true); cap.dataset.sub = s; await wait(1100, t); }
    } },
    { cap: "Super search lives inside the dock.", async run(t) {
      await click(inFrame(".dock-search-mag-btn") ?? { x: 120, y: screen.clientHeight - 40 }, t);
      // Typed without moving focus into the dock, so ←/→ and Esc keep working.
      selfFocus = true;
      api.search(true, "kri", { focus: false });
      await wait(400, t);
      if (document.activeElement === api.frame) layer.querySelector("[data-next]").focus({ preventScroll: true });
      selfFocus = false;
      await wait(2400, t);
    }, after: () => api.search(false) },
    { cap: "Every theme restyles everything, on a moving backdrop.", async run(t) {
      for (const id of ["nord-frost", "catppuccin-mocha", "hyprland-neon"]) { api.applyPack(id, { quiet: true, fromUser: true }); await wait(1400, t); }
    } },
    { cap: "Lens AI helper: “Lens, tile left and go dark.”", async run(t) {
      const bar = desk.win("browser")?.querySelector(".dw-bar");
      await type("Lens, tile left and go dark", bar ?? { x: 200, y: 80 }, t);
      await click(bar, t);
      desk.tile("left", "browser");
      await wait(700, t);
      api.applyPack("obsidian", { quiet: true, fromUser: true });
      desk.notify({ icon: "lens-command", app: "Lens", title: "Tiled left · dark mode on", body: "Two steps, both undoable." });
      await wait(1400, t);
    } },
    { cap: "Voice dock: hold a key and talk. Recognised on your PC.", async run(t) {
      const v = add(`<span class="mic"></span><span class="wave"><i></i><i></i><i></i><i></i><i></i></span><span class="said"></span>`, "t-voice");
      const said = v.querySelector(".said");
      for (const w of "Lens, minimise this".split(" ")) { said.textContent += (said.textContent ? " " : "") + w; await wait(380, t); }
      await wait(400, t);
      desk.minimize(desk.area.querySelector(".dw.active")?.dataset.win ?? "code");
      v.classList.add("done");
      said.textContent = "Minimised VSCodium";
      await wait(1500, t);
    } },
    { cap: "Magic right-click: one menu for anything you point at.", async run(t) {
      const w = desk.focus("browser"), p = w?.querySelector(".w-page p");
      const at = p ? local(p) : { x: 220, y: 160, r: null };
      await click({ x: at.x, y: at.y }, t);
      const m = add(`<b>Release notes · paragraph</b><span class="hi">Summarise</span><span>Translate</span><span>Keep on the Shelf</span><span>Send to Claude</span>`, "t-menu");
      m.style.left = `${Math.min(at.x, screen.clientWidth - 200)}px`; m.style.top = `${Math.min(at.y, screen.clientHeight - 200)}px`;
      await wait(900, t);
      await click(m.querySelector(".hi"), t);
      m.innerHTML = `<b>Summary</b><p>Lens 0.9 brings nine dock styles, 80 themes and a helper that asks before it acts. Every change undoes.</p>`;
      m.classList.add("card");
      await wait(2000, t);
    } },
    { cap: "The Shelf collects anything, then hands it on as one context pack.", async run(t) {
      const s = add(`<b>Shelf</b><div class="it"><img src="${icon("lens-browser")}" alt="">Release notes · page</div><div class="it"><img src="${icon("obsidian")}" alt="">“Every change undoes” · selection</div><div class="it"><img src="${icon("explorer")}" alt="">dock-tour.webm · file</div><span class="go">Send as a context pack</span>`, "t-shelf");
      await wait(1200, t);
      const go = s.querySelector(".go");
      await click(go, t);
      go.textContent = "Pack ready · 3 items · sent to Claude";
      go.classList.add("ok");
      await wait(1600, t);
    } },
    { cap: "Snip, with private details blurred before you save.", async run(t) {
      const w = desk.focus("browser");
      if (!w) return;
      const s = screen.getBoundingClientRect(), r = w.getBoundingClientRect(), pii = w.querySelector(".pii")?.getBoundingClientRect();
      const box = add(`<span class="tools">Save · Copy · Send to Claude</span>`, "t-snip");
      Object.assign(box.style, { left: `${r.left - s.left - 4}px`, top: `${r.top - s.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
      await wait(900, t);
      if (pii) {
        const red = add(`<span>E-mail · blurred</span>`, "t-redact");
        Object.assign(red.style, { left: `${pii.left - s.left - 3}px`, top: `${pii.top - s.top - 2}px`, width: `${pii.width + 6}px`, height: `${pii.height + 4}px` });
        await click(red, t);
      }
      await wait(1800, t);
    } },
    { cap: "The browser agent fills the form, then stops for your OK.", async run(t) {
      desk.focus("browser");
      const c = add(`<div class="ah"><span>Needs your OK</span><span class="meta"><span class="dot warn"></span>booking.example</span></div><p class="q">Book a table for 4 on Friday?</p><p class="why">Lens filled the form. It clicks only the outlined button, and only after you hold.</p><div class="btns"><span class="b">Deny <kbd>Esc</kbd></span><span class="b pri"><i></i>Book · hold</span></div>`, "t-approve approval");
      await wait(900, t);
      const ok = c.querySelector(".pri");
      await to(ok, t);
      ok.classList.add("holding");
      await wait(1000, t);
      c.querySelector(".why").textContent = "Approved. Clicked the outlined button, and nothing else.";
      ok.textContent = "Booked";
      await wait(1500, t);
    } },
    { cap: "Music: Now Playing in the dock, with synced lyrics.", async run(t) {
      const m = add(`<div class="art"></div><div><b>Midnight Drive</b><span>Neon Coast</span><ol><li>City lights fold into the rain</li><li>We keep the windows down again</li><li>Every turn a little brighter</li></ol></div>`, "t-music");
      const lines = [...m.querySelectorAll("li")];
      for (const l of lines) { lines.forEach((x) => x.classList.toggle("on", x === l)); await wait(1100, t); }
    } },
    { cap: "Lens Apps: free and open-source apps in one click.", async run(t) {
      const a = add(`<div class="dw-bar"><img src="${icon("lens-apps")}" alt=""><span>Lens Apps</span></div><div class="row"><img src="${icon("media/apps/krita-icon.webp")}" alt=""><div><b>Krita</b><span>Professional painting · GPL-3.0</span></div><span class="get">Get</span></div><div class="row"><img src="${icon("media/apps/blender-icon.svg")}" alt=""><div><b>Blender</b><span>3D creation suite · GPL-2.0+</span></div><span class="get">Get</span></div>`, "t-apps");
      const get = a.querySelector(".get");
      await click(get, t);
      for (const s of ["Finding package", "Downloading 40%", "Downloading 100%", "Verifying", "Installing", "Open"]) { get.textContent = s; await wait(380, t); }
      get.classList.add("done");
      desk.notify({ icon: "media/apps/krita-icon.webp", app: "Lens Apps", title: "Krita is installed", body: "Official release, checked." });
      await wait(1200, t);
    } },
    { cap: "The Guide: ask “how do I…”, and it shows you.", async run(t) {
      const g = add(`<b>Guide</b><p class="q">How do I change the accent colour?</p><p>Settings › Appearance › Accent</p><span class="go">Show me</span>`, "t-guide");
      await wait(1000, t);
      await click(g.querySelector(".go"), t);
      const s = add(`<b>Appearance</b><div class="r">Theme <span>Obsidian</span></div><div class="r ring">Accent <span class="sw"><i></i><i></i><i></i><i></i></span></div><div class="r">Roundness <span>8 px</span></div>`, "t-settings small");
      await to(s.querySelector(".ring"), t);
      await wait(1800, t);
    } },
    { cap: "One Settings hub for Lens and Windows.", async run(t) {
      const s = add(`<b>Settings</b><div class="srch"></div><div class="res"></div>`, "t-settings");
      const q = s.querySelector(".srch"), res = s.querySelector(".res");
      await to(q, t);
      for (const ch of "night light") { q.textContent += ch; await wait(60, t); }
      res.innerHTML = [["Night light", "Windows · Display"], ["Theme schedule", "Lens · Appearance"], ["Dim inactive windows", "Lens · Windows"]].map(([a, b]) => `<div class="r">${a}<span>${b}</span></div>`).join("");
      await wait(2000, t);
    } },
    { cap: "That's Lens: the everything desktop.", end: true, async run(t) {
      const e = add(`<img src="${new URL("brand/lens-128.png", SITE)}" alt="" width="64" height="64"><h3>The everything desktop.</h3><p>Open source · off until you turn it on · every change undoes</p><div class="btns"><a class="btn primary" href="${new URL("download.html", SITE)}">Download</a><a class="btn" href="${REPO}">View on GitHub</a><button class="btn" type="button" data-replay>Replay</button></div>`, "t-end");
      e.querySelector("[data-replay]").addEventListener("click", () => go(0));
      orb.classList.remove("on");
      await wait(400, t);
    } },
  ];
  dots.innerHTML = STEPS.map((s, i) => `<button type="button" data-i="${i}" aria-label="Step ${i + 1}: ${s.cap.replace(/"/g, "&quot;")}"></button>`).join("");

  // ---- running it --------------------------------------------------------------------------------
  function clean() {
    selfFocus = false;
    scene.replaceChildren();
    layer.querySelectorAll(".lens-ripple").forEach((r) => r.remove());
    typing.classList.remove("on");
    STEPS.forEach((s) => s.after && api.drawerOpen && s.after());
    if (api.drawerOpen) api.search(false);
    desk.reset();
    const pill = inFrame(".dock-pill");
    pill?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
  }
  async function go(i) {
    if (!active) return;
    idx = Math.max(0, Math.min(STEPS.length - 1, i));
    const t = ++token;
    clean();
    const s = STEPS[idx];
    cap.textContent = s.cap;
    layer.querySelector(".tour-bar").classList.toggle("is-end", !!s.end);
    pauseBtn.hidden = slideshow || !!s.end;
    dots.querySelectorAll("button").forEach((b, k) => { b.classList.toggle("seen", k < idx); if (k === idx) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
    try {
      await s.run(t);
      if (s.end || slideshow) return;
      await wait(1300, t);
      s.after?.();
      go(idx + 1);
    } catch (e) { if (!(e instanceof Stop)) throw e; }
  }
  function setPaused(p) {
    paused = p;
    pauseBtn.textContent = p ? "▶" : "❚❚";
    pauseBtn.setAttribute("aria-label", p ? "Resume" : "Pause");
    layer.classList.toggle("paused", p);
    if (p && !slideshow) cap.dataset.note = "Paused · you're driving"; else delete cap.dataset.note;
  }
  async function start({ fullscreen = false } = {}) {
    if (active) return go(0);
    active = true;
    slideshow = reducedMotion();
    saved = { pack: stage.querySelector("select[data-theme]").value, style: stage.querySelector("select[data-style]").value };
    if (fullscreen && !api.isFull()) { enteredFs = true; await api.enterFs(); }
    layer.hidden = false;
    hookFrame();
    stage.classList.add("touring");
    desk.setQuiet(true);
    pos = null;
    setPaused(false);
    pauseBtn.hidden = slideshow;
    layer.querySelector("[data-next]").focus({ preventScroll: true });
    if (!api.isFull()) stage.scrollIntoView({ behavior: slideshow ? "auto" : "smooth", block: "center" });
    go(0);
  }
  function stop() {
    if (!active) return;
    token++;
    active = false;
    clean();
    layer.hidden = true;
    orb.classList.remove("on");
    stage.classList.remove("touring");
    desk.setQuiet(false);
    if (saved) { api.applyPack(saved.pack, { quiet: true }); api.setStyle(saved.style, true); }
    if (enteredFs) { enteredFs = false; api.exitFs(); }
    stage.querySelector("[data-tour]:not(.fs-bar [data-tour])")?.focus({ preventScroll: true });
  }

  layer.querySelector("[data-prev]").addEventListener("click", () => { setPaused(false); go(idx - 1); });
  layer.querySelector("[data-next]").addEventListener("click", () => { setPaused(false); go(idx + 1); });
  layer.querySelector("[data-skip]").addEventListener("click", stop);
  pauseBtn.addEventListener("click", () => setPaused(!paused));
  dots.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { setPaused(false); go(+b.dataset.i); } });
  // Take over: a click on the desktop pauses, and so does focus moving into the dock frame.
  screen.addEventListener("pointerdown", (e) => { if (active && !slideshow && !e.target.closest(".tour-bar, .t-end")) setPaused(true); });
  addEventListener("blur", () => setTimeout(() => { if (active && !slideshow && !selfFocus && document.activeElement === api.frame) setPaused(true); }, 0));
  const onKey = (e) => {
    if (!active) return;
    const inFrameDoc = e.view && e.view !== window;
    if (!inFrameDoc && /input|textarea|select/i.test(document.activeElement?.tagName ?? "")) return;
    if (e.key === "Escape") { e.preventDefault(); stop(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setPaused(false); go(idx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setPaused(false); go(idx - 1); }
    else if (e.key === " " && !slideshow && !inFrameDoc && !e.target.closest?.("button, a")) { e.preventDefault(); setPaused(!paused); }
  };
  addEventListener("keydown", onKey);
  // The dock frame can hold focus (search types into it): the tour's keys work from there too.
  let hooked = null;
  const hookFrame = () => { const d = fd(); if (d && d !== hooked) { d.addEventListener("keydown", onKey, true); hooked = d; } };

  return { start, stop, running: () => active, get step() { return idx; }, steps: STEPS.length };
}

// "Lens at work" on the stage: a small orb of the logo's nebula that shows what Lens is doing.
// It glides to each target, clicks with a ripple, types visibly in a mono chip and says what it is
// doing in a caption chip ("Lens · Turning on dark mode"). When another app drives Lens the caption
// names it ("Claude Desktop is controlling Lens · Stop"). Esc or Stop ends the run.
// Reduced motion: no travel or typing animation, only a highlight ring on the target and the caption.
// No library: CSS transforms, driven by requestAnimationFrame only while a run is in progress.
import { reducedMotion } from "./site.js";

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function createPresence(stage) {
  const layer = document.createElement("div");
  layer.className = "presence";
  layer.innerHTML = `<div class="lens-orb" aria-hidden="true"><span></span></div>
    <div class="lens-typing" aria-hidden="true"></div>
    <div class="lens-caption" role="status" aria-live="polite" hidden><span class="who"></span><button type="button" class="stop">Stop<kbd>Esc</kbd></button></div>`;
  stage.append(layer);
  const orb = layer.querySelector(".lens-orb");
  const typing = layer.querySelector(".lens-typing");
  const caption = layer.querySelector(".lens-caption");
  const who = caption.querySelector(".who");
  const stopBtn = caption.querySelector(".stop");
  let pos = null, runId = 0, busy = false;

  const local = (el) => {
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, r };
  };
  const place = (p) => { orb.style.transform = `translate3d(${p.x - 13}px, ${p.y - 13}px, 0)`; };
  const wait = (ms, id) => new Promise((res, rej) => setTimeout(() => (id === runId ? res() : rej(new Error("stopped"))), ms));
  const check = (id) => { if (id !== runId) throw new Error("stopped"); };

  function glide(to, id) {
    const from = pos ?? { x: to.x, y: stage.clientHeight + 20 };
    const d = Math.hypot(to.x - from.x, to.y - from.y), dur = Math.min(900, 320 + d * 0.9);
    // a gentle arc: the midpoint lifts a little, so the orb floats instead of sliding
    const lift = Math.min(60, d * 0.18);
    return new Promise((res, rej) => {
      const t0 = performance.now();
      const step = (now) => {
        if (id !== runId) return rej(new Error("stopped"));
        const k = Math.min(1, (now - t0) / dur), e = ease(k);
        place({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * e) * lift });
        if (k < 1) requestAnimationFrame(step); else { pos = to; res(); }
      };
      requestAnimationFrame(step);
    });
  }
  function ripple(p) {
    const r = document.createElement("span");
    r.className = "lens-ripple";
    r.style.transform = `translate3d(${p.x - 20}px, ${p.y - 20}px, 0)`;
    layer.append(r);
    setTimeout(() => r.remove(), 700);
  }
  function ring(el) {
    const { r } = local(el), s = stage.getBoundingClientRect();
    const g = document.createElement("span");
    g.className = "lens-ring";
    Object.assign(g.style, { left: `${r.left - s.left - 4}px`, top: `${r.top - s.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    layer.append(g);
    setTimeout(() => g.remove(), 1400);
  }
  async function type(text, near, id) {
    const p = local(near);
    typing.style.transform = `translate3d(${Math.max(8, Math.min(stage.clientWidth - 220, p.r.left - stage.getBoundingClientRect().left))}px, ${p.y - 46}px, 0)`;
    typing.textContent = "";
    typing.classList.add("on");
    if (reducedMotion()) { typing.textContent = text; await wait(700, id); }
    else for (const ch of text) { typing.textContent += ch; await wait(34 + Math.random() * 40, id); }
    await wait(260, id);
    typing.classList.remove("on");
  }
  const say = (text, driver) => {
    caption.hidden = false;
    who.innerHTML = driver ? `<strong>${esc(driver)}</strong> is controlling Lens · ${esc(text)}` : `<strong>Lens</strong> · ${esc(text)}`;
  };

  function stop() {
    if (!busy) return;
    runId++;
    end(true);
  }
  function end(stopped = false) {
    busy = false;
    stopBtn.hidden = true;
    stage.classList.remove("lens-working");
    typing.classList.remove("on");
    orb.classList.remove("on");
    if (stopped) { who.innerHTML = "<strong>Stopped.</strong> Nothing else will run."; }
    setTimeout(() => { if (!busy) { caption.hidden = true; pos = null; } }, stopped ? 1600 : 900);
  }
  stopBtn.addEventListener("click", stop);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && busy) stop(); });

  /**
   * Runs a script. Each step: { say, prep?: () => void, target: () => Element, type?: string, act: () => void, pause? }.
   * `driver` names an outside app driving Lens (e.g. "Claude Desktop").
   */
  async function run(steps, { driver = "" } = {}) {
    const id = ++runId;
    busy = true;
    stopBtn.hidden = false;
    stage.classList.add("lens-working");
    const still = reducedMotion();
    if (!still) orb.classList.add("on");
    try {
      for (const s of steps) {
        check(id);
        say(s.say, driver);
        await s.prep?.();
        const el = s.target?.();
        if (el) {
          const p = local(el);
          if (still) ring(el);
          else { await glide(p, id); }
          if (s.type) await type(s.type, el, id);
          if (!still) ripple(p);
        }
        check(id);
        await s.act?.();
        await wait(s.pause ?? (still ? 900 : 650), id);
      }
      say("Done", driver);
      await wait(700, id);
      end();
    } catch { /* stopped */ }
  }
  return { run, stop, get busy() { return busy; } };
}

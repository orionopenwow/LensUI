// The one action engine on the site. Lens Command, the Lens Guide, the scene reel and the narrated
// tour all turn requests into steps here, and the Lens orb performs them on a desk (js/desk.js):
// it flies to each target, clicks with a ripple, types visibly, and narrates. Risky steps show the
// product's "Needs your OK" card first. Any click or key from the visitor stops a run.
import { reducedMotion } from "./site.js";
import { iconUrl, getPacks, APPS } from "./desk.js";

const SITE = new URL("../", import.meta.url);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export class Stopped extends Error {}

// ---- the orb, one per desk ------------------------------------------------------------------------
const orbs = new WeakMap();
export function orbFor(desk) {
  if (orbs.has(desk)) return orbs.get(desk);
  const cv = desk.canvas;
  const layer = document.createElement("div");
  layer.className = "lx-agent";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `<div class="lx-orb"><span></span></div><div class="lx-typing"></div>`;
  cv.append(layer);
  const orb = layer.querySelector(".lx-orb"), typing = layer.querySelector(".lx-typing");
  let pos = null, token = 0, paused = false;
  const o = {
    get token() { return token; },
    stop() { token++; paused = false; orb.classList.remove("on"); typing.classList.remove("on"); },
    begin() { token++; paused = false; return token; },
    pause(p) { paused = p; },
    get paused() { return paused; },
    async wait(ms, t) {
      if (reducedMotion()) ms = Math.min(ms, 400);
      const end = performance.now() + ms;
      for (;;) {
        if (t !== token) throw new Stopped();
        if (paused) { await new Promise((r) => setTimeout(r, 90)); continue; }
        const left = end - performance.now();
        if (left <= 0) return;
        await new Promise((r) => setTimeout(r, Math.min(90, left)));
      }
    },
    /** Desk-px centre of an element inside the desk (or inside the dock frame), or a point. */
    at(target) {
      if (!target) return null;
      if (target.x != null) return target;
      const r = target.getBoundingClientRect(), c = cv.getBoundingClientRect(), k = desk.k;
      if (target.ownerDocument !== document) { const fr = desk.frame; return { x: fr.offsetLeft + r.left + r.width / 2, y: fr.offsetTop + r.top + r.height / 2 }; }
      return { x: (r.left - c.left + r.width / 2) / k, y: (r.top - c.top + r.height / 2) / k };
    },
    place(p) { orb.style.transform = `translate3d(${p.x - 14}px, ${p.y - 14}px, 0)`; pos = p; },
    async to(target, t) {
      const p = o.at(target);
      if (!p) return null;
      if (reducedMotion()) { o.place(p); orb.classList.add("on"); return p; }
      orb.classList.add("on");
      const from = pos ?? { x: desk.W / 2, y: desk.H + 30 };
      const d = Math.hypot(p.x - from.x, p.y - from.y), dur = Math.min(900, 320 + d * 0.7), lift = Math.min(70, d * 0.16);
      await new Promise((res, rej) => {
        let t0 = performance.now(), pausedAt = 0;
        const step = (now) => {
          if (t !== token) return rej(new Stopped());
          if (paused) { pausedAt ||= now; return requestAnimationFrame(step); }
          if (pausedAt) { t0 += now - pausedAt; pausedAt = 0; }
          const k = Math.min(1, (now - t0) / dur), e = ease(k);
          o.place({ x: from.x + (p.x - from.x) * e, y: from.y + (p.y - from.y) * e - Math.sin(Math.PI * e) * lift });
          if (k < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });
      return p;
    },
    ripple(p) {
      if (!p || reducedMotion()) return;
      const r = document.createElement("span");
      r.className = "lx-ripple";
      r.style.transform = `translate3d(${p.x - 22}px, ${p.y - 22}px, 0)`;
      layer.append(r);
      setTimeout(() => r.remove(), 650);
    },
    async click(target, t) { const p = await o.to(target, t); o.ripple(p); await o.wait(200, t); return p; },
    async type(text, near, t) {
      const p = o.at(near) ?? { x: desk.W / 2, y: desk.H / 2 };
      typing.style.transform = `translate3d(${Math.max(8, Math.min(desk.W - 280, p.x - 120))}px, ${Math.max(40, p.y - 56)}px, 0)`;
      typing.textContent = "";
      typing.classList.add("on");
      if (reducedMotion()) typing.textContent = text;
      else for (const ch of text) { typing.textContent += ch; await o.wait(28 + Math.random() * 30, t); }
      await o.wait(450, t);
      typing.classList.remove("on");
    },
    /** Drags a window along a path like a person would, showing the snap preview, then drops it. */
    async drag(w, to, t, { slot } = {}) {
      const bar = w.el.querySelector(".lw-bar");
      const grab = { x: w.x + Math.min(120, w.w / 3), y: w.y + 15 };
      await o.to(grab, t);
      const sx = w.x, sy = w.y, dur = reducedMotion() ? 0 : 900;
      const t0 = performance.now();
      while (true) {
        if (t !== token) throw new Stopped();
        const k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1, e = ease(k);
        const px = grab.x + (to.x - grab.x) * e, py = grab.y + (to.y - grab.y) * e;
        w.x = sx + (px - grab.x); w.y = Math.max(desk.TOP, sy + (py - grab.y));
        w.el.style.transform = `translate3d(${w.x}px, ${w.y}px, 0) rotate(${(Math.sin(e * Math.PI) * 1.6).toFixed(2)}deg)`;
        o.place({ x: px, y: py });
        desk.showSnap(slot && k > 0.7 ? slot : null);
        if (k >= 1) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
      desk.showSnap(null);
      if (slot) desk.snap(w.id, slot); else w.el.style.transform = `translate3d(${w.x}px, ${w.y}px, 0)`;
      void bar;
      await o.wait(300, t);
    },
    hide() { orb.classList.remove("on"); },
    layer,
  };
  orbs.set(desk, o);
  return o;
}

// ---- "Needs your OK" -------------------------------------------------------------------------------
export function approve(desk, { source = "Lens", title, why, verb = "Allow", deny = "Deny", auto = null }) {
  return new Promise((res) => {
    const c = document.createElement("div");
    c.className = "lx-approve";
    c.setAttribute("role", "dialog");
    c.setAttribute("aria-label", "Needs your OK");
    c.innerHTML = `<div class="ah"><span>Needs your OK</span><span class="src"><i></i>${esc(source)}</span></div><p class="q">${esc(title)}</p>${why ? `<p class="why">${esc(why)}</p>` : ""}<div class="btns"><button type="button" data-no>${esc(deny)} <kbd>Esc</kbd></button><button type="button" class="pri" data-yes><span class="fill"></span><span>${esc(verb)}</span></button></div>`;
    desk.canvas.append(c);
    const done = (ok) => { c.remove(); res(ok); };
    c.querySelector("[data-yes]").addEventListener("click", () => done(true));
    c.querySelector("[data-no]").addEventListener("click", () => done(false));
    c.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } });
    if (auto) auto(c, done); else c.querySelector("[data-yes]").focus({ preventScroll: true });
  });
}

// ---- requests → steps --------------------------------------------------------------------------------
const NAMES = { browser: ["browser", "lens browser", "web"], files: ["files", "file explorer", "explorer", "downloads"], notes: ["notes", "note", "launch plan"], music: ["music", "player", "song", "spotify"], monitor: ["monitor", "system", "cpu"], timer: ["timer"], cleaner: ["cleaner", "free up space", "disk space", "storage"], terminal: ["terminal", "shell"], code: ["code", "vscodium", "editor"], chat: ["discord", "chat", "messages"], store: ["apps", "lens apps", "store", "app store"], settings: ["settings", "preferences"] };
const appIn = (c) => { let best = null; for (const [id, ns] of Object.entries(NAMES)) for (const n of ns) if (new RegExp(`\\b${n}\\b`).test(c) && (!best || n.length > best[1].length)) best = [id, n]; return best?.[0] ?? null; };
const STYLES = ["floating", "slim", "taskbar", "studio", "minimal", "split", "islands"];

/** Plans a request as steps for the orb. Returns [] when it isn't a desk request. */
export async function plan(text, desk) {
  const packs = await getPacks();
  const parts = text.toLowerCase().replace(/^(hey )?lens,?\s*/, "").split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b)\s*/).filter(Boolean);
  const steps = [];
  const top = () => desk.canvas.querySelector(".lt-qs");
  for (const c of parts) {
    const w = () => desk.focused() ?? [...desk.wins.values()].find((x) => !x.min);
    const slot = /\bright\b/.test(c) ? "right" : /\bleft\b/.test(c) ? "left" : null;
    if (/\b(tile|snap)\b/.test(c) && /\b(two|both|windows|all)\b/.test(c)) { steps.push({ say: "Tiling your windows", target: () => desk.canvas.querySelector(".lt-search"), act: () => desk.tileAll() }); continue; }
    if (/\b(tile|snap)\b/.test(c) || (slot && /\bwindow\b/.test(c))) { steps.push({ say: `Snapping the window ${slot ?? "left"}`, drag: { slot: slot ?? "left" } }); continue; }
    if (/\bmaximi[sz]e|full ?screen\b/.test(c)) { steps.push({ say: "Maximising the window", target: () => w()?.el.querySelector(".lw-bar"), act: () => { const x = w(); if (x) desk.snap(x.id, "max"); } }); continue; }
    if (/\bminimi[sz]e\b/.test(c)) { steps.push({ say: "Minimising to the dock", target: () => w()?.el.querySelector('[data-a="min"]'), act: () => { const x = w(); if (x) desk.minimize(x.id); } }); continue; }
    if (/\bshow (the )?desktop\b/.test(c)) { steps.push({ say: "Showing the desktop", target: () => top(), act: () => desk.showDesktop() }); continue; }
    const style = STYLES.find((s) => new RegExp(`\\b${s}\\b`).test(c));
    if (style && /\bdock\b/.test(c)) { steps.push({ say: `Switching to the ${style} dock`, target: () => desk.frame.contentDocument?.querySelector(".dock-pill"), act: () => desk.dockStyle(style) }); continue; }
    if (/\b(dark|light)( mode)?\b/.test(c) && !/\btheme\b/.test(c)) { const m = /light/.test(c) ? "light" : "dark"; steps.push({ say: `Turning on ${m} mode`, target: () => top(), act: () => desk.setMode(m) }); continue; }
    const pk = packs.find((p) => c.includes(p.label.toLowerCase())) ?? packs.find((p) => /\b(theme|switch|apply|use)\b/.test(c) && c.includes(p.label.toLowerCase().split(" ")[0]));
    if (pk) { steps.push({ say: `Switching to ${pk.label}`, target: () => top(), act: () => desk.setPack(pk) }); continue; }
    const tm = c.match(/\btimer\b.*?(\d+)\s*(m|min|minute)/) ?? c.match(/(\d+)\s*(m|min|minute)s?\s*timer/);
    if (tm || /\btimer\b/.test(c)) { const m = tm ? +tm[1] : 1; steps.push({ say: `Starting a ${m}-minute timer`, target: () => desk.canvas.querySelector(".lt-search"), act: async () => { desk.open("timer"); await new Promise((r) => setTimeout(r, 300)); desk.byApp("timer")?.timer?.start(m); } }); continue; }
    if (/\b(close|quit)\b/.test(c)) {
      const id = appIn(c) ?? desk.focused()?.app;
      if (!id) continue;
      steps.push({ say: `Asking before closing ${APPS[id].name}`, target: () => desk.byApp(id)?.el.querySelector('[data-a="close"]'), act: async () => { const ok = await approve(desk, { title: `Close ${APPS[id].name}?`, why: id === "chat" ? "It has an unsent draft. You can reopen it from the dock." : "You can reopen it from the dock.", verb: `Close ${APPS[id].name}` }); const x = desk.byApp(id); if (ok && x) desk.close(x.id); } });
      continue;
    }
    if (/\bfree up space\b|\bwhat'?s taking (up )?space\b|\bclean (up )?(my )?(disk|drive|pc)\b/.test(c)) { steps.push({ say: "Scanning for space you can free", target: () => desk.dockIconAt("cleaner"), act: async () => { desk.open("cleaner"); await new Promise((r) => setTimeout(r, 400)); await desk.byApp("cleaner")?.cleaner?.scan(); } }); continue; }
    if (/\b(play|pause)\b.*\bmusic\b|\bplay (some )?(music|a song)\b/.test(c)) { steps.push({ say: "Playing music", target: () => null, act: () => desk.open("music") }); continue; }
    if (/\bnew note\b|\bnote\b.*\b(new|write)\b/.test(c)) { steps.push({ say: "Opening a new note", act: () => desk.open("notes") }); continue; }
    if (/\bwallpaper\b/.test(c)) { steps.push({ say: "Changing the wallpaper", target: () => null, act: () => desk.nextWallpaper() }); continue; }
    if (/\b(shuffle|random) theme\b|\bnext theme\b/.test(c)) { steps.push({ say: "Shuffling the theme", act: () => desk.shuffle() }); continue; }
    const id = appIn(c);
    if (id && /\b(open|show|start|launch|find|go to)\b/.test(c)) { steps.push({ say: `Opening ${APPS[id].name}`, target: () => desk.dockIconAt(id), act: () => desk.open(id) }); continue; }
  }
  return steps;
}

/** Runs steps with the orb. onStep(i, step, state) narrates ("doing" / "done"). */
export async function run(desk, steps, { onStep, t: given } = {}) {
  const o = orbFor(desk);
  const t = given ?? o.begin();
  for (const [i, s] of steps.entries()) {
    onStep?.(i, s, "doing");
    if (s.drag) {
      const w = desk.focused() ?? [...desk.wins.values()].find((x) => !x.min);
      if (w) await o.drag(w, { x: s.drag.slot === "right" ? desk.W - 4 : 4, y: desk.H * 0.45 }, t, { slot: s.drag.slot });
    } else {
      const tg = s.target?.();
      if (tg) await o.click(tg, t);
      await s.act?.();
    }
    onStep?.(i, s, "done");
    await o.wait(s.pause ?? 500, t);
  }
  if (!given) o.hide();
}

/** Lens Command's results for a query: actions first, then apps and themes. */
export async function suggest(q, desk) {
  const out = [];
  const packs = await getPacks();
  if (!q) {
    return [
      { title: "Tile two windows", sub: "Snap side by side", kind: "Action", icon: "lens-command", run: () => desk.tileAll() },
      { title: "Dark mode", sub: "Obsidian", kind: "Action", icon: "lens-settings", run: () => desk.setMode("dark") },
      { title: "Timer 1 min", sub: "Counts down here", kind: "Action", icon: "lens-timer", run: async () => { desk.open("timer"); setTimeout(() => desk.byApp("timer")?.timer?.start(1), 300); } },
      ...["notes", "browser", "music", "settings"].map((id) => ({ title: APPS[id].name, sub: "App", kind: "Open", icon: APPS[id].icon, run: () => desk.open(id) })),
    ];
  }
  const steps = await plan(q, desk);
  if (steps.length) out.push({ title: steps.map((s) => s.say).join(" · "), sub: "Lens runs it on the desk", kind: "Action", icon: "lens-command", run: () => run(desk, steps) });
  const ql = q.toLowerCase();
  for (const [id, a] of Object.entries(APPS)) if (a.name.toLowerCase().includes(ql) || (NAMES[id] ?? []).some((n) => n.startsWith(ql))) out.push({ title: a.name, sub: "App", kind: "Open", icon: a.icon, run: () => desk.open(id) });
  for (const p of packs.filter((p) => p.label.toLowerCase().includes(ql)).slice(0, 4)) out.push({ title: p.label, sub: p.collection ? `${p.collection} theme` : "Theme", kind: "Theme", icon: "lens-settings", run: () => desk.setPack(p) });
  if (!out.length) {
    const { parse } = await import("./intent.js");
    const i = parse(q);
    if (i) out.push({ title: i.summary, sub: "Simulated here", kind: "Action", icon: "lens-command", run: () => desk.toast({ icon: "lens-command", app: "Lens", title: i.summary, body: "Simulated on this demo desk." }) });
    else out.push({ title: `Ask Lens: “${q}”`, sub: "With AI on, your local model or Claude answers", kind: "Ask", icon: "lens-command", run: () => desk.toast({ icon: "lens-command", app: "Lens", title: "Not a desk action", body: "With AI turned on, Lens hands this to your local model or Claude." }) });
  }
  return out.slice(0, 7);
}
void SITE; void iconUrl;

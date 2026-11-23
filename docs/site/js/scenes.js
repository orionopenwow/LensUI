// The scene engine: the hero desk's showcase reel, the narrated tour and the Guide's "show me" all
// play these scenes. Each scene sets a look (theme, dock style, windows) by animating from the
// previous one, then the Lens orb shows one feature by doing it. Any interaction from the visitor
// pauses the reel and hands over control.
import { reducedMotion } from "./site.js";
import { getPacks, iconUrl } from "./desk.js";
import { orbFor, approve, Stopped, run, plan } from "./actions.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Window layouts as fractions of the work area: [app, x, y, w, h]. */
const L = {
  everyday: [["browser", 0.03, 0.06, 0.5, 0.82], ["notes", 0.56, 0.08, 0.32, 0.62]],
  tiling: [["browser", 0.1, 0.12, 0.46, 0.7], ["code", 0.38, 0.2, 0.5, 0.7]],
  music: [["music", 0.33, 0.18, 0.34, 0.42], ["browser", 0.04, 0.06, 0.4, 0.6]],
  magic: [["browser", 0.04, 0.05, 0.52, 0.86], ["files", 0.6, 0.08, 0.36, 0.56]],
  apps: [["store", 0.26, 0.06, 0.48, 0.88]],
  approve: [["chat", 0.56, 0.08, 0.36, 0.78], ["browser", 0.04, 0.06, 0.48, 0.8]],
  snip: [["browser", 0.12, 0.06, 0.6, 0.86]],
  wall: [["music", 0.62, 0.55, 0.3, 0.38]],
  voice: [["browser", 0.06, 0.08, 0.42, 0.7], ["notes", 0.52, 0.12, 0.36, 0.6]],
  settings: [["settings", 0.04, 0.06, 0.5, 0.86], ["monitor", 0.58, 0.12, 0.36, 0.56]],
  agent: [["browser", 0.04, 0.08, 0.44, 0.74], ["code", 0.3, 0.16, 0.44, 0.7]],
  ade: [["terminal", 0.04, 0.48, 0.44, 0.48]],
  messages: [["browser", 0.04, 0.06, 0.4, 0.8]],
  mini: [["notes", 0.05, 0.1, 0.34, 0.6]],
  browserai: [["browser", 0.04, 0.05, 0.62, 0.9]],
  cleaner: [["cleaner", 0.24, 0.06, 0.48, 0.86]],
  sky: [["music", 0.66, 0.56, 0.3, 0.38]],
  "core-apps": [["monitor", 0.03, 0.07, 0.4, 0.62], ["timer", 0.45, 0.1, 0.24, 0.56], ["notes", 0.71, 0.07, 0.26, 0.7]],
};

export const SCENES = [
  { id: "everyday", title: "Everyday desktop", line: "Obsidian, the floating dock, and Lens Command on Ctrl+Space.", look: { pack: "obsidian", dock: "floating", shape: "classic" } },
  { id: "tiling", title: "Tiling and snapping", line: "Drag a window to an edge and it snaps. Islands dock, Linux-rice colours.", look: { pack: "hyprland-neon", dock: "islands", shape: "classic" } },
  { id: "music", title: "Lens Music", line: "Now Playing for every app, a visualiser, and the taskbar dock.", look: { pack: "lens-expressive", dock: "taskbar", shape: "expressive" } },
  { id: "magic-right-click", title: "Magic right-click", line: "Right-click a video, a file or text: summarise, transcript, Shelf.", look: { pack: "tokyo-night", dock: "floating", shape: "classic" } },
  { id: "apps", title: "Lens Apps", line: "Free and open-source apps in one click; they land in your dock.", look: { pack: "catppuccin-mocha", dock: "studio", shape: "classic" } },
  { id: "approvals", title: "Asks before it acts", line: "Anything risky shows the “Needs your OK” card first.", look: { pack: "obsidian", dock: "floating", shape: "classic" } },
  { id: "snip", title: "Snip", line: "Capture, blur what's private, then send it to Claude or a friend.", look: { pack: "nord-frost", dock: "slim", shape: "classic" } },
  { id: "backdrops", title: "Backdrop Lab", line: "Every theme has its own slow backdrop, or make one in Backdrop Lab and set it live.", look: { pack: "rose-pine", dock: "minimal", shape: "classic" } },
  { id: "voice", title: "Voice dock", line: "Hold a key: “Lens, tile my windows.” Recognised on your PC.", look: { pack: "gruvbox-warm", dock: "floating", shape: "classic" } },
  { id: "settings", title: "Settings hub", line: "Lens and Windows settings in one place, with a white-bar mixer.", look: { pack: "alabaster-daylight", dock: "floating", shape: "classic" } },
  { id: "cleaner", title: "Lens Cleaner", line: "See what's taking space. Safe items only, to the Recycle Bin, one click to undo.", look: { pack: "obsidian", dock: "floating", shape: "classic" } },
  { id: "sky", title: "Living Sky", line: "A live wallpaper of the real sky: the Sun and Moon move with your day.", look: { pack: "living-sky", dock: "minimal", shape: "classic" } },
  { id: "core-apps", title: "Core apps", line: "Monitor, Timer, Notes and more, built in and themed like everything else.", look: { pack: "catppuccin-mocha", dock: "floating", shape: "classic" } },
  { id: "claude", title: "Bring your own agent", line: "Connect Claude over MCP. It proposes; you approve; everything undoes.", look: { pack: "obsidian", dock: "floating", shape: "classic" } },
  { id: "ade", title: "Agents at a glance", line: "Running agents, what each may do, and a context pack being built.", look: { pack: "graphite", dock: "slim", shape: "classic" } },
  { id: "messages", title: "Messages and feeds", line: "One slim inbox. Lens drafts a reply; sending waits for you.", look: { pack: "everforest-dark", dock: "floating", shape: "classic" } },
  { id: "mini", title: "Lens Mini", line: "A quiet dashboard: now playing, a timer, system status.", look: { pack: "lens-dot-matrix", dock: "islands", shape: "dotmatrix" } },
  { id: "browser-ai", title: "Lens Browser", line: "An AI side panel that summarises, and sends to Claude only after your OK.", look: { pack: "dracula-glass", dock: "floating", shape: "classic" } },
];

export function createScenes(desk, { onScene, onState } = {}) {
  const o = orbFor(desk);
  let idx = 0, playing = false, timer = 0, t = 0, running = null, current = null;
  const ov = () => { let x = desk.canvas.querySelector(".lx-ov"); if (!x) { x = document.createElement("div"); x.className = "lx-ov"; desk.canvas.append(x); } return x; };
  const panel = (html, cls) => { const d = document.createElement("div"); d.className = `lx-panel ${cls}`; d.innerHTML = html; ov().append(d); return d; };
  const wait = (ms) => o.wait(ms, t);
  let packs = [];

  async function look(sc) {
    packs = packs.length ? packs : await getPacks();
    const p = packs.find((x) => x.id === sc.look.pack);
    if (p && desk.pack?.id !== p.id) desk.setPack(p);
    desk.dockStyle(sc.look.dock, sc.look.shape);
    if (sc.id !== "backdrops" && sc.id !== "sky") desk.resetWallpaper?.();
    // Windows morph from the last scene: keep the ones both scenes use and move them; close the rest.
    const want = L[sc.id === "magic-right-click" ? "magic" : sc.id === "backdrops" ? "wall" : sc.id === "claude" ? "agent" : sc.id === "browser-ai" ? "browserai" : sc.id === "approvals" ? "approve" : sc.id] ?? [];
    for (const w of [...desk.wins.values()]) if (!want.some(([a]) => a === w.app)) desk.close(w.id);
    const wk = { x: 112, y: desk.TOP, w: desk.W - 124, h: desk.H - desk.TOP - 96 }; // right of the desktop icons
    for (const [app, x, y, ww, hh] of want) {
      const r = { x: wk.x + x * wk.w, y: wk.y + y * wk.h, w: ww * wk.w, h: hh * wk.h };
      const ex = desk.byApp(app);
      if (ex) { if (ex.min) desk.restore(ex.id); ex.tile = null; desk.setRect(ex, r); }
      else { const w = desk.open(app); if (w) desk.setRect(w, r, { animate: false }); }
    }
    desk.focus([...desk.wins.values()].at(-1)?.id, { quiet: false });
  }

  const BODY = {
    async everyday() {
      await wait(1200);
      await o.type("Ctrl+Space", { x: desk.W / 2, y: desk.H * 0.3 }, t);
      desk.openCmd();
      const inp = desk.canvas.querySelector(".lx-cmd input");
      for (const ch of "timer 1 min") { inp.value += ch; inp.dispatchEvent(new Event("input")); await wait(70); }
      await wait(900);
      desk.closeCmd();
      await run(desk, await plan("timer 1 min", desk), { t });
      await wait(1800);
    },
    async tiling() {
      await wait(700);
      await o.drag(desk.byApp("browser"), { x: 4, y: desk.H * 0.4 }, t, { slot: "left" });
      await o.drag(desk.byApp("code"), { x: desk.W - 4, y: desk.H * 0.45 }, t, { slot: "right" });
      await wait(1600);
    },
    async music() {
      const m = desk.byApp("music");
      await wait(800);
      const nx = m?.el.querySelector('[data-m="next"]');
      if (nx) { await o.click(nx, t); nx.click(); }
      await wait(2600);
    },
    async "magic-right-click"() {
      const M = await import("./magic.js");
      await wait(600);
      const vid = desk.byApp("browser")?.el.querySelector(".a-video");
      if (vid) {
        const p = await o.click(vid, t);
        const menu = M.magicMenu(desk, M.contextOf(vid), { x: p.x, y: p.y });
        await wait(900);
        const b = menu.querySelector('[data-a="transcript"]');
        await o.click(b, t); menu.hidden = true; await M.act(desk, "transcript", M.contextOf(vid));
        await wait(1800);
      }
      const file = desk.byApp("files")?.el.querySelector(".fi");
      if (file) {
        const p = await o.click(file, t);
        const menu = M.magicMenu(desk, M.contextOf(file), p);
        await wait(800);
        await o.click(menu.querySelector('[data-a="summary"]'), t); menu.hidden = true; await M.act(desk, "summary", M.contextOf(file));
        await wait(1600);
      }
    },
    async apps() {
      await wait(1400);
      const g = desk.byApp("store")?.el.querySelector(".get");
      if (g) { await o.click(g, t); g.click(); }
      await wait(3200);
    },
    async approvals() {
      await wait(700);
      const steps = await plan("close discord", desk);
      const card = async () => {
        await wait(900);
        const c = desk.canvas.querySelector(".lx-approve");
        if (!c) return;
        const y = c.querySelector("[data-yes]");
        await o.to(y, t); y.classList.add("holding"); await wait(1100); y.click();
      };
      await Promise.all([run(desk, steps, { t }), card()]);
      await wait(1200);
    },
    async snip() {
      const w = desk.byApp("browser");
      await wait(600);
      if (!w) return;
      const s = panel(`<div class="tools"><button type="button">Blur</button><button type="button">Arrow</button><button type="button" class="pri">Send to Claude</button><button type="button">Send to Maya</button></div>`, "p-snip");
      Object.assign(s.style, { transform: `translate3d(${w.x + 30}px, ${w.y + 60}px, 0)`, width: `${w.w - 60}px`, height: `${w.h * 0.6}px` });
      await wait(1200);
      const r = panel(`<span>E-mail · blurred</span>`, "p-redact");
      Object.assign(r.style, { transform: `translate3d(${w.x + 60}px, ${w.y + w.h * 0.45}px, 0)`, width: "220px", height: "22px" });
      await o.click(r, t);
      await wait(900);
      await o.click(s.querySelector(".pri"), t);
      desk.toast({ icon: "lens-command", app: "Snip", title: "Ready to send to Claude", body: "With the e-mail blurred. Sends after your OK." });
      await wait(1600);
    },
    async backdrops() {
      await wait(1200);
      // Backdrop Lab's signature look, live: the same engine and preset Lens uses as the wallpaper.
      desk.setWallpaper("backdrop", { preset: "lens-nebula" });
      desk.toast({ icon: "lens-settings", app: "Backdrop Lab", title: "Lens Nebula", body: "Made in Backdrop Lab, playing live as the wallpaper. Loops seamlessly." });
      await wait(3600);
      desk.nextWallpaper(); await wait(2600);
    },
    async voice() {
      const v = panel(`<span class="mic"></span><span class="wave">${"<i></i>".repeat(5)}</span><span class="said"></span>`, "p-voice");
      const said = v.querySelector(".said");
      await wait(600);
      for (const w of "Lens, tile my windows".split(" ")) { said.textContent += (said.textContent ? " " : "") + w; await wait(360); }
      await wait(300);
      desk.tileAll();
      v.classList.add("done"); said.textContent = "Tiled 2 windows";
      await wait(2000);
    },
    async settings() {
      const s = desk.byApp("settings");
      await wait(900);
      const b = s?.el.querySelector('[data-sec="Sound"]');
      if (b) { await o.click(b, t); b.click(); }
      await wait(2600);
    },
    async cleaner() {
      const w = desk.byApp("cleaner");
      await wait(900);
      const sc = w?.el.querySelector('[data-c="scan"]');
      if (sc) { await o.click(sc, t); await w.cleaner.scan(); }
      await wait(1400);
      const cl = w?.el.querySelector('[data-c="clean"]');
      if (cl) { await o.click(cl, t); w.cleaner.clean(); }
      await wait(2400);
    },
    async sky() {
      await wait(400);
      desk.setWallpaper("living-sky");
      desk.toast({ icon: "lens-settings", app: "Lens", title: "Living theme: Sky", body: "Follows the real Sun and Moon where you are. Light by day, dark at night." });
      await wait(5200);
    },
    async "core-apps"() {
      await wait(900);
      const tw = desk.byApp("timer");
      const five = tw?.el.querySelector('[data-min="5"]');
      if (five) { await o.click(five, t); five.click(); }
      const go = tw?.el.querySelector("[data-t=go]");
      if (go) { await o.click(go, t); go.click(); }
      await wait(1200);
      const n = desk.byApp("notes");
      if (n) await o.click(n.el.querySelector(".a-notes"), t);
      await wait(2200);
    },
    async claude() {
      const log = panel(`<div class="ph"><img src="${iconUrl("lens-command")}" alt="" width="16" height="16"><b>Claude</b><span class="ok">connected · MCP</span></div><ol class="lg"></ol>`, "p-agent");
      const add = (s, cls = "") => { const li = document.createElement("li"); li.className = cls; li.textContent = s; log.querySelector(".lg").append(li); return li; };
      add("Claude Desktop connected to Lens over MCP", "done");
      await wait(900);
      add("Asked: “tidy my desktop”");
      await wait(700);
      add("Proposes: snap two windows · switch to Nord Frost");
      const ok = await approve(desk, { source: "Claude (MCP)", title: "Let Claude tidy your desktop?", why: "Snap Lens Browser left and VSCodium right, and switch to Nord Frost. One undo puts it back.", verb: "Allow once", auto: async (c, done) => { const y = c.querySelector("[data-yes]"); await o.to(y, t).catch(() => {}); y.classList.add("holding"); await wait(1000).catch(() => {}); done(true); } });
      if (ok) {
        add("You approved · running", "done");
        desk.snap(desk.byApp("browser")?.id, "left");
        await wait(350);
        desk.snap(desk.byApp("code")?.id, "right");
        desk.setPack(packs.find((p) => p.id === "nord-frost"));
        add("Done · 3 changes · undo available", "done");
      }
      await wait(2200);
    },
    async ade() {
      const d = panel(`<div class="ph"><b>Agents</b><span>3 running</span></div>
        <div class="ag"><i class="on"></i><b>Claude Desktop</b><span>MCP · ask first</span><em>idle</em></div>
        <div class="ag"><i class="on"></i><b>Claude Code</b><span>MCP · windows, themes</span><em>working</em></div>
        <div class="ag"><i></i><b>Local model</b><span>Ollama · read only</span><em>waiting</em></div>
        <div class="pk"><b>Context pack</b><span class="cnt">0 items</span><div class="its"></div></div>`, "p-ade");
      await wait(1000);
      const its = d.querySelector(".its"), cnt = d.querySelector(".cnt");
      for (const [i, s] of ["Release notes · page", "“Every change undoes” · selection", "Launch plan.md · file"].entries()) { its.insertAdjacentHTML("beforeend", `<span>${esc(s)}</span>`); cnt.textContent = `${i + 1} items`; await wait(800); }
      await wait(1600);
    },
    async messages() {
      const m = panel(`<div class="ph"><b>Messages</b><span>3 groups</span></div>
        <div class="g"><b>Lens Team</b><span>Maya: shipping the reel Friday</span></div><div class="g"><b>Family</b><span>Dad: dinner Sunday?</span></div><div class="g"><b>Builds</b><span>CI: all checks passed</span></div>
        <div class="feed"><b>Feed</b><span>Lens 0.9 is out: nine docks, 89 themes.</span></div>
        <div class="draft"><b>Lens drafted a reply</b><p></p><button type="button" class="send">Send</button></div>`, "p-msg");
      await wait(900);
      const p = m.querySelector(".draft p");
      for (const ch of "Sunday works! I'll bring dessert.") { p.textContent += ch; await wait(30); }
      await wait(400);
      const ok = await approve(desk, { source: "Messages", title: "Send this to Dad?", why: "“Sunday works! I'll bring dessert.”", verb: "Send", auto: async (c, done) => { await o.to(c.querySelector("[data-yes]"), t).catch(() => {}); await wait(800).catch(() => {}); done(true); } });
      if (ok) m.querySelector(".send").textContent = "Sent ✓";
      await wait(1600);
    },
    async mini() {
      panel(`<div class="wg np"><div class="art"></div><div><b>Midnight Drive</b><span>Neon Coast</span></div></div><div class="wg tm"><b>04:59</b><span>Focus timer</span></div><div class="wg sy"><b>CPU 14% · RAM 9.2 GB</b><span>All quiet</span></div><div class="wg cl"><b>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b><span>${new Date().toLocaleDateString([], { weekday: "long" })}</span></div>`, "p-mini");
      await wait(4200);
    },
    async "browser-ai"() {
      const w = desk.byApp("browser");
      await wait(600);
      const tab = w?.el.querySelector('[data-p="notes"]');
      if (tab) { await o.click(tab, t); tab.click(); }
      const side = panel(`<div class="ph"><b>✦ Lens AI</b><span>this page</span></div><p class="sum"></p><button type="button" class="send">Send to Claude</button>`, "p-side");
      if (w) Object.assign(side.style, { transform: `translate3d(${w.x + w.w + 10}px, ${w.y}px, 0)`, height: `${w.h}px` });
      await wait(700);
      const sum = side.querySelector(".sum");
      for (const ch of "Lens 0.9: nine dock styles, 89 themes, Command, and an assistant that asks before acting. Every change undoes.") { sum.textContent += ch; await wait(16); }
      await wait(500);
      await o.click(side.querySelector(".send"), t);
      await approve(desk, { source: "Lens Browser", title: "Send this summary to Claude?", why: "Only the summary, not the page or your tabs.", verb: "Send", auto: async (c, done) => { await wait(1000).catch(() => {}); done(true); } });
      await wait(1400);
    },
  };

  function cleanup() {
    o.stop();
    desk.canvas.querySelectorAll(".lx-ov, .lx-approve, .lx-magic, .lx-shelf").forEach((x) => x.remove());
    desk.closeCmd(); desk.hideMenu(); desk.closeFly(); desk.search(false);
  }
  async function go(i, { auto = false } = {}) {
    idx = (i + SCENES.length) % SCENES.length;
    clearTimeout(timer);
    cleanup();
    t = o.begin();
    const sc = SCENES[idx];
    current = sc;
    onScene?.(idx, sc);
    const my = t;
    try {
      await look(sc);
      if (reducedMotion() && !auto) { await BODY[sc.id]?.().catch(() => {}); }
      else await BODY[sc.id]?.();
      o.hide();
      if (playing && my === t) timer = setTimeout(() => { if (playing) go(idx + 1, { auto: true }); }, reducedMotion() ? 6000 : 1200);
    } catch (e) { if (!(e instanceof Stopped)) console.warn(e); }
  }
  const api = {
    list: SCENES,
    get index() { return idx; }, get playing() { return playing; }, get current() { return current; },
    play() { playing = true; onState?.(true); go(idx + (current ? 1 : 0), { auto: true }); },
    pause() { playing = false; clearTimeout(timer); o.pause(false); o.stop(); onState?.(false); },
    go(i) { const keep = playing; go(i); playing = keep; },
    goId(id) { const i = SCENES.findIndex((s) => s.id === id); if (i >= 0) api.go(i); return i >= 0; },
    next() { api.go(idx + 1); }, prev() { api.go(idx - 1); },
    stop() { playing = false; clearTimeout(timer); cleanup(); onState?.(false); },
  };
  return api;
}

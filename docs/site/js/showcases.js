// Showcases: the hero desk's guided demos. Each one sets a look (theme, dock, windows), then walks
// through a few steps at the visitor's pace: a caption, a soft spotlight on what to use, and Next
// (or doing the thing yourself) to move on. Nothing moves until the visitor asks. Back replays
// the earlier steps instantly, Reset starts over, Esc or "Exit" leaves the desk free to play with.
import { reducedMotion } from "./site.js";
import { getPacks, iconUrl } from "./desk.js";
import { approve } from "./actions.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? 0 : ms));
const q = (desk, sel) => desk.canvas.querySelector(sel);
const inApp = (desk, app, sel) => desk.byApp(app)?.el.querySelector(sel) ?? null;

/** Window layouts as fractions of the work area: [app, x, y, w, h]. */
const LAYOUT = {
  desktop: [["browser", 0.03, 0.06, 0.5, 0.8], ["notes", 0.57, 0.1, 0.32, 0.6]],
  magic: [["browser", 0.03, 0.05, 0.52, 0.86], ["files", 0.59, 0.08, 0.37, 0.56]],
  agent: [["browser", 0.06, 0.1, 0.44, 0.72], ["code", 0.34, 0.18, 0.44, 0.68]],
  browser: [["browser", 0.03, 0.05, 0.6, 0.9]],
  apps: [["store", 0.26, 0.05, 0.48, 0.9]],
  music: [["music", 0.36, 0.2, 0.34, 0.42], ["browser", 0.04, 0.06, 0.38, 0.6]],
  cleaner: [["cleaner", 0.24, 0.05, 0.5, 0.88]],
};

function panel(desk, html, cls) {
  let ov = q(desk, ".lx-ov");
  if (!ov) { ov = document.createElement("div"); ov.className = "lx-ov"; desk.canvas.append(ov); }
  const d = document.createElement("div"); d.className = `lx-panel ${cls}`; d.innerHTML = html; ov.append(d); return d;
}
async function magicAt(desk, el) {
  const M = await import("./magic.js");
  const r = el.getBoundingClientRect(), c = desk.canvas.getBoundingClientRect();
  return M.magicMenu(desk, M.contextOf(el), { x: (r.left - c.left + r.width / 2) / desk.k, y: (r.top - c.top + r.height / 2) / desk.k });
}
async function pickMagic(desk, a) {
  const M = await import("./magic.js");
  const m = q(desk, ".lx-magic");
  const b = m?.querySelector(`[data-a="${a}"]`);
  if (b) b.click(); else if (m) m.hidden = true;
  void M;
}

/**
 * step: { cap, target?(desk) → element, run(desk, s) }
 * `run` must be quick to replay (Back replays earlier steps with no pauses).
 */
export const SHOWCASES = [
  {
    id: "desktop", title: "Desktop", line: "Windows that snap, the dock, and Lens Command.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "This is the Lens desktop: the top bar, your windows and the dock. Drag any window by its title bar.", target: (d) => inApp(d, "browser", ".lw-bar") },
      { cap: "Snap Lens Browser to the left half. (You can also drag it to the left edge.)", target: (d) => inApp(d, "browser", ".lw-bar"), run: (d) => d.snap(d.byApp("browser")?.id, "left") },
      { cap: "And Notes to the right. Win+arrow keys do the same while the desk has focus.", target: (d) => inApp(d, "notes", ".lw-bar"), run: (d) => d.snap(d.byApp("notes")?.id, "right") },
      { cap: "Press Ctrl+Space for Lens Command, and type what you want.", target: (d) => q(d, ".lt-search"), run: (d) => d.openCmd("timer 1 min") },
      { cap: "Run it: a one-minute timer opens. Command works offline.", target: (d) => q(d, ".lx-cmd input"), run: async (d) => { d.closeCmd(); const w = d.open("timer"); await sleep(250); w?.timer?.start(1); } },
      { cap: "That's the everyday desk. Try a theme from Quick Settings in the top bar, or pick another tour below the desk." },
    ],
  },
  {
    id: "magic", title: "Magic right-click", line: "Right-click anything: a video, a file, text or a link.",
    look: { pack: "tokyo-night", dock: "floating" },
    steps: [
      { cap: "Right-click the video in Lens Browser.", target: (d) => inApp(d, "browser", ".a-video"), on: "contextmenu", run: (d) => magicAt(d, inApp(d, "browser", ".a-video")) },
      { cap: "The Lens menu knows it's a video. Pick “Get transcript”.", target: (d) => q(d, '.lx-magic [data-a="transcript"]'), run: (d) => pickMagic(d, "transcript") },
      { cap: "The transcript opens in Notes and a copy lands in the Shelf, on the right." , target: (d) => q(d, ".lx-shelf") },
      { cap: "Now right-click a file in File Explorer.", target: (d) => inApp(d, "files", ".fi"), on: "contextmenu", run: (d) => magicAt(d, inApp(d, "files", ".fi")) },
      { cap: "Different thing, different actions. Pick “Summarise”.", target: (d) => q(d, '.lx-magic [data-a="summary"]'), run: (d) => pickMagic(d, "summary") },
      { cap: "Everything you collect can go to Claude as one context pack, after your OK.", target: (d) => q(d, ".lx-shelf .pack"), run: (d) => q(d, ".lx-shelf .pack")?.click() },
      { cap: "Right-click works on text and links too. Try it on the release notes tab." },
    ],
  },
  {
    id: "agent", title: "Agentic desktop", line: "Bring your own agent. It proposes; you approve.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Connect Claude (or a local model, or any MCP agent) and it can see and change your desktop through Lens.", run: (d) => {
        const p = panel(d, `<div class="ph"><img src="${iconUrl("lens-command")}" alt="" width="16" height="16"><b>Claude</b><span class="ok">connected · MCP</span></div><ol class="lg"><li class="done">Claude Desktop connected to Lens over MCP</li></ol>`, "p-agent");
        p.dataset.sc = "log";
      } },
      { cap: "You ask it to “tidy my desktop”. It plans the change first.", target: (d) => q(d, '[data-sc="log"]'), run: (d) => {
        const lg = q(d, '[data-sc="log"] .lg');
        lg?.insertAdjacentHTML("beforeend", `<li>Asked: “tidy my desktop”</li><li>Proposes: snap two windows · switch to Nord Frost</li>`);
      } },
      { cap: "Anything that changes your PC shows “Needs your OK” first.", run: (d) => {
        approve(d, { source: "Claude (MCP)", title: "Let Claude tidy your desktop?", why: "Snap Lens Browser left and VSCodium right, and switch to Nord Frost. One undo puts it back.", verb: "Allow once" })
          .then(async (ok) => {
            const lg = q(d, '[data-sc="log"] .lg');
            if (!ok) { lg?.insertAdjacentHTML("beforeend", `<li>You said no · nothing changed</li>`); return; }
            lg?.insertAdjacentHTML("beforeend", `<li class="done">You approved · running</li>`);
            d.snap(d.byApp("browser")?.id, "left"); await sleep(380); d.snap(d.byApp("code")?.id, "right");
            const ps = await getPacks(); d.setPack(ps.find((p) => p.id === "nord-frost"));
            lg?.insertAdjacentHTML("beforeend", `<li class="done">Done · 3 changes · undo available</li>`);
          });
      } },
      { cap: "Click “Allow once”, or Deny. Esc always stops an agent.", target: (d) => q(d, ".lx-approve [data-yes]"), run: (d) => q(d, ".lx-approve [data-yes]")?.click() },
      { cap: "It did exactly what it showed you, and the whole change undoes in one step. In beta: approval cards and the audit log are in; automatic checks for hidden instructions are still being connected to every agent path." },
    ],
  },
  {
    id: "browser", title: "Lens Browser", line: "A themed browser with an AI side panel.",
    look: { pack: "dracula-glass", dock: "floating" },
    steps: [
      { cap: "Lens Browser follows your theme like everything else. Open the release notes tab.", target: (d) => inApp(d, "browser", '[data-p="notes"]'), run: (d) => inApp(d, "browser", '[data-p="notes"]')?.click() },
      { cap: "Open the ✦ AI side panel.", target: (d) => inApp(d, "browser", ".a-side-btn"), run: async (d) => {
        const w = d.byApp("browser");
        const side = panel(d, `<div class="ph"><b>✦ Lens AI</b><span>this page</span></div><p class="sum"></p><button type="button" class="send">Send to Claude</button>`, "p-side");
        side.dataset.sc = "side";
        if (w) Object.assign(side.style, { transform: `translate3d(${w.x + w.w + 10}px, ${w.y}px, 0)`, height: `${w.h}px` });
        const sum = side.querySelector(".sum"), text = "Lens 0.9: nine dock styles, 89 themes, Command, and an assistant that asks before acting. Every change undoes.";
        if (reducedMotion()) sum.textContent = text; else for (const ch of text) { sum.textContent += ch; await new Promise((r) => setTimeout(r, 14)); }
      } },
      { cap: "It summarises the page on your PC. Sending it anywhere asks first: click “Send to Claude”.", target: (d) => q(d, '[data-sc="side"] .send'), run: (d) => {
        approve(d, { source: "Lens Browser", title: "Send this summary to Claude?", why: "Only the summary, not the page or your tabs.", verb: "Send" }).then((ok) => { const b = q(d, '[data-sc="side"] .send'); if (b) b.textContent = ok ? "Sent ✓" : "Not sent"; });
      } },
      { cap: "Approve it.", target: (d) => q(d, ".lx-approve [data-yes]"), run: (d) => q(d, ".lx-approve [data-yes]")?.click() },
      { cap: "On a video page, the right-click menu gets you the transcript. Try the first tab." },
    ],
  },
  {
    id: "apps", title: "Apps · ArtCraft", line: "Free and open-source apps in one click.",
    look: { pack: "catppuccin-mocha", dock: "studio" },
    steps: [
      { cap: "Lens Apps installs free and open-source apps from their official releases, and checks each download." },
      { cap: "Get ArtCraft: an IDE for artists with controllable AI image and video.", target: (d) => inApp(d, "store", '.get[data-id="artcraft"]') ?? inApp(d, "store", ".get"), run: (d) => (inApp(d, "store", '.get[data-id="artcraft"]') ?? inApp(d, "store", ".get"))?.click() },
      { cap: "It's found, downloaded, verified and installed, then pinned to your dock. Try Concat or Krita too." },
    ],
  },
  {
    id: "music", title: "Lens Music", line: "Now Playing for any app, themed to your desk.",
    look: { pack: "lens-expressive", dock: "taskbar", shape: "expressive" },
    steps: [
      { cap: "Lens Music shows what's playing in any app. Press play.", target: (d) => inApp(d, "music", '[data-m="pp"]'), run: (d) => inApp(d, "music", '[data-m="pp"]')?.click() },
      { cap: "Skip to the next track.", target: (d) => inApp(d, "music", '[data-m="next"]'), run: (d) => inApp(d, "music", '[data-m="next"]')?.click() },
      { cap: "The visualiser and colours follow the album art. In Lens it can also reskin Spotify to match your theme (optional, via Spicetify)." },
    ],
  },
  {
    id: "cleaner", title: "Lens Cleaner", line: "See what's taking space; clean safely.",
    look: { pack: "obsidian", dock: "floating" },
    steps: [
      { cap: "Lens Cleaner looks at what's taking up space. Start a scan.", target: (d) => inApp(d, "cleaner", '[data-c="scan"]'), run: async (d) => { await d.byApp("cleaner")?.cleaner?.scan(); } },
      { cap: "Every item is sorted by how safe it is. Preview exactly what would go.", target: (d) => inApp(d, "cleaner", '[data-c="preview"]'), run: (d) => inApp(d, "cleaner", '[data-c="preview"]')?.click() },
      { cap: "Clean: safe items only, and they go to the Recycle Bin.", target: (d) => inApp(d, "cleaner", '[data-c="clean"]'), run: (d) => d.byApp("cleaner")?.cleaner?.clean() },
      { cap: "Changed your mind? Restore puts back exactly what that clean moved.", target: (d) => inApp(d, "cleaner", '[data-c="restore"]'), run: (d) => inApp(d, "cleaner", '[data-c="restore"]')?.click() },
    ],
  },
];

export function createShowcases(desk, { onChange } = {}) {
  let sc = null, i = 0, busy = false, gen = 0;
  const spot = document.createElement("div");
  spot.className = "lx-spot"; spot.setAttribute("aria-hidden", "true"); spot.hidden = true;
  desk.canvas.append(spot);

  async function look(s) {
    const packs = await getPacks();
    const p = packs.find((x) => x.id === s.look.pack);
    if (p && desk.pack?.id !== p.id) desk.setPack(p);
    desk.dockStyle(s.look.dock, s.look.shape ?? "classic");
    desk.resetWallpaper?.();
    desk.canvas.querySelectorAll(".lx-ov, .lx-approve, .lx-magic, .lx-shelf").forEach((x) => x.remove());
    desk.closeCmd(); desk.hideMenu(); desk.closeFly();
    const want = LAYOUT[s.id] ?? [];
    for (const w of [...desk.wins.values()]) if (!want.some(([a]) => a === w.app)) desk.close(w.id);
    const wk = { x: 112, y: desk.TOP, w: desk.W - 124, h: desk.H - desk.TOP - 96 };
    for (const [app, x, y, ww, hh] of want) {
      const r = { x: wk.x + x * wk.w, y: wk.y + y * wk.h, w: ww * wk.w, h: hh * wk.h };
      const ex = desk.byApp(app);
      if (ex) { if (ex.min) desk.restore(ex.id); ex.tile = null; desk.setRect(ex, r); }
      else { const w = desk.open(app); if (w) desk.setRect(w, r, { animate: false }); }
    }
    desk.focus([...desk.wins.values()].at(-1)?.id, { quiet: true });
    await sleep(280); // let async app bodies (store, settings) mount
  }

  const target = () => { try { return sc?.steps[i]?.target?.(desk) ?? null; } catch { return null; } };
  function place() {
    const el = target();
    if (!el || !el.isConnected || el.ownerDocument !== document || !el.getBoundingClientRect().width) { spot.hidden = true; return; }
    const r = el.getBoundingClientRect(), c = desk.canvas.getBoundingClientRect(), k = desk.k, pad = 6;
    Object.assign(spot.style, { transform: `translate3d(${(r.left - c.left) / k - pad}px, ${(r.top - c.top) / k - pad}px, 0)`, width: `${r.width / k + pad * 2}px`, height: `${r.height / k + pad * 2}px` });
    spot.hidden = false;
  }
  let raf = 0;
  const follow = () => { cancelAnimationFrame(raf); const loop = () => { if (!sc) return; place(); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); };

  const state = () => ({ showcase: sc, index: i, total: sc?.steps.length ?? 0, step: sc?.steps[i] ?? null, busy, done: !!sc && i >= sc.steps.length - 1 });
  const changed = () => onChange?.(state());

  async function start(id) {
    const s = SHOWCASES.find((x) => x.id === id);
    if (!s) return false;
    const my = ++gen;
    sc = s; i = 0; busy = true; changed();
    await look(s);
    if (my !== gen) return true;
    busy = false; changed(); follow();
    return true;
  }
  async function runStep(k, { fast = false } = {}) {
    const st = sc?.steps[k];
    if (!st?.run) return;
    try { await st.run(desk, { fast }); } catch (e) { console.warn(e); }
  }
  async function next() {
    if (!sc || busy || i >= sc.steps.length - 1) return;
    busy = true; spot.hidden = true; changed();
    const my = gen;
    await runStep(i);
    await sleep(380);
    if (my !== gen) return;
    i++; busy = false; changed();
  }
  async function back() {
    if (!sc || busy || i === 0) return;
    const to = i - 1, s = sc, my = ++gen;
    busy = true; changed();
    await look(s);
    for (let k = 0; k < to; k++) { if (my !== gen) return; await runStep(k, { fast: true }); await sleep(120); }
    if (my !== gen) return;
    i = to; busy = false; changed(); follow();
  }
  function exit() {
    gen++; sc = null; i = 0; busy = false; spot.hidden = true; cancelAnimationFrame(raf);
    desk.canvas.querySelectorAll(".lx-ov, .lx-approve, .lx-magic").forEach((x) => x.remove());
    changed();
  }

  // Doing the highlighted thing yourself counts as Next (a click, or a right-click where asked).
  const hit = (e) => {
    if (!sc || busy) return false;
    const el = target();
    return !!el && el.ownerDocument === document && (el === e.target || el.contains(e.target));
  };
  desk.canvas.addEventListener("click", (e) => {
    if (sc?.steps[i]?.on === "contextmenu" || !hit(e) || !sc.steps[i].run) return;
    e.preventDefault(); e.stopPropagation(); next();
  }, true);
  desk.canvas.addEventListener("contextmenu", (e) => {
    if (sc?.steps[i]?.on !== "contextmenu" || !hit(e)) return;
    e.preventDefault(); e.stopPropagation(); next();
  }, true);

  return {
    list: SHOWCASES, start, next, back, exit,
    reset: () => (sc ? start(sc.id) : null),
    get current() { return sc; }, get index() { return i; }, get busy() { return busy; }, state,
  };
}

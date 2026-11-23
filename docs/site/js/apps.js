// What's inside the Lens desk's windows (js/desk.js). Loaded the first time a window opens.
// Each app has real content you can use: type notes, play music, run a timer, change the theme in
// Settings, browse three pages, chat, install from Lens Apps. Everything is simulated in the page.
import { reducedMotion } from "./site.js";
import { iconUrl, getPacks } from "./desk.js";

const SITE = new URL("../", import.meta.url);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const shared = { note: "Launch plan\n\n☑ Record the dock reel\n☑ Ship 80 themes\n☐ Write the FAQ\n☐ Ask Maya about the icons\n\nFriday 10:00 · demo with the team", playing: true, track: 0 };
const TRACKS = [["Midnight Drive", "Neon Coast", "conic-gradient(from 200deg, #f43f5e, #a855f7, #06b6d4, #f43f5e)"], ["Paper Lanterns", "Kyoto Tapes", "conic-gradient(from 90deg, #fbbf24, #fb7185, #f97316, #fbbf24)"], ["Low Orbit", "Glass Atlas", "conic-gradient(from 10deg, #34d399, #3b82f6, #a78bfa, #34d399)"]];

export function mount(id, body, desk) {
  const f = APPS[id];
  if (f) f(body, desk); else body.innerHTML = `<p class="a-pad">…</p>`;
}

const APPS = {
  notes(b, desk) {
    b.innerHTML = `<div class="a-notes" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" aria-label="Note text"></div>`;
    const ed = b.firstElementChild;
    ed.textContent = shared.note;
    ed.addEventListener("input", () => { shared.note = ed.innerText; });
    ed.addEventListener("pointerdown", () => desk.emit("user", "type"));
  },

  browser(b, desk) {
    const PAGES = {
      video: { tab: "Lens in 90 seconds", url: "youtube.com/watch?v=lens-tour", body: `<div class="a-video" data-magic="video" tabindex="0" aria-label="Video: Lens in 90 seconds"><span class="play">▶</span><span class="dur">1:32</span></div><b class="h">Lens in 90 seconds — the everything desktop</b><p>Orion Open · 12K views</p>` },
      notes: { tab: "Release notes", url: "lens.dev/release-notes", body: `<b class="h">Lens 0.9: the everything desktop</b><p data-magic="text">Nine dock styles, 80 themes and a helper that asks before it acts. Every change undoes.</p><div class="a-hero"></div><ul><li>Super search lives inside the dock</li><li>Animated backdrops for every pack</li><li>Open-source apps in one click</li></ul><p>Questions? <a href="#" data-magic="link">maya.chen@example.com</a></p>` },
      docs: { tab: "Docs", url: "lens.dev/docs/command", body: `<b class="h">Lens Command</b><p data-magic="text">Press Ctrl+Space and type what you want: “dark mode”, “tile left”, “timer 5 min”. It runs offline.</p><p><a href="#" data-magic="link">Keyboard map</a> · <a href="#" data-magic="link">Undo anything</a></p>` },
    };
    let cur = "video";
    const render = () => {
      b.innerHTML = `<div class="a-br"><div class="a-tabs" role="tablist">${Object.entries(PAGES).map(([k, p]) => `<button type="button" role="tab" aria-selected="${k === cur}" data-p="${k}">${esc(p.tab)}</button>`).join("")}<span class="a-side-btn" aria-hidden="true">✦ AI</span></div>
        <div class="a-url"><span class="lock"></span>${esc(PAGES[cur].url)}</div><article class="a-page">${PAGES[cur].body}</article></div>`;
    };
    render();
    b.addEventListener("click", (e) => { const t = e.target.closest("[data-p]"); if (t) { cur = t.dataset.p; render(); } if (e.target.closest("a")) e.preventDefault(); });
  },

  files(b, desk) {
    const F = [["Launch plan.md", "file-doc", "notes"], ["dock-reel.webm", "file-video", "browser"], ["Nord Frost.lenstheme", "file-theme", "settings"], ["krita-5.3.exe", "file-exe", "store"], ["screens.png", "file-image", null], ["invoice-0412.pdf", "file-pdf", null]];
    b.innerHTML = `<div class="a-files"><nav><b>Places</b><span class="on">Downloads</span><span>Documents</span><span>Pictures</span><span>Projects</span></nav><div class="grid">${F.map(([n, ic, app]) => `<button type="button" class="fi" data-magic="file" data-app="${app ?? ""}" data-name="${esc(n)}"><img src="${iconUrl(ic)}" alt="" width="40" height="40"><span>${esc(n)}</span></button>`).join("")}</div></div>`;
    b.addEventListener("click", (e) => { const fi = e.target.closest(".fi"); if (!fi) return; b.querySelectorAll(".fi").forEach((x) => x.classList.toggle("sel", x === fi)); });
    b.addEventListener("dblclick", (e) => { const fi = e.target.closest(".fi"); if (fi?.dataset.app) desk.open(fi.dataset.app); });
  },

  music(b, desk) {
    const render = () => {
      const [t, a, art] = TRACKS[shared.track];
      b.innerHTML = `<div class="a-music${shared.playing ? " playing" : ""}"><div class="art" style="background:${art}"></div><div class="m"><b>${esc(t)}</b><span>${esc(a)}</span><div class="viz" aria-hidden="true">${"<i></i>".repeat(16)}</div><div class="bar"><i></i></div><div class="ctl"><button type="button" data-m="prev" aria-label="Previous">⏮</button><button type="button" data-m="pp" aria-label="${shared.playing ? "Pause" : "Play"}">${shared.playing ? "❚❚" : "▶"}</button><button type="button" data-m="next" aria-label="Next">⏭</button></div></div></div>`;
      desk.root.style.setProperty("--lx-art", art);
    };
    render();
    b.addEventListener("click", (e) => {
      const m = e.target.closest("[data-m]")?.dataset.m;
      if (!m) return;
      if (m === "pp") shared.playing = !shared.playing;
      if (m === "next") shared.track = (shared.track + 1) % TRACKS.length;
      if (m === "prev") shared.track = (shared.track + TRACKS.length - 1) % TRACKS.length;
      render();
      if (m !== "pp") desk.toast({ icon: "lens-music", app: "Now Playing", title: TRACKS[shared.track][0], body: TRACKS[shared.track][1] });
    });
  },

  monitor(b, desk) {
    const S = [["CPU", "%", 14, "#60a5fa"], ["Memory", "GB", 9.2, "#a78bfa"], ["GPU", "%", 22, "#34d399"], ["Network", "Mb/s", 3.1, "#fbbf24"]];
    const hist = S.map(([, , v]) => Array.from({ length: 40 }, () => v));
    b.innerHTML = `<div class="a-mon">${S.map(([n, u], i) => `<div class="row"><span class="n">${n}</span><svg viewBox="0 0 160 36" preserveAspectRatio="none" aria-hidden="true"><path data-i="${i}" fill="none" stroke-width="2"/></svg><span class="v" data-v="${i}"></span></div>`).join("")}</div>`;
    const draw = () => {
      S.forEach(([, u, base, col], i) => {
        const h = hist[i], last = h.at(-1), nx = Math.max(0.5, base * (0.6 + Math.random() * 0.8) * 0.4 + last * 0.6);
        h.push(nx); h.shift();
        const max = Math.max(...h) * 1.2;
        const p = b.querySelector(`path[data-i="${i}"]`);
        p.setAttribute("d", h.map((v, j) => `${j ? "L" : "M"}${(j * 160) / 39} ${36 - (v / max) * 32}`).join(" "));
        p.setAttribute("stroke", col);
        b.querySelector(`[data-v="${i}"]`).textContent = `${nx.toFixed(u === "%" ? 0 : 1)} ${u}`;
      });
    };
    draw();
    const t = setInterval(() => { if (!desk.root.classList.contains("is-off") && !reducedMotion()) draw(); }, 600);
    const w = desk.byApp("monitor"); if (w) w.cleanup = () => clearInterval(t);
  },

  timer(b, desk) {
    let left = 60, run = false, t = 0;
    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    b.innerHTML = `<div class="a-timer"><div class="ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" pathLength="100"/></svg><output aria-live="off">01:00</output></div>
      <div class="pre">${[1, 5, 10].map((m) => `<button type="button" data-min="${m}">${m} min</button>`).join("")}</div><div class="go"><button type="button" class="pri" data-t="go">Start</button><button type="button" data-t="reset">Reset</button></div></div>`;
    const out = b.querySelector("output"), prog = b.querySelector(".p"), go = b.querySelector("[data-t=go]");
    let total = 60;
    const paint = () => { out.textContent = fmt(left); prog.style.strokeDashoffset = String(100 - (left / total) * 100); go.textContent = run ? "Pause" : "Start"; };
    const tick = () => { if (!run) return; left = Math.max(0, left - 1); paint(); if (!left) { run = false; paint(); desk.toast({ icon: "lens-timer", app: "Timer", title: "Time's up", body: `${total / 60} min timer finished.` }); return; } t = setTimeout(tick, 1000); };
    const api = { start(min) { if (min) { total = left = min * 60; } run = true; clearTimeout(t); paint(); t = setTimeout(tick, 1000); } };
    b.addEventListener("click", (e) => {
      const m = e.target.closest("[data-min]"); if (m) { run = false; total = left = +m.dataset.min * 60; paint(); }
      const a = e.target.closest("[data-t]")?.dataset.t;
      if (a === "go") { run ? (run = false, clearTimeout(t), paint()) : api.start(); }
      if (a === "reset") { run = false; clearTimeout(t); left = total; paint(); }
    });
    paint();
    const w = desk.byApp("timer"); if (w) { w.timer = api; w.cleanup = () => clearTimeout(t); }
  },

  terminal(b, desk) {
    b.innerHTML = `<div class="a-term"><pre>Lens shell — type <b>help</b>\n</pre><label><span>›</span><input type="text" aria-label="Terminal command" autocomplete="off" spellcheck="false"></label></div>`;
    const pre = b.querySelector("pre"), inp = b.querySelector("input");
    const say = (s) => { pre.textContent += s + "\n"; pre.scrollTop = 1e6; };
    inp.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      const v = inp.value.trim(); inp.value = ""; say(`› ${v}`);
      const [c, ...r] = v.split(/\s+/);
      if (c === "help") say("open <app> · theme <name> · dock <style> · tile · clear · lens --version");
      else if (c === "clear") pre.textContent = "";
      else if (c === "open" && r[0]) { desk.open(r[0]) ? say(`opened ${r[0]}`) : say(`no app called ${r[0]}`); }
      else if (c === "theme") { const ps = await getPacks(); const p = ps.find((x) => x.label.toLowerCase().includes(r.join(" ").toLowerCase())); p ? (desk.setPack(p), say(`theme → ${p.label}`)) : say("theme not found"); }
      else if (c === "dock" && r[0]) { desk.dockStyle(r[0]); say(`dock → ${r[0]}`); }
      else if (c === "tile") { desk.tileAll(); say("tiled"); }
      else if (v === "lens --version") say("lens-ui 0.9.0-beta (demo)");
      else if (v) say(`${c}: not in this demo. Try help.`);
    });
  },

  code(b) {
    const L = [["c", "// Lens dock: magnify the icon under the pointer"], ["k", "export function ", "f", "magnify", "p", "(icons, x) {"], ["p", "  for (const ", "v", "el", "p", " of icons) {"], ["p", "    const ", "v", "d", "p", " = Math.", "f", "abs", "p", "(x - centre(el));"], ["p", "    el.style.scale = ", "n", "1 + 0.24", "p", " * falloff(d);"], ["p", "  }"], ["p", "}"], ["p", ""], ["c", "// Every change undoes"], ["k", "export function ", "f", "apply", "p", "(change) {"], ["p", "  history.", "f", "push", "p", "(change.", "f", "inverse", "p", "());"], ["p", "  return change.", "f", "run", "p", "();"], ["p", "}"]];
    b.innerHTML = `<div class="a-code"><nav><b>LENS-UI</b><span>src</span><span class="on">dock.ts</span><span>themes.ts</span><span>undo.ts</span></nav><pre data-magic="text">${L.map((l, i) => `<i>${i + 1}</i>${l.reduce((a, t, j) => (j % 2 ? a + `<span class="t-${l[j - 1]}">${esc(t)}</span>` : a), "")}`).join("\n")}</pre></div>`;
  },

  chat(b, desk) {
    const msgs = [["Maya", "the islands dock looks great on Nord"], ["Sam", "can we try dot matrix for the demo?"], ["Maya", "shipping the reel Friday"]];
    const render = () => { b.querySelector(".log").innerHTML = msgs.map(([u, t]) => `<p data-magic="text"><b>${esc(u)}</b> ${esc(t)}</p>`).join(""); };
    b.innerHTML = `<div class="a-chat"><nav><b>Lens Team</b><span class="on"># design</span><span># builds</span><span># random</span></nav><div><div class="log"></div><form><input type="text" aria-label="Message #design" placeholder="Message #design"></form></div></div>`;
    render();
    b.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); const i = e.target.elements[0]; if (!i.value.trim()) return; msgs.push(["You", i.value.trim()]); i.value = ""; render(); });
  },

  async store(b, desk) {
    const media = await fetch(new URL("data/app-media.json", SITE)).then((r) => r.json()).catch(() => ({}));
    const ORDER = ["artcraft", "concat", "krita", "blender", "obs-studio", "ollama"];
    b.innerHTML = `<div class="a-store"><div class="s">Search free and open-source apps</div><ul>${ORDER.filter((id) => media[id]).map((id) => { const a = media[id]; return `<li><img src="${new URL(`media/apps/${a.files?.icon}`, SITE)}" alt="" width="32" height="32"><div><b>${esc(a.name)}</b><span>${esc(a.pitch ?? "")}</span><span class="lic">${esc(a.license)}</span></div><button type="button" class="get" data-id="${id}">Get</button></li>`; }).join("")}</ul></div>`;
    b.addEventListener("click", async (e) => {
      const g = e.target.closest(".get");
      if (!g || g.dataset.busy) return;
      if (g.classList.contains("done")) return;
      g.dataset.busy = "1";
      for (const s of ["Finding", "Downloading", "Verifying", "Installing"]) { g.textContent = s; await new Promise((r) => setTimeout(r, reducedMotion() ? 40 : 420)); }
      g.textContent = "Open"; g.classList.add("done"); delete g.dataset.busy;
      const a = media[g.dataset.id];
      desk.post({ lens: "pin", app: { id: `store-${g.dataset.id}`, name: a.name, path: `lens://store/${g.dataset.id}` } });
      desk.toast({ icon: `media/apps/${a.files?.icon}`, app: "Lens Apps", title: `${a.name} is installed`, body: "Official release, checked. Pinned to your dock." });
    });
  },

  async settings(b, desk) {
    const packs = await getPacks();
    const PICK = ["obsidian", "nord-frost", "catppuccin-mocha", "tokyo-night", "gruvbox-warm", "rose-pine", "hyprland-neon", "alabaster-daylight", "lens-expressive", "lens-dot-matrix", "cc-koi-mosaic", "dracula-glass"].map((id) => packs.find((p) => p.id === id)).filter(Boolean);
    const SEC = ["Appearance", "Dock", "Sound", "About"];
    let sec = "Appearance";
    const render = () => {
      const cur = desk.pack?.id;
      const body = sec === "Appearance"
        ? `<b class="h">Theme</b><div class="packs">${PICK.map((p) => `<button type="button" class="pk${p.id === cur ? " on" : ""}" data-pack="${p.id}" aria-pressed="${p.id === cur}"><span class="sw" style="--b:${p.base ?? (p.scheme === "light" ? "#f4f4f5" : "#09090b")};--a:${p.accent}"><i></i><i></i></span>${esc(p.label)}</button>`).join("")}</div>`
        : sec === "Dock"
          ? `<b class="h">Dock style</b><div class="docks">${["floating", "slim", "taskbar", "studio", "minimal", "split", "islands"].map((s) => `<button type="button" data-dock="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}</div>`
          : sec === "Sound"
            ? `<b class="h">Volume mixer</b>${[["Lens Music", 70], ["Lens Browser", 40], ["Discord", 85], ["System sounds", 50]].map(([n, v]) => `<div class="mix"><span>${n}</span><span class="fill"><i style="width:${v}%"></i></span><span class="v">${v}</span></div>`).join("")}`
            : `<b class="h">About</b><p>Lens UI 0.9 beta · open source (MIT). Every change undoes, even if Lens isn't running.</p>`;
      b.innerHTML = `<div class="a-set"><nav>${SEC.map((s) => `<button type="button" class="${s === sec ? "on" : ""}" data-sec="${s}">${s}</button>`).join("")}</nav><div class="pane">${body}</div></div>`;
    };
    render();
    desk.on("theme", ({ preview }) => { if (!preview && sec === "Appearance" && b.isConnected) render(); });
    b.addEventListener("click", (e) => {
      const s = e.target.closest("[data-sec]"); if (s) { sec = s.dataset.sec; render(); }
      const p = e.target.closest("[data-pack]"); if (p) desk.setPack(packs.find((x) => x.id === p.dataset.pack));
      const d = e.target.closest("[data-dock]"); if (d) desk.dockStyle(d.dataset.dock);
    });
  },
};

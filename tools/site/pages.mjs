// HTML for the hand-designed pages: Home (hero, live windows, feature tiles, trust, vision) and
// Download. Text lives here and in content/features.mjs; theme values come from the real packs.
import { esc } from "./lib/markdown.mjs";
import { WORKS_ON } from "./content/features.mjs";
import { REPO } from "./lib/layout.mjs";

const STYLES = [["floating", "Floating"], ["slim", "Slim"], ["taskbar", "Taskbar"], ["studio", "Studio"], ["minimal", "Minimal"], ["split", "Split"], ["islands", "Islands"]];
// The "All docks" strip: every dock style, plus the two shape styles (Expressive, Dot Matrix), which
// ship with their own packs and the Islands dock. 
const ALL_DOCKS = [
  { id: "floating", label: "Floating", style: "floating" },
  { id: "slim", label: "Slim", style: "slim" },
  { id: "taskbar", label: "Taskbar", style: "taskbar" },
  { id: "studio", label: "Studio", style: "studio" },
  { id: "minimal", label: "Minimal", style: "minimal" },
  { id: "split", label: "Split", style: "split" },
  { id: "islands", label: "Islands", style: "islands" },
  { id: "expressive", label: "Expressive", style: "islands", shape: "expressive", pack: "lens-expressive" },
  { id: "dotmatrix", label: "Dot Matrix", style: "islands", shape: "dotmatrix", pack: "lens-dot-matrix" },
];
// "Also in Lens": everything that isn't one of the four exhibits, as chips. pr: number = in beta
// (open pull request), "coming" = not built yet, null = in the beta build.
const ALSO = [
  ["voice", "Voice dock", "Hold a key and say “Lens, minimise this”; speech is recognised on your PC.", null],
  ["right-click", "Magic right-click", "One menu everywhere: summarise, translate, keep or send anything you right-click.", null],
  ["browser", "Browser agent", "Lens Browser can fill a form for you, and stops at a Needs your OK card before it submits.", null],
  ["snip", "Snip with auto-redact", "Capture, and Lens suggests blurring e-mails, keys and card numbers before you save.", null],
  ["shelf", "Shelf and context packs", "Collect selections, pages and files, then hand them to Claude as one tidy pack.", null],
  ["music", "Music with lyrics", "Now Playing in the dock and a mini player with synced lyrics.", null],
  ["guide", "Guide", "Ask “how do I…” and Lens shows you the exact setting.", null],
  ["settings", "Settings hub", "Search every Windows and Lens setting in one place.", null],
  ["windows", "Window focus", "Dim what you're not using; a gradient border on the window you are.", null],
  ["safety", "Agent safety", "AI tools get per-task permissions, an audit log and undo for every change.", null],
  ["feeds", "Feeds and messages", "Your feeds and chats in one inbox.", null],
  ["tester", "Tester Hub", "What changed, today's test plan and a one-click redacted report.", null],
];
// The Themes exhibit's quick picks (every pack is in the menu next to them).
const PICKS = ["obsidian", "nord-frost", "catppuccin-mocha", "tokyo-night", "gruvbox-warm", "rose-pine", "hyprland-neon", "alabaster-daylight", "lens-expressive", "cc-koi-mosaic"];
const ACCENTS = ["#FAFAFA", "#818CF8", "#38BDF8", "#34D399", "#FBBF24", "#FB923C", "#FB7185", "#C084FC"];
const ASKS = ["tile left and go dark", "open my launch plan", "play some music", "switch to Nord", "close Discord"];
const FEATURED = [
  { id: "artcraft", line: "An IDE for artists: controllable AI image and video, with 2D and 3D scene tools.", suite: ["wordcraft", "deckcraft", "gridcraft"] },
  { id: "concat", line: "A free, local-first video editor: a CapCut alternative with AI captions." },
  { id: "degenview", line: "TradingView-style charting in Rust. Charts and paper trading only.", tag: "charts and paper trading only" },
];
const RAIL = ["ollama", "obs-studio", "krita", "blender", "affine", "excalidraw"];
const HUE = ["#ff5f6d", "#ff9f43", "#e5b800", "#22c55e", "#0ea5e9", "#6366f1", "#a855f7"];

export function home({ visionHref, apps = {}, packs = [] }) {
  const byId = Object.fromEntries(packs.map((p) => [p.id, p]));
  const picks = PICKS.map((id) => byId[id]).filter(Boolean);
  return `
<section class="hero">
  <div class="inner">
    <p class="eyebrow center">Lens UI · open source · beta</p>
    <h1>The <span class="spectrum-text">everything</span> desktop.</h1>
    <p class="lede">The open-source desktop where look, apps and AI finally work as one.</p>
    <p class="support">macOS's docks, Linux's theming, a launcher like Raycast and an AI co-pilot, rebuilt as one open-source app for Windows.</p>
    <div class="actions"><a class="btn primary" href="download.html">Download</a><a class="btn" href="${REPO}">View on GitHub</a></div>
    <p class="trustline meta">Open source · off until you turn it on · every change undoes · local-first AI</p>
  </div>
  <div class="inner">
    <div class="stage" id="stage">
      <div class="stage-screen" id="stage-screen" aria-label="Live demo desktop with the real Lens dock">
        <img class="fallback" src="media/dock-magnify.webp" alt="The Lens dock: app icons on a glass bar" width="720" height="187">
        <iframe data-src="live/dock/index.html" title="Live Lens dock: hover and click the icons, or search"></iframe>
        <div class="toasts" aria-live="polite"></div>
        <p class="stage-tag meta">live UI · simulated system</p>
        <div class="fs-bar"><button class="pill" type="button" data-tour>▶ Take the tour</button><button class="pill" type="button" data-fs-exit>✕ Exit fullscreen <kbd>Esc</kbd></button></div>
      </div>
      <div class="pills" aria-label="Stage controls">
        <label class="pill"><span class="meta">Dock</span><select data-style aria-label="Dock style">${STYLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
        <label class="pill"><span class="meta">Shape</span><select data-shape aria-label="Shape style"><option value="classic">Classic</option><option value="expressive">Expressive</option><option value="dotmatrix">Dot Matrix</option></select></label>
        <label class="pill"><span class="meta">Theme</span><select data-theme aria-label="Theme pack"><option>Obsidian</option></select></label>
        <button class="pill primary-pill" type="button" data-search aria-expanded="false">Search in the dock</button>
        <span class="sp"></span>
        <button class="pill" type="button" data-tour>▶ Take the tour</button>
        <button class="pill" type="button" data-fs aria-pressed="false">⤢ Fullscreen</button>
      </div>
    </div>
  </div>
</section>

<section id="docks" aria-labelledby="docks-h">
  <div class="inner">
    <div class="head"><h2 id="docks-h">All docks, live.</h2><p>Each one is the real dock, rendered here. Pick one to put it on the stage.</p></div>
    <div class="docks" role="list">${ALL_DOCKS.map((d) => `<button type="button" class="dock-thumb" role="listitem" data-style="${d.style}"${d.shape ? ` data-shape="${d.shape}"` : ""}${d.pack ? ` data-pack="${d.pack}"` : ""} aria-label="Show the ${d.label} dock on the stage">
      <span class="thumb-screen"><iframe data-src="live/dock/index.html?style=${d.style}${d.shape ? `&amp;shape=${d.shape}` : ""}${d.pack ? `&amp;pack=${d.pack}` : ""}&amp;mag=off" title="${d.label} dock" tabindex="-1" aria-hidden="true"></iframe></span>
      <span class="thumb-label">${d.label}${d.beta ? ` <span class="dot warn" aria-hidden="true"></span><span class="sr">in beta</span>` : ""}</span></button>`).join("")}</div>
    <p class="meta" style="margin-top:10px">live UI · simulated system · every style is in the beta build</p>
  </div>
</section>

<section id="themes" aria-labelledby="themes-h">
  <div class="inner">
    <div class="head"><h2 id="themes-h">Every theme, live.</h2><p>80 packs, from Obsidian to the Claude Code community palettes. Pick one and the whole desktop restyles on its own moving backdrop.</p></div>
    <div class="exhibit" id="ex-themes">
      <div class="ex-screen"></div>
      <div class="ex-controls">
        <div class="picks" role="group" aria-label="Theme">${picks.map((p, i) => `<button type="button" data-pick="${p.id}" aria-pressed="${i === 0}"><span class="sw" style="background:${p.base ?? (p.scheme === "light" ? "#f4f4f5" : "#09090b")};box-shadow:inset 0 0 0 4px ${p.base ?? "#09090b"},inset 0 0 0 9px ${p.accent}"></span>${esc(p.label)}</button>`).join("")}<label class="more"><span class="sr">All themes</span><select data-allpacks aria-label="All themes"><option value="">All ${packs.length} themes…</option>${packs.map((p) => `<option value="${p.id}">${esc(p.label)}${p.collection ? " (community)" : ""}</option>`).join("")}</select></label></div>
        <div class="accents"><span class="meta" id="acc-l">Accent</span><div class="swatches" role="group" aria-labelledby="acc-l">${ACCENTS.map((a) => `<button type="button" data-accent="${a}" aria-label="Accent ${a}" aria-pressed="false" style="background:${a}"></button>`).join("")}</div>
          <button class="btn small" type="button" data-export>Download .lenstheme</button></div>
        <p class="meta" data-out aria-live="polite">live UI · simulated system</p>
      </div>
    </div>
  </div>
</section>

<section id="ai" aria-labelledby="ai-h">
  <div class="inner">
    <div class="head"><h2 id="ai-h">Ask Lens. Watch it work.</h2><p>Plain requests, understood on your PC. The orb shows every step, Esc stops it, and anything risky waits for your OK.</p></div>
    <div class="exhibit" id="ex-ai">
      <div class="ex-screen"></div>
      <div class="ex-controls">
        <form class="askbar" data-askform><label class="sr" for="ai-q">Ask Lens</label><img src="brand/lens-orb.webp" alt="" width="20" height="20"><input id="ai-q" name="q" type="text" placeholder="Lens, tile left and go dark…" autocomplete="off"><button class="btn small primary" type="submit">Ask</button></form>
        <div class="sugg" role="group" aria-label="Try">${ASKS.map((a) => `<button type="button" data-try="${esc(a)}">${esc(a)}</button>`).join("")}</div>
        <p class="meta">Offline intent engine (a port of Lens's own) · live UI · simulated system</p>
      </div>
    </div>
  </div>
</section>

<section id="apps" aria-labelledby="apps-h">
  <div class="inner">
    <div class="head"><h2 id="apps-h">Free and open-source apps, one click away.</h2><p>Lens Apps finds the official release, checks it and installs it when you say so. In the beta build.</p></div>
    <div class="exhibit" id="ex-apps">
      <div class="ex-screen"></div>
    </div>
    <div class="featured">${FEATURED.map((f) => appCard(f, apps)).join("")}</div>
    <div class="rail" role="list" aria-label="More picks">${RAIL.map((id) => railItem(id, apps)).join("")}</div>
    <p class="meta" style="margin-top:12px">Icons and screenshots come from each project's own repository, under that project's licence. Lens isn't affiliated with these projects.</p>
  </div>
</section>

<section id="also" aria-labelledby="also-h">
  <div class="inner">
    <div class="head"><h2 id="also-h">Also in Lens.</h2></div>
    <div class="also-chips" role="group" aria-label="More features">${ALSO.map(([id, t, line, pr], i) => `<button type="button" id="also-${id}" data-also="${id}" aria-pressed="${i === 0}" data-line="${esc(line)}" data-pr="${pr ?? ""}"><span class="dot${pr === "coming" ? "" : pr ? " warn" : " ok"}" aria-hidden="true"></span>${esc(t)}</button>`).join("")}</div>
    <p class="also-line" aria-live="polite">${esc(ALSO[0][2])}</p>
    <p class="meta"><span class="dot ok" aria-hidden="true"></span> in the beta build</p>
    <p class="coming"><strong>Coming next:</strong> Peek, Split view, Spaces, Routines and a phone companion.</p>
  </div>
</section>

<section id="best">
  <div class="inner">
    <div class="head"><h2>Built from the best.</h2><p>macOS's docks, Linux's theming, a launcher like Raycast and an AI co-pilot, rebuilt as one app for Windows. Inspired by, not affiliated with.</p></div>
    <ul class="best">
      <li><span class="dot" style="background:${HUE[0]}" aria-hidden="true"></span>Dock ideas from macOS and Plank</li>
      <li><span class="dot" style="background:${HUE[1]}" aria-hidden="true"></span>Theming from the Linux rice scene</li>
      <li><span class="dot" style="background:${HUE[3]}" aria-hidden="true"></span>Commands in the spirit of Raycast</li>
      <li><span class="dot" style="background:${HUE[4]}" aria-hidden="true"></span>An AI co-pilot on your PC, or with Claude, that asks before it acts</li>
      <li><span class="dot" style="background:${HUE[5]}" aria-hidden="true"></span>Free apps like ArtCraft and Concat in one click</li>
    </ul>
  </div>
</section>

<section id="trust">
  <div class="inner">
    <div class="head"><h2>Safe to try, easy to leave.</h2></div>
    <ul class="trust">
      <li><strong>Off until you turn it on</strong>New features ship disabled.</li>
      <li><strong>Every change undoes</strong>One button puts Windows back, even if Lens isn't running.</li>
      <li><strong>Games are left alone</strong>No injection, and overlays pause for full-screen apps.</li>
      <li><strong>Local first</strong>AI is opt-in and shows what it would send. No telemetry, no account.</li>
    </ul>
  </div>
</section>

<section id="vision">
  <div class="inner split">
    <div><h2>Where it's going</h2></div>
    <div><p class="lede" style="margin-top:0">One app instead of a dozen utilities: dock, launcher, themes, browser, apps and an AI co-pilot that works across all of them, with every step visible and undoable.</p><p><a href="${visionHref}">Read the vision</a></p></div>
  </div>
</section>`;
}

function appCard(f, apps) {
  const a = apps[f.id];
  if (!a) return "";
  const shot = a.files?.shot0, icon = a.files?.icon;
  const repo = a.repo ?? a.homepage;
  const suite = (f.suite ?? []).map((id) => apps[id]).filter(Boolean);
  return `<article class="app-card">
  ${shot ? `<figure><img src="media/apps/${shot}" alt="${esc(a.name)} screenshot" loading="lazy" width="1100" height="619"><figcaption class="meta">Screenshot from the <a href="${esc(repo)}">${esc(a.name)} repository</a> · ${esc(a.license)}</figcaption></figure>` : ""}
  <div class="app-body">
    <div class="app-title">${icon ? `<img src="media/apps/${icon}" alt="" width="40" height="40" loading="lazy">` : ""}<div><h3>${esc(a.name)}</h3><span class="meta">${esc(a.license)}${f.tag ? ` · ${esc(f.tag)}` : ""}</span></div>
      <button class="get-pill" type="button" data-get="${esc(a.name)}" aria-live="polite">Get</button></div>
    <p>${esc(f.line)}</p>
    ${suite.length ? `<div class="suite"><span class="meta">The Craft suite:</span>${suite.map((x) => `<a class="suite-item" href="${esc(x.homepage ?? "#")}">${x.files?.icon ? `<img src="media/apps/${x.files.icon}" alt="" width="20" height="20" loading="lazy">` : ""}${esc(x.name)}</a>`).join("")}<span class="meta">and more</span></div>` : ""}
  </div>
</article>`;
}

function railItem(id, apps) {
  const a = apps[id];
  if (!a) return "";
  const icon = a.files?.icon;
  return `<a class="rail-item" role="listitem" href="${esc(a.repo ?? a.homepage)}">${icon ? `<img src="media/apps/${icon}" alt="" width="32" height="32" loading="lazy">` : `<span class="mono-ic" style="--h:200">${esc(a.name[0])}</span>`}<span><strong>${esc(a.name)}</strong><span class="meta">${esc(a.license)}</span></span></a>`;
}

export function download({ log }) {
  return `
<section class="hero" style="text-align:left;padding-top:72px">
  <div class="inner">
    <h1 style="margin-left:0">Download</h1>
    <p class="lede" style="margin:0">Get the everything desktop. Lens is in beta and there's no signed installer yet, so for now you build it from source. It takes a few minutes.</p>
    <hr class="spectrum-line" aria-hidden="true" style="margin:26px 0 0">
  </div>
</section>
<section style="padding-top:48px">
  <div class="inner split">
    <div><h2>Build from source</h2><p style="color:var(--fg-2)">You need Windows 10 (1809 or newer) or 11, <a href="https://www.rust-lang.org/tools/install">Rust</a> and <a href="https://bun.sh">Bun</a>.</p></div>
    <div><pre><code>git clone ${REPO.toLowerCase()}
cd lensui
bun install
bun run tauri dev</code></pre>
    <p style="color:var(--fg-2)">Or double-click <code>Build-Lens-UI.bat</code> for a standalone build. If anything looks wrong, run <code>Restore-Windows-Taskbar.bat</code>.</p></div>
  </div>
</section>
<section id="releases" style="padding-top:56px">
  <div class="inner split">
    <div><h2>Releases</h2><p style="color:var(--fg-2)">Signed builds will appear on GitHub, with an updater that checks Lens's signing key.</p><p><a class="btn small" href="${REPO}/releases">GitHub Releases</a></p></div>
    <div><p class="meta" style="margin-bottom:8px">Recent changes</p><ul class="search-results">${log.slice(0, 8).map(([h, d, s]) => `<li><a href="${REPO}/commit/${h}">${esc(s.replace(/\s*\(#?\d+\)$/, ""))}<span>${esc(d)} · ${h}</span></a></li>`).join("")}</ul></div>
  </div>
</section>
<section id="works-on" style="padding-top:56px">
  <div class="inner">
    <div class="head"><h2>Works on</h2><p>Expected support, based on the Windows features each part uses. Testing on real machines is ongoing.</p></div>
    <div class="table"><table><thead><tr><th scope="col">Feature</th><th scope="col">Windows 10</th><th scope="col">Windows 11</th></tr></thead><tbody>${WORKS_ON.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join("")}</tbody></table></div>
  </div>
</section>`;
}

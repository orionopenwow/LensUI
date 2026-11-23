// HTML for the hand-designed pages: Home (hero, live windows, feature tiles, trust, vision) and
// Download. Text lives here and in content/features.mjs; theme values come from the real packs.
import { esc } from "./lib/markdown.mjs";
import { WORKS_ON } from "./content/features.mjs";
import { REPO } from "./lib/layout.mjs";

const STYLES = [["floating", "Floating"], ["slim", "Slim"], ["taskbar", "Taskbar"], ["studio", "Studio"], ["minimal", "Minimal"], ["split", "Split"], ["islands", "Islands"]];
// The "All docks" strip: every dock style, plus the two shape styles (Expressive, Dot Matrix), which
// ship with their own packs and the Islands dock. Islands/Expressive/Dot Matrix are in PR #32.
const ALL_DOCKS = [
  { id: "floating", label: "Floating", style: "floating" },
  { id: "slim", label: "Slim", style: "slim" },
  { id: "taskbar", label: "Taskbar", style: "taskbar" },
  { id: "studio", label: "Studio", style: "studio" },
  { id: "minimal", label: "Minimal", style: "minimal" },
  { id: "split", label: "Split", style: "split" },
  { id: "islands", label: "Islands", style: "islands", beta: 32 },
  { id: "expressive", label: "Expressive", style: "islands", shape: "expressive", pack: "lens-expressive", beta: 32 },
  { id: "dotmatrix", label: "Dot Matrix", style: "islands", shape: "dotmatrix", pack: "lens-dot-matrix", beta: 32 },
];
const ALSO = [
  ["Magic right-click", "One menu everywhere: summarise, translate, keep or send anything you right-click.", 19],
  ["Voice dock", "Hold a key and say “Lens, minimise this”; speech is recognised on your PC.", 23],
  ["Browser agent", "Lens Browser can fill a form for you, and stops at a Needs your OK card before it submits.", 20],
  ["Snip with auto-redact", "Capture, and Lens suggests blurring e-mails, keys and card numbers before you save.", 24],
  ["Shelf and context packs", "Collect selections, pages and files, then hand them to Claude as one tidy pack.", 19],
  ["Music with lyrics", "Now Playing in the dock and a mini player with synced lyrics.", 33],
  ["Feeds and messages", "Your feeds and chats in one inbox.", "coming"],
  ["Animated theme backdrops", "Every theme gets a slow, faint backdrop in its own colours.", 36],
  ["80 themes", "21 Lens packs plus 59 credited community palettes from the Claude Code theme scene.", 31],
  ["Settings hub", "Search every Windows and Lens setting in one place.", 35],
  ["See Lens at work", "When Lens or Claude controls your desktop, you watch every step and can stop it with Esc. Try “Watch Lens do it” on the stage.", "coming"],
  ["Agent safety", "AI tools get per-task permissions, an audit log and undo for every change.", 29],
  ["Tester Hub", "What changed, today's test plan and a one-click redacted report.", null],
];
const FEATURED = [
  { id: "artcraft", line: "An IDE for artists: controllable AI image and video, with 2D and 3D scene tools.", suite: ["wordcraft", "deckcraft", "gridcraft"] },
  { id: "concat", line: "A free, local-first video editor: a CapCut alternative with AI captions." },
  { id: "degenview", line: "TradingView-style charting in Rust. Charts and paper trading only.", tag: "charts and paper trading only" },
];
const RAIL = ["ollama", "obs-studio", "krita", "blender", "affine", "excalidraw"];
const HUE = ["#ff5f6d", "#ff9f43", "#e5b800", "#22c55e", "#0ea5e9", "#6366f1", "#a855f7"];

// The chips under the stage: one per feature. pane = live demo id or a recorded clip.
const CHIPS = [
  { id: "themes", label: "Themes", cap: "Start from any pack and download a theme file Lens can import.", hue: 0 },
  { id: "dock", label: "Dock", cap: "The real dock on your theme's ambient backdrop. Hover, click, search.", hue: 1 },
  { id: "windows", label: "Windows", cap: "Dim what you're not using; a gradient border on the window you are.", hue: 2 },
  { id: "command", label: "Command", cap: "Plain requests, understood offline with no AI model.", hue: 3 },
  { id: "ai", label: "AI", cap: "Anything risky waits for you. Deny, or press and hold to approve.", hue: 4 },
  { id: "voice", label: "Voice", cap: "“Lens, minimise this.” Push-to-talk, recognised on your PC.", hue: 5, beta: 23 },
  { id: "browser", label: "Browser", cap: "Spaces, vertical tabs and an agent that stops for your OK.", hue: 6, beta: 20 },
  { id: "snip", label: "Snip", cap: "Capture, blur what's private and paste to Claude before saving.", hue: 0, beta: 24 },
  { id: "shelf", label: "Shelf", cap: "Right-click anything to summarise it, translate it or keep it on the Shelf.", hue: 1, beta: 19 },
  { id: "music", label: "Music", cap: "Now playing in the dock, with controls one hover away.", hue: 2, beta: 33 },
  { id: "apps", label: "Apps", cap: "Free and open-source apps in one click. Lens downloads the official release.", hue: 3, beta: 34 },
  { id: "guide", label: "Guide", cap: "Ask “how do I…” and Lens shows you the exact setting.", hue: 5, beta: 18 },
];

const pane = (c, body, extra = "") => `<div class="pane pane-${c.id}" data-pane="${c.id}" data-title="${esc(c.label)}"${c.id === "dock" ? "" : " hidden"}>
  <div class="pane-body">${body}</div>
  <p class="pane-cap"><span class="tag meta">live UI · simulated system</span>${c.beta ? `<span class="meta"><span class="dot warn" aria-hidden="true"></span>in beta</span>` : ""}<span>${esc(c.cap)}</span>${extra}</p>
</div>`;

function panes() {
  const by = Object.fromEntries(CHIPS.map((c) => [c.id, c]));
  return [
    pane(by.dock, `<div class="backdrop" aria-hidden="true"></div><img class="fallback" src="media/dock-magnify.webp" alt="The Lens dock: app icons on a glass bar" width="720" height="187"><iframe data-src="live/dock/index.html" title="Live Lens dock: hover and click the icons"></iframe>`),
    pane(by.themes, `<div class="theme-lab">
        <div class="panel">
          <label>Pack<select data-pack><option>Catppuccin Mocha</option></select></label>
          <div><span class="meta" id="t-acc">Accent</span><div class="swatches" role="group" aria-labelledby="t-acc"></div></div>
          <label>Roundness <span class="meta" data-v="radius"></span><input type="range" name="radius" min="0" max="20" value="12"></label>
          <label>Glass <span class="meta" data-v="glass"></span><input type="range" name="glass" min="40" max="100" value="96"></label>
          <button class="btn small primary" type="button" data-export>Download .lenstheme</button>
          <p class="meta" data-out aria-live="polite"></p>
        </div>
        <div class="mini" aria-hidden="true">
          <div class="mw" style="left:7%;top:9%;width:52%;height:44%"><div class="tb"><i></i><i></i><i></i>Notes</div><div class="ct"><div class="ln" style="width:70%"></div><div class="ln"></div><div class="ln acc" style="width:30%"></div></div></div>
          <div class="mw active" style="left:34%;top:30%;width:58%;height:46%"><div class="tb"><i></i><i></i><i></i>Settings</div><div class="ct"><div class="ln" style="width:40%"></div><div class="ln" style="width:90%"></div><div class="ln" style="width:60%"></div><span class="bm">Apply</span></div></div>
          <div class="md"><b></b><b></b><b></b><b></b><b></b></div>
        </div>
      </div>`),
    pane(by.command, `<div class="cmd"><label class="sr" for="cmd-in">Type a request</label><input id="cmd-in" type="text" placeholder="dark mode, snap left, timer 10 min…" autocomplete="off">
        <div class="chips-s">${["dark mode", "snap left", "apply nord", "volume 40", "5 km in miles", "summarise this page"].map((x) => `<button type="button">${x}</button>`).join("")}</div>
        <div class="cmd-out" aria-live="polite"></div></div>`),
    pane(by.ai, `<div class="approve-stage"><div class="approve-tabs"><div class="seg" role="group" aria-label="Card type" data-variants>${["delete", "payment", "send", "click"].map((v, i) => `<button type="button" data-v="${v}" aria-pressed="${i === 0}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div></div><div data-card></div></div>`),
    pane(by.apps, `<div class="apps"><div class="seg" role="group" aria-label="Category" data-cat></div><div class="apps-grid"></div></div>`),
    ...["windows", "voice", "browser", "snip", "shelf", "music", "guide"].map((id) => pane(by[id], "")),
  ].join("\n");
}

export function home({ visionHref, apps = {} }) {
  const chips = CHIPS.map((c, i) => `<button type="button" role="tab" id="chip-${c.id}" data-pane="${c.id}" aria-controls="stage-screen" aria-selected="${c.id === "dock"}" tabindex="${c.id === "dock" ? 0 : -1}"><span class="dot" style="background:${HUE[c.hue]}" aria-hidden="true"></span>${c.label}${c.beta ? `<span class="beta">beta</span>` : ""}</button>`).join("");
  return `
<section class="hero">
  <div class="inner">
    <p class="eyebrow center">Lens UI · open source · beta</p>
    <h1>The <span class="spectrum-text">everything</span> desktop.</h1>
    <p class="lede">The open-source desktop where look, apps and AI finally work as one.</p>
    <div class="actions"><a class="btn primary" href="download.html">Download</a><a class="btn" href="${REPO}">View on GitHub</a></div>
    <p class="trustline meta">Open source · off until you turn it on · every change undoes · local-first AI</p>
  </div>
  <div class="inner">
    <div class="stage on-dock" id="stage">
      <div class="stage-screen" id="stage-screen" role="tabpanel" aria-labelledby="chip-dock" tabindex="-1">
        ${panes()}
        <div class="toasts" aria-live="polite"></div>
      </div>
      <div class="pills" aria-label="Stage controls">
        <label class="pill"><span class="meta">Dock</span><select data-style aria-label="Dock style">${STYLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
        <label class="pill"><span class="meta">Shape</span><select data-shape aria-label="Shape style"><option value="classic">Classic</option><option value="expressive">Expressive</option><option value="dotmatrix">Dot Matrix</option></select></label>
        <label class="pill"><span class="meta">Theme</span><select data-theme aria-label="Theme pack"><option>Obsidian</option></select></label>
        <label class="pill"><span class="meta">Backdrop</span><select data-scene aria-label="Backdrop scene"><option>Theme backdrop</option></select></label>
        <form class="pill ask" data-askform><label class="meta" for="ask-q">Ask</label><input id="ask-q" name="q" type="text" placeholder="go dark and slim dock…" autocomplete="off"><button type="submit" class="go" aria-label="Run">↵</button></form>
        <button class="pill" type="button" data-voice><span class="meta">Voice</span>try a phrase</button>
        <button class="pill" type="button" data-search><span class="meta">Search</span>in the dock</button>
        <button class="pill watch-lens" type="button" data-watch><img src="brand/lens-orb.webp" alt="" width="16" height="16">Watch Lens do it</button>
      </div>
    </div>
    <div class="chips" id="chips" role="tablist" aria-label="What Lens does">${chips}</div>
  </div>
</section>

<section id="docks" aria-labelledby="docks-h">
  <div class="inner">
    <div class="head"><h2 id="docks-h">All docks, live.</h2><p>Each one is the real dock, rendered here. Pick one to put it on the stage.</p></div>
    <div class="docks" role="list">${ALL_DOCKS.map((d) => `<button type="button" class="dock-thumb" role="listitem" data-style="${d.style}"${d.shape ? ` data-shape="${d.shape}"` : ""}${d.pack ? ` data-pack="${d.pack}"` : ""} aria-label="Show the ${d.label} dock on the stage">
      <span class="thumb-screen"><iframe data-src="live/dock/index.html?style=${d.style}${d.shape ? `&amp;shape=${d.shape}` : ""}${d.pack ? `&amp;pack=${d.pack}` : ""}&amp;mag=off" title="${d.label} dock" tabindex="-1" aria-hidden="true"></iframe></span>
      <span class="thumb-label">${d.label}${d.beta ? ` <span class="dot warn" aria-hidden="true"></span><span class="sr">in beta</span>` : ""}</span></button>`).join("")}</div>
    <p class="meta" style="margin-top:10px">live UI · simulated system · <span class="dot warn" aria-hidden="true"></span> in beta (pull request #32)</p>
  </div>
</section>

<section id="apps" aria-labelledby="apps-h">
  <div class="inner">
    <div class="head"><h2 id="apps-h">Free and open-source apps, one click away.</h2><p>Lens Apps finds the official release, checks it and installs it when you say so. <span class="dot warn" aria-hidden="true"></span> in beta (pull request #34).</p></div>
    <div class="featured">${FEATURED.map((f) => appCard(f, apps)).join("")}</div>
    <div class="rail" role="list" aria-label="More picks">${RAIL.map((id) => railItem(id, apps)).join("")}</div>
    <p class="meta" style="margin-top:12px">Icons and screenshots come from each project's own repository, under that project's licence. Lens isn't affiliated with these projects.</p>
  </div>
</section>

<section id="also" aria-labelledby="also-h">
  <div class="inner">
    <div class="head"><h2 id="also-h">Also in Lens.</h2></div>
    <div class="also">${ALSO.map(([t, line, pr]) => `<details><summary>${pr === "coming" ? `<span class="dot" aria-hidden="true"></span>` : pr ? `<span class="dot warn" aria-hidden="true"></span>` : `<span class="dot ok" aria-hidden="true"></span>`}${esc(t)}${pr === "coming" ? ` <span class="meta">coming</span>` : ""}</summary><p>${esc(line)}${typeof pr === "number" ? ` <a href="${REPO}/pull/${pr}">In beta · #${pr}</a>` : ""}</p></details>`).join("")}</div>
    <p class="meta" style="margin-top:14px"><span class="dot ok" aria-hidden="true"></span> in the beta build · <span class="dot warn" aria-hidden="true"></span> in beta (open pull request) · <span class="dot" aria-hidden="true"></span> coming</p>
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

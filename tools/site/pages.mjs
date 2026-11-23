// HTML for the hand-designed pages: Home (hero, live windows, feature tiles, trust, vision) and
// Download. Text lives here and in content/features.mjs; theme values come from the real packs.
import { esc } from "./lib/markdown.mjs";
import { WORKS_ON } from "./content/features.mjs";
import { REPO } from "./lib/layout.mjs";

const STYLES = [["floating", "Floating"], ["slim", "Slim"], ["taskbar", "Taskbar"], ["studio", "Studio"], ["minimal", "Minimal"], ["split", "Split"]];
const HUE = ["#ff5f6d", "#ff9f43", "#e5b800", "#22c55e", "#0ea5e9", "#6366f1", "#a855f7"];

const win = (title, tools, body, { demo, id, cls = "" } = {}) => `<div class="win ${cls}"${demo ? ` data-demo="${demo}"` : ""}${id ? ` id="${id}"` : ""}>
  <div class="win-bar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="title">${title}</span>${tools ? `<div class="tools">${tools}</div>` : ""}</div>
  <div class="win-body">${body}</div>
</div>`;
const caption = (hue, text) => `<p class="caption"><span class="dot" style="background:${hue}" aria-hidden="true"></span><span>${text}</span></p>`;

const TILES = [
  { id: "voice", title: "Voice", line: "“Lens, minimise this.” Push-to-talk, recognised on your PC.", clip: "voice", link: ["docs/voice-control.html", "How it works"], pr: 23 },
  { id: "shelf", title: "Shelf + right-click", line: "Save any selection in one key. Right-click anything to summarise, translate or keep it.", clip: "right-click", link: ["docs/right-click-everything.html", "How it works"] },
  { id: "snip", title: "Snip", line: "Capture, blur what's private and paste to Claude before anything is saved.", clip: "snip", pr: 24 },
  { id: "browser", title: "Browser", line: "Spaces, vertical tabs and an agent that stops for your OK.", clip: "browser-agent", link: ["docs/browser-and-approvals.html", "How it works"], pr: 20 },
  { id: "music", title: "Music", line: "Now playing in the dock, with controls one hover away.", clip: "music", link: ["docs/settings-reference.html#dock-top-bar", "Settings"] },
  { id: "guide", title: "Guide", line: "Ask “how do I…” and Lens shows you the exact setting.", clip: "guide", link: ["docs/first-five-minutes.html", "First lesson"], pr: 18 },
];

export function home({ clips, visionHref, nebula = "brand/nebula.webp" }) {
  const has = (id) => clips.some((c) => c.id === id);
  const tiles = TILES.map((t, i) => `<article class="tile" id="${t.id}"${has(t.clip) ? ` data-clip="${t.clip}"` : ""}>
  ${has(t.clip) ? `<div class="peek"><img src="media/${t.clip}.webp" alt="" loading="lazy" width="480" height="210"></div>` : ""}
  <div class="t"><h3><span class="dot" style="background:${HUE[i % HUE.length]}" aria-hidden="true"></span>${esc(t.title)}</h3><p>${esc(t.line)}</p>
  <div class="more">${t.link ? `<a href="${t.link[0]}">${t.link[1]}</a>` : t.pr ? `<a href="${REPO}/pull/${t.pr}">In development</a>` : "<span></span>"}${has(t.clip) ? `<button class="peek-btn" type="button" aria-pressed="false" aria-label="play clip: ${esc(t.title)}">play clip</button>` : ""}</div></div>
</article>`).join("\n");

  return `
<section class="hero">
  <div class="inner">
    <div class="hero-logo" data-logo data-nebula="${nebula}"><img class="poster" src="brand/lens-logo.svg" alt="Lens logo: a silver lens holding a rainbow nebula" width="196" height="196" fetchpriority="high"></div>
    <h1>A <span class="spectrum-text">calmer</span> desktop for Windows.</h1>
    <p class="lede">A dock, themes that restyle everything, and an AI helper that asks first. Quit Lens and Windows is exactly as you left it.</p>
    <div class="actions"><a class="btn primary" href="download.html">Download</a><a class="btn" href="${REPO}">View on GitHub</a></div>
    <hr class="spectrum-line" aria-hidden="true">
  </div>
</section>

<section id="demos" aria-label="Live demos">
  <div class="inner windows">
    <div class="wslot" id="dock">
      ${win("lens — dock", `<label class="sr" for="d-style">Dock style</label><select id="d-style" data-style>${STYLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select><label class="sr" for="d-pack">Theme pack</label><select id="d-pack" data-pack><option>Obsidian</option></select><button class="btn small" type="button" data-search>Search</button>`,
        `<div class="dock-screen"><span class="status meta"><span class="dot ok" aria-hidden="true"></span><span data-status>loading</span></span><img class="fallback" src="media/dock-magnify.webp" alt="The Lens dock: app icons on a dark glass bar" width="720" height="187"><iframe data-src="live/dock/index.html" title="Live Lens dock: hover and click the icons" loading="lazy"></iframe></div>`,
        { demo: "dock" })}
      ${caption(HUE[0], "The real dock component. Hover, click, pick a style or a theme pack. Nothing launches.")}
    </div>
    <div class="wslot w7" id="themes">
      ${win("theme-lab.lenstheme", "", `<div class="theme-lab">
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
      </div>`, { demo: "themes" })}
      ${caption(HUE[2], "Start from any of the 18 packs and download a theme file Lens can import.")}
    </div>
    <div class="wslot w5 lift" id="command">
      ${win("lens — command", "", `<div class="cmd"><label class="sr" for="cmd-in">Type a request</label><input id="cmd-in" type="text" placeholder="dark mode, snap left, timer 10 min…" autocomplete="off">
        <div class="chips">${["dark mode", "snap left", "apply nord", "volume 40", "5 km in miles", "summarise this page"].map((x) => `<button type="button">${x}</button>`).join("")}</div>
        <div class="cmd-out" aria-live="polite"></div></div>`, { demo: "command" })}
      ${caption(HUE[4], "Lens Command understands plain requests offline, with no AI model.")}
    </div>
    <div class="wslot w7" id="approvals">
      ${win("needs your ok", "", `<div class="approve-stage"><div class="approve-tabs"><div class="seg" role="group" aria-label="Card type" data-variants>${["delete", "payment", "send", "click"].map((v, i) => `<button type="button" data-v="${v}" aria-pressed="${i === 0}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div></div><div data-card></div></div>`, { demo: "approvals" })}
      ${caption(HUE[5], "Anything risky waits for you. Deny, or press and hold to approve.")}
    </div>
    <div class="wslot w5 lift" id="sand">
      ${win("playground — falling sand", `<div class="seg" role="group" aria-label="Material" data-mats>${[["sand", "Sand"], ["water", "Water"], ["plant", "Vine"], ["eraser", "Erase"]].map(([v, l], i) => `<button type="button" data-mat="${v}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div><button class="btn small" type="button" data-clear>Clear</button>`,
        `<div class="sand-stage" tabindex="0" role="application" aria-label="Falling sand. Drag to paint, or use the arrow keys and Space."></div>`, { demo: "sand" })}
      ${caption(HUE[3], "A wallpaper you can play with. Drag to paint.")}
    </div>
  </div>
</section>

<section id="more">
  <div class="inner">
    <div class="head"><h2>And the rest of the desktop.</h2><p>Hover a tile for a short clip.</p></div>
    <div class="tiles">${tiles}</div>
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
    <div><p class="lede" style="margin-top:0">One desktop instead of a dozen utilities: the dock, the browser and one helper working together, with every step you can see and undo.</p><p><a href="${visionHref}">Read the vision</a></p></div>
  </div>
</section>`;
}

export function download({ log }) {
  return `
<section class="hero" style="text-align:left;padding-top:72px">
  <div class="inner">
    <h1 style="margin-left:0">Download</h1>
    <p class="lede" style="margin:0">Lens is in beta. There's no signed installer yet, so for now you build it from source. It takes a few minutes.</p>
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

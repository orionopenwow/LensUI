// HTML for the hand-designed pages: Home (hero, live windows, feature tiles, trust, vision) and
// Download. Text lives here and in content/features.mjs; theme values come from the real packs.
import { esc } from "./lib/markdown.mjs";
import { WORKS_ON } from "./content/features.mjs";
import { REPO } from "./lib/layout.mjs";

// The scenes the hero desk plays (ids from docs/site/js/scenes.js), as the feature index under it.
const FEATURE_CHIPS = [
  ["magic-right-click", "Magic right-click"], ["claude", "Bring your own agent"], ["ade", "Agents at a glance"], ["approvals", "Asks before it acts"],
  ["browser-ai", "Lens Browser"], ["music", "Lens Music"], ["messages", "Messages and feeds"], ["mini", "Lens Mini"], ["snip", "Snip"], ["voice", "Voice dock"],
  ["cleaner", "Lens Cleaner"], ["sky", "Living Sky"], ["core-apps", "Core apps"], ["settings", "Settings hub"], ["backdrops", "Backdrop Lab"], ["tiling", "Tiling and snapping"], ["apps", "Lens Apps"], ["everyday", "Lens Command"],
];
const FEATURED = [
  { id: "artcraft", line: "An IDE for artists: controllable AI image and video, with 2D and 3D scene tools.", suite: ["wordcraft", "deckcraft", "gridcraft"] },
  { id: "concat", line: "A free, local-first video editor: a CapCut alternative with AI captions." },
  { id: "degenview", line: "TradingView-style charting in Rust. Charts and paper trading only.", tag: "charts and paper trading only" },
];
const RAIL = ["ollama", "obs-studio", "krita", "blender", "affine", "excalidraw"];
const GH = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.86v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>`;
// Original OS glyphs (not the vendors' logos): a four-pane window, the ⌘ key, a penguin.
export const OS_ICON = {
  windows: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="3" y="3" width="8.4" height="8.4" rx="1.4"/><rect x="12.6" y="3" width="8.4" height="8.4" rx="1.4"/><rect x="3" y="12.6" width="8.4" height="8.4" rx="1.4"/><rect x="12.6" y="12.6" width="8.4" height="8.4" rx="1.4"/></svg>`,
  mac: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15zm0 0v6m0 0h2.5a2.5 2.5 0 1 1-2.5 2.5V15zm0 0H9m0 0v2.5A2.5 2.5 0 1 1 6.5 15H9z"/></svg>`,
  linux: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.5c-2.6 0-4 2.2-4 5 0 1.3.3 2.3-.6 3.7C6.2 13 5 14.8 5 17c0 1 .3 1.8.8 2.4-.9.4-1.3 1-1 1.6.4.8 2 .7 3.4.4.9.4 2.2.6 3.8.6s2.9-.2 3.8-.6c1.4.3 3 .4 3.4-.4.3-.6-.1-1.2-1-1.6.5-.6.8-1.4.8-2.4 0-2.2-1.2-4-2.4-5.8-.9-1.4-.6-2.4-.6-3.7 0-2.8-1.4-5-4-5zm-1.6 4.2c.5 0 .8.5.8 1.1s-.3 1.1-.8 1.1-.8-.5-.8-1.1.3-1.1.8-1.1zm3.2 0c.5 0 .8.5.8 1.1s-.3 1.1-.8 1.1-.8-.5-.8-1.1.3-1.1.8-1.1zM12 9.6c.9 0 1.9.5 1.9.9 0 .5-1 1.1-1.9 1.1s-1.9-.6-1.9-1.1c0-.4 1-.9 1.9-.9zM9.3 13.5c.8.7 1.7 1 2.7 1s1.9-.3 2.7-1c.8 1.2 1.3 2.4 1.3 3.6 0 2-1.7 2.8-4 2.8s-4-.8-4-2.8c0-1.2.5-2.4 1.3-3.6z"/></svg>`,
};
export const fmtStars = (n) => (n == null ? "" : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export function home({ visionHref, apps = {}, packs = [], stars = null }) {
  void packs;
  return `
<section class="hero" aria-labelledby="hero-h">
  <div class="inner hero-copy">
    <span class="hero-logo hero-mark" data-logo data-speed="0.8" data-site="./"><img class="poster" src="brand/lens-logo.svg" alt="The Lens logo: a silver lens holding a rainbow nebula" width="144" height="144" fetchpriority="high"></span>
    <p class="hero-pill"><span class="dot ok" aria-hidden="true"></span>Open source · in beta</p>
    <h1 id="hero-h">The <span class="lens-rainbow">everything</span> desktop.</h1>
    <p class="lede">The open-source desktop where look, apps and AI finally work as one.</p>
    <div class="actions">
      <a class="btn primary big hero-dl" data-dl href="download.html"><span class="lbl">Download</span><span class="hint">Windows 10 &amp; 11 · free</span></a>
      <a class="btn ghost big" href="${REPO}">${GH}<span>View on GitHub</span>${stars != null ? `<span class="stars" aria-label="${stars} stars">★ ${fmtStars(stars)}</span>` : ""}</a>
    </div>
    <p class="os-row"><span class="os on">${OS_ICON.windows}Windows 10 &amp; 11</span><span class="os-sep" aria-hidden="true"></span><a class="os" href="download.html#platforms">${OS_ICON.mac}${OS_ICON.linux}macOS &amp; Linux on the roadmap</a></p>
  </div>
  <div class="stage-wrap">
    <div class="stage" id="stage">
      <div id="desk-host" class="desk-host"></div>
      <div class="scene-cap" id="scene-cap" aria-live="polite"></div>
      <div class="driving" id="driving" hidden><span class="dot ok" aria-hidden="true"></span>You're driving<button type="button" class="pill">▶ Resume tour</button></div>
      <div class="scenebar" id="scenes" role="group" aria-label="Scenes">
        <button type="button" class="sb-btn" data-prev aria-label="Previous scene"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button type="button" class="sb-btn sb-play" data-play aria-label="Play the scenes">▶</button>
        <button type="button" class="sb-btn" data-next aria-label="Next scene"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
        <div class="sb-list" id="features" tabindex="-1"></div>
        <button type="button" class="sb-btn sb-fs" data-fs aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg><span class="lbl">Fullscreen</span></button>
        <span class="sb-prog" aria-hidden="true"><i></i></span>
      </div>
    </div>
    <div class="docks-row" id="docks" aria-labelledby="docks-h">
      <div class="dr-head"><h2 id="docks-h" class="h-sm">Nine docks</h2><p id="dock-info" class="dr-info" aria-live="polite"></p>
        <span class="dr-nav"><button type="button" class="sb-btn" data-rail-prev aria-label="Scroll the docks left"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><button type="button" class="sb-btn" data-rail-next aria-label="Scroll the docks right"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></span></div>
      <div class="dock-rail" id="dock-rail" role="radiogroup" aria-labelledby="docks-h"></div>
    </div>
  </div>
</section>

<section id="themes" class="sec" aria-labelledby="themes-h">
  <div class="inner">
    <div class="head"><h2 id="themes-h">Every theme, live.</h2><p>${packs.length || 89} packs, from Obsidian and the living Sky to the Claude Code community palettes. Point at one to preview it, click to keep it, drag an accent onto the desk, or press <kbd>T</kbd> to shuffle.</p></div>
    <div class="lab">
      <div id="lab-desk" class="desk-host"></div>
      <aside class="lab-side" aria-label="Theme controls">
        <div class="lab-picks" role="group" aria-label="Themes"></div>
        <div class="lab-row"><button type="button" class="btn small" data-all aria-expanded="false" aria-controls="lab-pop">All ${packs.length || 80} themes…</button><button type="button" class="btn small" data-shuffle>Shuffle <kbd>T</kbd></button></div>
        <div class="lab-pop" id="lab-pop" role="dialog" aria-label="All themes" hidden><label class="sr" for="lab-q">Search themes</label><input id="lab-q" type="search" placeholder="Search ${packs.length || 89} themes…"><div class="grid"></div></div>
        <p class="lab-label" id="acc-l">Accent <span>click, or drag onto the desk</span></p>
        <div class="lab-acc" role="group" aria-labelledby="acc-l"></div>
        <div class="lab-row"><button type="button" class="btn small" data-export>Download .lenstheme</button></div>
        <p class="lab-now" aria-live="polite"></p>
      </aside>
    </div>
  </div>
</section>

<section id="byo" class="sec" aria-labelledby="byo-h">
  <div class="inner">
    <div class="byo">
      <div class="byo-copy">
        <h2 id="byo-h">Bring your own agent.</h2>
        <p>Claude, a model on your PC, or any MCP client can see your desktop and change it through Lens. Each risky step shows a card first, Esc stops it, and every change undoes.</p>
        <p class="byo-try"><button type="button" class="btn primary" data-play-scene="claude">▶ Watch Claude tidy the desk</button></p>
        <div class="feat-chips" role="group" aria-label="See it on the desk">${["ade", "approvals", "browser-ai", "messages"].map((id) => FEATURE_CHIPS.find(([x]) => x === id)).map(([id, t]) => `<button type="button" data-scene-id="${id}">${esc(t)} ↑</button>`).join("")}</div>
      </div>
      <div class="byo-card">
        <div class="byo-tabs" id="byo-tabs" role="tablist" aria-label="Agent">
          <button type="button" role="tab" id="byo-t1" aria-selected="true" aria-controls="byo-p1">Claude</button>
          <button type="button" role="tab" id="byo-t2" aria-selected="false" aria-controls="byo-p2" tabindex="-1">Local model</button>
          <button type="button" role="tab" id="byo-t3" aria-selected="false" aria-controls="byo-p3" tabindex="-1">Any MCP agent</button>
        </div>
        <div class="byo-panel" role="tabpanel" id="byo-p1" aria-labelledby="byo-t1">
          <p class="step"><b>Connect</b> Settings › AI shows a ready-made snippet for Claude Desktop or Claude Code. Lens runs as an MCP server over stdio:</p>
          <pre><code>"lens-ui": { "command": "lens-ui.exe", "args": ["--mcp-stdio"] }</code></pre>
          ${CAN}
        </div>
        <div class="byo-panel" role="tabpanel" id="byo-p2" aria-labelledby="byo-t2" hidden>
          <p class="step"><b>Connect</b> Point Lens at any OpenAI-compatible server on this PC. It finds Ollama, LM Studio and llama.cpp on their usual ports by itself.</p>
          <pre><code>Settings › AI › Provider: Local model · http://127.0.0.1:11434</code></pre>
          ${CAN}
        </div>
        <div class="byo-panel" role="tabpanel" id="byo-p3" aria-labelledby="byo-t3" hidden>
          <p class="step"><b>Connect</b> Any Model Context Protocol client can start <code>lens-ui.exe --mcp-stdio</code>. Each connection is rate-limited and logged.</p>
          <pre><code>lens-ui.exe --mcp-stdio</code></pre>
          ${CAN}
        </div>
        <p class="byo-note">In beta: the approval cards and the audit log are in. Automatic checks of pages and screenshots for hidden instructions are still being connected to every agent path.</p>
      </div>
    </div>
  </div>
</section>

<section id="apps" class="sec" aria-labelledby="apps-h">
  <div class="inner">
    <div class="head"><h2 id="apps-h">Free and open-source apps, one click away.</h2><p>Lens Apps finds the official release, checks it and installs it when you say so.</p></div>
    <div class="featured">${FEATURED.map((f) => appCard(f, apps)).join("")}</div>
    <div class="rail" role="list" aria-label="More picks">${RAIL.map((id) => railItem(id, apps)).join("")}</div>
    <p class="fine">Icons and screenshots come from each project's own repository, under that project's licence. Lens isn't affiliated with these projects.</p>
  </div>
</section>

<section id="more" class="sec" aria-labelledby="more-h">
  <div class="inner">
    <div class="head"><h2 id="more-h">Everything else, on the desk.</h2><p>Every feature plays as a short scene in the desktop at the top. Pick one.</p></div>
    <div class="feat-chips big" role="group" aria-label="Scenes">${FEATURE_CHIPS.map(([id, t]) => `<button type="button" data-scene-id="${id}">${esc(t)}</button>`).join("")}</div>
    <p class="fine">Coming next: Peek, Split view, Spaces, Routines and a phone companion.</p>
  </div>
</section>

<section id="trust" class="sec" aria-labelledby="trust-h">
  <div class="inner">
    <div class="head"><h2 id="trust-h">Safe to try, easy to leave.</h2></div>
    <ul class="trust">
      <li><strong>Off until you turn it on</strong>New features ship disabled.</li>
      <li><strong>Every change undoes</strong>One button puts Windows back, even if Lens isn't running.</li>
      <li><strong>Games are left alone</strong>Overlays pause for full-screen apps and games.</li>
      <li><strong>Local first</strong>AI is opt-in and shows what it would send. No telemetry, no account.</li>
    </ul>
    <p class="vision-line">One app instead of a dozen utilities: dock, launcher, themes, browser, apps and an AI co-pilot that works across all of them. <a href="${visionHref}">Read the vision</a></p>
  </div>
</section>`;
}
const CAN = `<ul class="can">${[["Windows", "move, snap, arrange"], ["Look", "themes, docks, backdrops"], ["Apps", "open, switch, install"], ["Browser", "read, summarise"], ["Files", "with approval"]].map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join("")}</ul><p class="promise">Every risky action asks you first. Esc stops it. Everything undoes.</p>`;

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

export function download({ log, stars = null }) {
  return `
<section class="hero dl-hero" aria-labelledby="dl-h">
  <div class="inner">
    <h1 id="dl-h">Get the <span class="lens-rainbow">everything</span> desktop.</h1>
    <p class="lede">Lens is a shell for Windows 10 and 11. It's in beta: there's no signed installer yet, so for now you build it from source in a few minutes.</p>
  </div>
</section>
<section id="platforms" class="sec tight" aria-labelledby="pl-h">
  <div class="inner">
    <h2 id="pl-h" class="sr">Platforms</h2>
    <div class="platforms">
      <article class="plat on">
        <div class="plat-h">${OS_ICON.windows}<h3>Windows 10 &amp; 11</h3><span class="tag ok">Beta</span></div>
        <p>Windows 10 (1809 or newer) or 11. You need <a href="https://www.rust-lang.org/tools/install">Rust</a> and <a href="https://bun.sh">Bun</a>.</p>
        <pre><code>git clone ${REPO.toLowerCase()}
cd lensui
bun install
bun run tauri dev</code></pre>
        <p class="fine">Or double-click <code>Build-Lens-UI.bat</code> for a standalone build. If anything looks wrong, run <code>Restore-Windows-Taskbar.bat</code>. Signed installers and a winget package will appear on <a href="${REPO}/releases">GitHub Releases</a>.</p>
      </article>
      <article class="plat">
        <div class="plat-h">${OS_ICON.mac}<h3>macOS</h3><span class="tag">On the roadmap</span></div>
        <p>Not available yet. Lens's dock, windows and system features are built on Windows APIs. The code compiles on macOS in CI, but there's no Mac shell to run.</p>
        <p><a class="btn small" href="${REPO}/releases">${"Watch releases on GitHub"}</a></p>
      </article>
      <article class="plat">
        <div class="plat-h">${OS_ICON.linux}<h3>Linux</h3><span class="tag">On the roadmap</span></div>
        <p>Not available yet, for the same reason. The code compiles on Ubuntu in CI; a Linux shell (GNOME or KDE) would be a separate port.</p>
        <p><a class="btn small" href="${REPO}/releases">${"Watch releases on GitHub"}</a></p>
      </article>
    </div>
    <h3 class="sub-h">What works where today</h3>
    <div class="table"><table><thead><tr><th scope="col">Part</th><th scope="col">Windows</th><th scope="col">macOS</th><th scope="col">Linux</th></tr></thead><tbody>
      <tr><td>Lens app: dock, top bar, Command, browser, apps, AI</td><td>Beta</td><td>Not yet</td><td>Not yet</td></tr>
      <tr><td>Theme files (<code>.lenstheme</code>)</td><td>Import and export</td><td colspan="2">Plain JSON you can keep and share; nothing reads them there yet</td></tr>
      <tr><td>This website's live demo and Theme lab</td><td colspan="3">Any modern browser</td></tr>
    </tbody></table></div>
  </div>
</section>
<section id="releases" class="sec tight" aria-labelledby="rel-h">
  <div class="inner split">
    <div><h2 id="rel-h">Releases</h2><p class="muted">Signed builds will appear on GitHub, with an updater that checks Lens's signing key.</p><p><a class="btn small" href="${REPO}/releases">GitHub Releases</a>${stars != null ? ` <span class="fine">★ ${fmtStars(stars)} on GitHub</span>` : ""}</p></div>
    <div><p class="label">Recent changes</p><ul class="search-results">${log.slice(0, 8).map(([h, d, s]) => `<li><a href="${REPO}/commit/${h}">${esc(s.replace(/\s*\(#?\d+\)$/, ""))}<span>${esc(d)} · ${h}</span></a></li>`).join("")}</ul></div>
  </div>
</section>
<section id="works-on" class="sec tight" aria-labelledby="wo-h">
  <div class="inner">
    <div class="head"><h2 id="wo-h">Windows 10 or 11</h2><p>Expected support, based on the Windows features each part uses. Testing on real machines is ongoing.</p></div>
    <div class="table"><table><thead><tr><th scope="col">Feature</th><th scope="col">Windows 10</th><th scope="col">Windows 11</th></tr></thead><tbody>${WORKS_ON.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join("")}</tbody></table></div>
  </div>
</section>`;
}

// HTML for the hand-designed pages: Home (hero desk, one section per idea with a real exhibit) and
// Download. Text lives here and in content/features.mjs; theme values come from the real packs.
import { esc } from "./lib/markdown.mjs";
import { WORKS_ON } from "./content/features.mjs";
import { REPO } from "./lib/layout.mjs";
import { readFileSync } from "node:fs";
// Ollama's mark from Simple Icons (CC0), credited in THIRD_PARTY_NOTICES.md.
const OLLAMA = readFileSync(new URL("./vendor/simple-icons/ollama.svg", import.meta.url), "utf8").replace(/<title>[^<]*<\/title>/, "").replace("<svg ", '<svg fill="currentColor" aria-hidden="true" ');


// The magic right-click exhibit's steps: [scene of the real magic window, label, what it shows].
const MAGIC_STEPS = [
  ["link", "It knows what you clicked", "A link, so: link actions"],
  ["summary", "Summarise", "The answer, in the same window"],
  ["transcript", "Get the transcript", "From a video page"],
  ["shelf", "Save to your Shelf", "With Undo"],
  ["ask", "Ask Lens", "About the text you selected"],
  ["approval", "Send to Claude", "Waits for your OK"],
];
// Scenes of the real BrowserSurface (tools/parity/browser/entry.tsx).
const BROWSER_STEPS = [
  ["agent", "AI beside the page", "It works; you watch each step"],
  ["frame", "One slim bar", "Tabs at the side, the page gets the room"],
  ["address", "One box", "Sites, tabs and actions together"],
  ["transcript", "Transcripts", "Search a video like a page"],
  ["approval", "Needs your OK", "Before it submits or sends"],
];
const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// What is on main today (docs/LENS_BROWSER.md, src/browser).
const WHY_BROWSER = [
  [S('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>'), "One slim bar", "Tabs and spaces live in the sidebar. The page gets the room."],
  [S('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>'), "AI beside the page", "A side panel with your own model. Turn AI off and it's off."],
  [S('<path d="M4 6h16M4 12h10M4 18h13"/>'), "Transcripts", "Any YouTube video becomes text you can search and jump through."],
  [S('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>'), "Your theme", "It wears the same colours, glass and corners as your desktop."],
  [S('<path d="M5 3l14 9-6 1.5L10 20z"/>'), "Lens in the page", "Right-click in any page for the Lens menu: summarise, translate, save."],
  [S('<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'), "Approvals for agents", "Reading runs. Submitting or sending asks first. Paying and passwords: never."],
];
const CORE = [["monitor", "Monitor", "What's slowing your PC"], ["timer", "Timer", "Timers, pomodoro, alarms"], ["notes", "Notes", "Checklists and stickies"], ["calculator", "Calculator", "Units and history"], ["color", "Color", "Pick any pixel"], ["power", "Power", "Battery health"], ["network", "Network", "Who's using the network"], ["clipboard", "Clipboard", "History, pins"], ["startup", "Startup", "What runs at sign-in"]];
const SUITE = ["artcraft", "wordcraft", "deckcraft", "gridcraft"];
const PICKS = ["concat", "degenview", "ollama", "obs-studio", "krita", "blender", "affine", "excalidraw"];
const LINES = {
  artcraft: "Image and video, with controllable AI", wordcraft: "Documents", deckcraft: "Slides", gridcraft: "Spreadsheets",
  concat: "A local-first video editor with AI captions", degenview: "Charting in Rust. Charts and paper trading only", ollama: "Run AI models on your PC", "obs-studio": "Record and stream",
  krita: "Digital painting", blender: "3D, animation, video", affine: "Notes, docs and whiteboards", excalidraw: "Hand-drawn diagrams",
};
// True on main today. Update when automatic checks (PR #63) land on every agent path.
const AGENT_NOTE = "In beta: approval cards and the activity log are in. Automatic checks for hidden instructions are still being wired into every agent path.";
const GH = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.86v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>`;
// Original OS glyphs (not the vendors' logos): a four-pane window, the ⌘ key, a penguin.
export const OS_ICON = {
  windows: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="3" y="3" width="8.4" height="8.4" rx="1.4"/><rect x="12.6" y="3" width="8.4" height="8.4" rx="1.4"/><rect x="3" y="12.6" width="8.4" height="8.4" rx="1.4"/><rect x="12.6" y="12.6" width="8.4" height="8.4" rx="1.4"/></svg>`,
  mac: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15zm0 0v6m0 0h2.5a2.5 2.5 0 1 1-2.5 2.5V15zm0 0H9m0 0v2.5A2.5 2.5 0 1 1 6.5 15H9z"/></svg>`,
  linux: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.5c-2.6 0-4 2.2-4 5 0 1.3.3 2.3-.6 3.7C6.2 13 5 14.8 5 17c0 1 .3 1.8.8 2.4-.9.4-1.3 1-1 1.6.4.8 2 .7 3.4.4.9.4 2.2.6 3.8.6s2.9-.2 3.8-.6c1.4.3 3 .4 3.4-.4.3-.6-.1-1.2-1-1.6.5-.6.8-1.4.8-2.4 0-2.2-1.2-4-2.4-5.8-.9-1.4-.6-2.4-.6-3.7 0-2.8-1.4-5-4-5zm-1.6 4.2c.5 0 .8.5.8 1.1s-.3 1.1-.8 1.1-.8-.5-.8-1.1.3-1.1.8-1.1zm3.2 0c.5 0 .8.5.8 1.1s-.3 1.1-.8 1.1-.8-.5-.8-1.1.3-1.1.8-1.1zM12 9.6c.9 0 1.9.5 1.9.9 0 .5-1 1.1-1.9 1.1s-1.9-.6-1.9-1.1c0-.4 1-.9 1.9-.9zM9.3 13.5c.8.7 1.7 1 2.7 1s1.9-.3 2.7-1c.8 1.2 1.3 2.4 1.3 3.6 0 2-1.7 2.8-4 2.8s-4-.8-4-2.8c0-1.2.5-2.4 1.3-3.6z"/></svg>`,
};
export const fmtStars = (n) => (n == null ? "" : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export function home(o) {
  // A stage reserves its room before its frames load (no layout shift).
  return homeHtml(o).replace(/data-w="(\d+)" data-h="(\d+)"/g, (m, w, h) => `${m} style="aspect-ratio:${w}/${h}"`);
}
function homeHtml({ visionHref, apps = {}, packs = [], stars = null }) {
  void packs;
  return `
<section class="hero" aria-labelledby="hero-h">
  <div class="inner hero-copy">
    <span class="hero-logo hero-mark" data-logo data-speed="0.8" data-site="./"><img class="poster" src="brand/lens-logo.svg" alt="The Lens logo: a silver lens holding a rainbow nebula" width="144" height="144" fetchpriority="high"></span>
    <h1 id="hero-h">The <span class="lens-rainbow">everything</span> desktop.</h1>
    <p class="lede">The open-source desktop where look, apps and AI finally work as one.</p>
    <div class="actions">
      <a class="btn primary hero-dl" data-dl href="download.html">${OS_ICON.windows}<span class="lbl">Download for Windows</span></a>
      <a class="btn ghost hero-gh" href="${REPO}">${GH}<span>View on GitHub</span>${stars != null ? `<span class="stars" aria-label="${stars} stars">★ ${fmtStars(stars)}</span>` : ""}</a>
    </div>
    <p class="dl-more" aria-label="Other ways to install"><a href="download.html#platforms">Build from source</a><span class="soon" title="Coming with the first signed release">winget</span><span class="soon">Portable .zip</span><span class="soon">Installer .msi</span><a class="os" href="download.html#platforms">${OS_ICON.mac}${OS_ICON.linux}macOS &amp; Linux: on the roadmap</a></p>
    <p class="dl-fine">Windows 10 &amp; 11 · free and open source · winget, .zip and .msi arrive with the first signed release</p>
  </div>
  <div class="stage-wrap">
    <div class="stage" id="stage">
      <div id="desk-host" class="desk-host"></div>
      <div class="sc-bar" id="sc-bar">
        <div class="sc-cap" aria-live="polite"><span class="sc-n">Free play</span><span class="sc-t">Every window here is the real Lens app on sample data. Drag, snap, right-click, open apps from the dock. Or pick a tour and go step by step.</span></div>
        <div class="sc-ctl">
          <span class="sc-dots" aria-hidden="true"></span>
          <button type="button" class="sb-btn sc-b" data-back disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>Back</span></button>
          <button type="button" class="sb-btn sc-b sc-next" data-next disabled><span>Next</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
          <button type="button" class="sb-btn sc-b" data-reset disabled>Reset</button>
          <button type="button" class="sb-btn sc-b" data-exit disabled>Exit</button>
          <button type="button" class="sb-btn sb-fs" data-fs aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg><span class="lbl">Fullscreen</span></button>
        </div>
      </div>
    </div>
    <div class="sc-tabs" id="sc-tabs" role="tablist" aria-label="Guided tours"></div>
    <div class="docks-row" id="docks" aria-labelledby="docks-h">
      <div class="dr-head"><h2 id="docks-h" class="h-sm">Nine docks</h2><p id="dock-info" class="dr-info" aria-live="polite"></p>
        <span class="dr-nav"><button type="button" class="sb-btn" data-rail-prev aria-label="Scroll the docks left"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><button type="button" class="sb-btn" data-rail-next aria-label="Scroll the docks right"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></span></div>
      <div class="dock-rail" id="dock-rail" role="radiogroup" aria-labelledby="docks-h"></div>
    </div>
  </div>
</section>

<section id="f-magic" class="sec xsec" aria-labelledby="f-magic-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.magic}</span>Magic right-click</p><h2 id="f-magic-h">Right-click anything.</h2><p>A small Lens window opens right where you clicked. It knows what the thing is, and what it can do with it.</p></div>
    <div class="mx" id="mx" data-exhibit="magic">
      <div class="xstage" data-w="1180" data-h="640">
        <div class="xf mx-target" data-xf="browser.html?scene=frame" data-xf-magic="1" data-marker=".lb-root" role="img" aria-label="Lens Browser, the real app, with a page open. Right-click it."></div>
        <div class="mx-menu" hidden><div class="xf" data-xf="magic.html?scene=link&amp;drag=0&amp;magic=0" data-marker="[class^=&#39;magic-&#39;]" data-eager="1" role="img" aria-label="The Lens magic window"></div></div>
      </div>
      <div class="xsteps" role="tablist" aria-label="What right-click can do">
        ${MAGIC_STEPS.map(([id, t, d], i) => `<button type="button" role="tab" class="xstep" data-step="${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><b>${esc(t)}</b><span>${esc(d)}</span></button>`).join("")}
      </div>
      <p class="xnote">This is the real Lens window on sample data. Right-click the page yourself, or <button type="button" class="link-btn" data-play-scene="magic">take the tour on the desk ↑</button></p>
    </div>
  </div>
</section>

<section id="byo" class="sec xsec" aria-labelledby="byo-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.agent}</span>Bring your own agent</p><h2 id="byo-h">It proposes. You approve. Everything undoes.</h2><p>Use the AI you already have. Lens lets it work on your desktop, and keeps you in charge of every change.</p></div>
    <ol class="story" data-exhibit="agent">
      <li class="st">
        <p class="st-n"><i>1</i>Connect</p>
        <h3>Pick your agent.</h3>
        <div class="st-agents">
          <div class="ag"><span class="byo-ic" style="--c:#d97757">C</span><b>Claude</b><span>Desktop or Code</span></div>
          <div class="ag"><span class="byo-ic" style="--c:#34d399">${OLLAMA}</span><b>A local model</b><span>Ollama, LM Studio</span></div>
          <div class="ag"><span class="byo-ic" style="--c:#818cf8"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0zM12 17v4"/></svg></span><b>Any MCP agent</b><span>one command</span></div>
        </div>
        <p class="st-line">Settings › AI gives you one line to paste.</p>
        <details class="st-how"><summary>Show the line</summary><pre><code>"lens-ui": { "command": "lens-ui.exe", "args": ["--mcp-stdio"] }</code></pre><p>Local models: Lens finds Ollama, LM Studio and llama.cpp on this PC by itself.</p></details>
      </li>
      <li class="st">
        <p class="st-n"><i>2</i>It proposes</p>
        <h3>You see the plan first.</h3>
        <div class="xstage st-stage" data-w="470" data-h="500"><div class="xf" data-xf="approval.html?scene=window&amp;drag=0&amp;magic=0" data-marker="[class^=&#39;ap-&#39;]" role="img" aria-label="The real “Needs your OK” card: who is asking, what it will do, a preview, Deny and Approve"></div></div>
        <p class="st-line">Who is asking, what it will do, and a preview.</p>
      </li>
      <li class="st">
        <p class="st-n"><i>3</i>You approve</p>
        <h3>It acts where you can watch.</h3>
        <div class="xstage st-stage" data-w="700" data-h="500">
          <div class="xf" data-xf="coreapps.html?app=notes&amp;drag=0&amp;magic=0" data-marker=".ca-app-notes" role="img" aria-label="Lens Notes, the real app, with the agent's orb ticking an item"></div>
          <div class="xf st-orb" data-xf="presence.html?drag=0&amp;magic=0" data-marker="[data-presence]" data-presence="1" aria-hidden="true"></div>
        </div>
        <p class="st-line">The orb shows each step. Esc stops it. One Undo puts it all back. <button type="button" class="link-btn" data-replay>Replay</button></p>
      </li>
    </ol>
    <p class="xnote">${esc(AGENT_NOTE)} <button type="button" class="link-btn" data-play-scene="agent">See it on the desk ↑</button></p>
  </div>
</section>

<section id="f-browser" class="sec xsec" aria-labelledby="f-browser-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.browser}</span>Lens Browser</p><h2 id="f-browser-h">A browser that asks before it acts.</h2><p>One slim bar, your theme, and an AI panel beside the page that only reads what you point it at.</p></div>
    <div class="bx" data-exhibit="browser">
      <div class="xstage" data-w="1180" data-h="660"><div class="xf" data-xf="browser.html?scene=agent" data-marker=".lb-root" role="img" aria-label="Lens Browser, the real app: tabs in the sidebar, one slim bar, the AI panel beside the page"></div></div>
      <div class="xsteps" role="tablist" aria-label="Lens Browser views">
        ${BROWSER_STEPS.map(([id, t, d], i) => `<button type="button" role="tab" class="xstep" data-step="${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><b>${esc(t)}</b><span>${esc(d)}</span></button>`).join("")}
      </div>
    </div>
    <h3 class="why-h">Why it's different</h3>
    <ul class="why">
      ${WHY_BROWSER.map(([ic, t, d]) => `<li><span class="why-ic">${ic}</span><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join("")}
    </ul>
  </div>
</section>

<section id="overlays" class="sec xsec" aria-labelledby="ov-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.layers}</span>Core apps</p><h2 id="ov-h">Nine small apps, already there.</h2><p>Themed tools for the jobs Windows makes awkward. These are real screenshots; click one to open it on the desk.</p></div>
    <div class="core-grid" id="core-grid" data-cycle>
      ${CORE.map(([id, t, d]) => `<button type="button" class="core" data-open-app="${id}"><img src="media/core-${id}.webp" alt="${esc(t)}: ${esc(d)}" loading="lazy" width="760" height="520"><span class="core-cap"><b>${esc(t)}</b><span>${esc(d)}</span></span></button>`).join("")}
    </div>
    <div class="ov-pair">
      <article class="ov"><button type="button" class="ov-media" data-play-scene="music" aria-label="Open Lens Music on the desk"><img src="media/surface-music.webp" alt="Lens Music: now playing, lyrics and up next, coloured by the album art" loading="lazy" width="1100" height="660"></button><div class="ov-body"><h3>Lens Music</h3><p>Now Playing for any app, coloured by the album art.</p></div></article>
      <article class="ov"><button type="button" class="ov-media" data-play-scene="cleaner" aria-label="Open Lens Cleaner on the desk"><img src="media/surface-cleaner.webp" alt="Lens Cleaner: 32.5 GB safe to clean, sorted by how safe each item is" loading="lazy" width="1100" height="660"></button><div class="ov-body"><h3>Lens Cleaner</h3><p>See what's taking space. Clean safely, undo in one click.</p></div></article>
    </div>
  </div>
</section>

<section id="apps" class="sec xsec" aria-labelledby="apps-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.apps}</span>Lens Apps</p><h2 id="apps-h">Free and open-source apps, one click away.</h2><p>Lens Apps finds the official release, checks the download and installs it when you say so.</p></div>
    <h3 class="apps-h">The ArtCraft suite</h3>
    <div class="suite-row">${SUITE.map((id) => appTile(id, apps, true)).join("")}</div>
    <h3 class="apps-h">More picks</h3>
    <div class="app-grid">${PICKS.map((id) => appTile(id, apps, false)).join("")}</div>
    <p class="fine">Icons and screenshots come from each project's own repository, under that project's licence. Lens isn't affiliated with these projects. <button type="button" class="link-btn" data-play-scene="apps">Open Lens Apps on the desk ↑</button></p>
  </div>
</section>

<section id="themes" class="sec extras-start" aria-labelledby="themes-h">
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
    <div class="how-themes" id="how-themes">
      <h3>How themes work</h3>
      <ul>
        <li><b>One file</b><span>A <code>.lenstheme</code> carries the colours, glass, corners, dock style and backdrop.</span></li>
        <li><b>Export and share</b><span>“Download .lenstheme” above saves the look on this desk. Import it in Settings › Appearance.</span></li>
        <li><b>Coming</b><span>Packs that carry more: app overlays and what an agent may control.</span></li>
      </ul>
    </div>
  </div>
</section>

<section id="more" class="sec" aria-labelledby="more-h">
  <div class="inner">
    <div class="head center"><h2 id="more-h">And the extras.</h2><p>Short recordings of the real app. Press play.</p></div>
    <div class="ex-grid">
      ${extra("Backdrop Lab", "Make animated gradient wallpapers and set them live, or turn one into a theme.", { img: "shot-backdrop-lab.webp", alt: "Backdrop Lab with a gradient preview and its controls" })}
      ${extra("Snip", "Capture, blur what's private, mark it up, then send it to Claude or a friend.", { clip: "snip" })}
      ${extra("The Shelf", "A standing clipboard for everything you collect; send it as one context pack.", { clip: "shelf-packs" })}
      ${extra("Voice", "Hold a key and say “Lens, tile my windows”. Recognised on your PC.", { clip: "voice" })}
      ${extra("The AI dock", "Ask from the dock; it answers in place and asks before acting.", { clip: "ai-dock" })}
      ${extra("Tester Hub", "What's new, a checklist, and a one-click report for testers.", { clip: "tester-hub" })}
    </div>
    <p class="fine">Also in Lens: Living Sky wallpaper, a Settings hub for Lens and Windows, Lens Mini, Messages and feeds. Coming next: Peek, Split view, Spaces, Routines and a phone companion.</p>
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
/** A short clip that plays only when asked (click, or hover with a mouse). */
const clip = (id, label) => `<figure class="clip" data-clip><video preload="none" muted playsinline loop poster="media/poster-${id}.webp" aria-label="${esc(label)}"><source src="media/${id}.mp4" type="video/mp4"></video><button type="button" class="clip-play" aria-label="Play: ${esc(label)}"><span aria-hidden="true">▶</span></button></figure>`;
const IC = {
  magic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`,
  browser: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></svg>`,
  agent: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>`,
  apps: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><path d="M16.5 13v7M13 16.5h7"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
};
const extra = (t, line, { clip: c, img, alt } = {}) => `<article class="ex">${c ? clip(c, t) : img ? `<figure class="clip still"><img src="media/${img}" alt="${esc(alt ?? t)}" loading="lazy" width="1100" height="619"></figure>` : ""}<h3>${esc(t)}</h3><p>${esc(line)}</p></article>`;

/** One app, once: a real thumbnail (the project's screenshot, or its icon), its licence, and Get. */
function appTile(id, apps, big) {
  const a = apps[id];
  if (!a) return "";
  const shot = a.files?.shot0, icon = a.files?.icon;
  return `<article class="apt${big ? " big" : ""}" data-app-card="${esc(id)}">
  <a class="apt-thumb${shot ? "" : " icon"}" href="${esc(a.repo ?? a.homepage)}" aria-label="${esc(a.name)} on its project page">${shot ? `<img src="media/apps/${shot}" alt="${esc(a.name)} screenshot" loading="lazy" width="1100" height="619">` : icon ? `<img src="media/apps/${icon}" alt="" loading="lazy" width="72" height="72">` : `<span class="mono-ic" style="--h:200">${esc(a.name[0])}</span>`}</a>
  <div class="apt-body">${shot && icon ? `<img class="apt-ic" src="media/apps/${icon}" alt="" width="32" height="32" loading="lazy">` : ""}<div class="apt-t"><h4>${esc(a.name)}</h4><span>${esc(LINES[id] ?? "")}</span><span class="meta">${esc(a.license)}</span></div><button class="get-pill" type="button" data-get="${esc(a.name)}" aria-live="polite">Get</button></div>
</article>`;
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

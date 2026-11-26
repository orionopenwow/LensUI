// HTML for the hand-designed pages: Home (hero desk, one section per idea with a real exhibit) and
// Download. Text lives here and in content/features.mjs; theme values come from the real packs.
import { esc } from "./lib/markdown.mjs";
import { WORKS_ON } from "./content/features.mjs";
import { THUMBDESK } from "./content/thumbdesk.mjs";
import { REPO } from "./lib/layout.mjs";


// Each exhibit plays three steps, slowly and on repeat: [scene of the real surface, caption].
const MAGIC_STEPS = [
  ["link", "Right-click a link: the Lens menu opens where you clicked, with link actions."],
  ["summary", "Pick Summarise: the answer appears in the same window."],
  ["transcript", "On a video page, the same menu gets the transcript."],
];
// Scenes of the real BrowserSurface (tools/parity/browser/entry.tsx).
const BROWSER_STEPS = [
  ["home", "One box for a search, an address or a question."],
  ["agent", "Ask it to do something: the AI works beside the page and lists every step."],
  ["results", "Then it shows what it found: a map, a table and its pick, with why."],
];
const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// What Lens Browser does differently, true on main today (docs/BROWSER_AAA.md, docs/LENS_BROWSER.md,
// docs/BROWSER_RESEARCH.md for what other AI browsers do).
const WHY_BROWSER = [
  [S('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>'), "AI beside the page", "The page stays yours. The panel lists every click and word, and Esc stops it."],
  [S('<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'), "Big steps stay yours", "Booking, paying, sending and submitting wait for you. Passwords: never."],
  [S('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'), "Hidden instructions get flagged", "Text on a page that tries to steer the AI is shown to you, not obeyed."],
  [S('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'), "You decide what sites get", "Camera, mic, location and notifications ask under the address bar, once or per site."],
  [S('<path d="M12 4v10M8 10l4 4 4-4M5 19h14"/>'), "Light, and easy to move to", "Bring bookmarks and tabs from Chrome, Edge, Arc and more, item by item, never passwords."],
];
// The Dock: what it does (docs/brain/FEATURES.md › Desktop shell and docks).
const DOCK_CAPS = [
  [S('<rect x="3" y="15" width="18" height="5" rx="2.5"/><rect x="6" y="5" width="12" height="6" rx="2"/>'), "Nine styles", "Floating by default; Taskbar, Slim, Studio, Minimal, Split, Islands and two with their own packs."],
  [S('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 21v-3h10v3M3 7h3v10H3"/>'), "Any edge", "Bottom, top, left or right, with auto-hide that always comes back."],
  [S('<rect x="4" y="4" width="16" height="10" rx="2"/><path d="M9 18h6M12 14v4"/>'), "Live window previews", "Hover a running app to see its windows, anchored to the icon."],
  [S('<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4"/>'), "Attention, calmly", "An app that needs you flashes once, bounces once, and stays highlighted until you look."],
  [S('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>'), "Magic from the dock", "Right-click any icon: a new window, run as admin, window controls, and the Lens menu."],
  [S('<rect x="5" y="4" width="14" height="11" rx="2"/><rect x="8" y="16" width="8" height="4" rx="2"/>'), "Settings and Search, joined", "They open from the dock as one shape, each at its own size, with a × and Esc to close."],
];
// The agentic-desktop exhibit's plan: what Claude Code does, and which steps wait for you.
const AGENT_PLAN = [
  ["Search places near you in Lens Browser", "Reads only", "runs"],
  ["Pick Harbor & Vine: free at 8:00, vegan mains for Maya", "Runs", "runs"],
  ["Fill and book the reservation ($25 no-show fee)", "Asks first", "ask"],
  ["Add the dinner to your calendar", "Asks first", "ask"],
  ["Message Maya, Sam and Priya", "Asks first", "ask"],
];
// The small apps, all real Lens surfaces: [id, name, line, picture, opens on the desk?].
const SMALL = [
  ["music", "Lens Music", "Now Playing for any app", "surface-music", true],
  ["cleaner", "Lens Cleaner", "Free space safely, undo in one click", "surface-cleaner", true],
  ["notes", "Notes", "Checklists and stickies", "core-notes", true],
  ["feeds", "Lens Feeds", "Your feeds in calm columns", "surface-feeds", false],
  ["messages", "Lens Messages", "Every inbox, one list", "surface-messages", false],
  ["thumbdesk", "ThumbDesk", "The PC from a controller", "shot-thumbdesk-studio", false],
];
const CORE = [["monitor", "Monitor", "What's slowing your PC"], ["timer", "Timer", "Timers, pomodoro, alarms"], ["notes", "Notes", "Checklists and stickies"], ["calculator", "Calculator", "Units and history"], ["color", "Color", "Pick any pixel"], ["power", "Power", "Battery health"], ["network", "Network", "Who's using the network"], ["clipboard", "Clipboard", "History, pins"], ["startup", "Startup", "What runs at sign-in"]];
const SUITE = ["artcraft", "wordcraft", "deckcraft", "gridcraft"];
const PICKS = ["thumbdesk", "concat", "degenview", "ollama", "obs-studio", "krita", "blender", "affine"];
const LINES = {
  artcraft: "Image and video, with controllable AI", wordcraft: "Documents", deckcraft: "Slides", gridcraft: "Spreadsheets",
  thumbdesk: "The whole PC from a controller. From the makers of Lens",
  concat: "A local-first video editor with AI captions", degenview: "Charting in Rust. Charts and paper trading only", ollama: "Run AI models on your PC", "obs-studio": "Record and stream",
  krita: "Digital painting", blender: "3D, animation, video", affine: "Notes, docs and whiteboards", excalidraw: "Hand-drawn diagrams",
};
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
function homeHtml({ visionHref, apps = {}, catalog = [], packs = [], stars = null }) {
  void packs;
  const PAUSE = `<button type="button" class="sb-btn x-pause" data-xpause aria-pressed="false"><svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg><svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg><span class="sr">Pause</span></button>`;
  const xbar = (label, first) => `<div class="xbar"><p class="xcap" aria-live="off">${esc(first)}</p><span class="xdots" aria-hidden="true"><i class="on"></i><i></i><i></i></span>${PAUSE.replace('<span class="sr">Pause</span>', `<span class="sr">Pause ${esc(label)}</span>`)}</div>`;
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
    <p class="dl-more" aria-label="Other ways to install"><a href="${REPO}/releases">Installer .exe &amp; .msi</a><a href="download.html#platforms">Build from source</a><span class="soon" title="Coming later">winget</span><span class="soon">Portable .zip</span><a class="os" href="download.html#platforms">${OS_ICON.mac}${OS_ICON.linux}macOS &amp; Linux: on the roadmap</a></p>
    <p class="dl-fine">Windows 10 &amp; 11 · free and open source · installers from 0.3.0 on GitHub Releases · winget and .zip later</p>
  </div>
  <div class="stage-wrap">
    <div class="stage" id="stage">
      <div id="desk-host" class="desk-host"></div>
      <div class="sc-bar" id="sc-bar">
        <div class="sc-cap" aria-live="off"><span class="sc-n">The Dock</span><span class="sc-t">Every window here is the real Lens app on sample data.</span></div>
        <div class="sc-ctl">
          <span class="sc-dots" aria-hidden="true"></span>
          <button type="button" class="sb-btn sc-play" data-play aria-pressed="false"><svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg><svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg><span class="lbl">Pause</span></button>
          <button type="button" class="sb-btn sb-fs" data-fs aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg><span class="lbl">Fullscreen</span></button>
        </div>
      </div>
    </div>
    <div class="sc-tabs" id="sc-tabs" role="tablist" aria-label="What the demo shows"></div>
  </div>
</section>

<section id="f-dock" class="sec xsec feature" aria-labelledby="f-dock-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.dock}</span>The Dock</p><h2 id="f-dock-h">One dock, nine ways.</h2><p>A dock that fits how you work: pick a style and an edge. Pick one below to put it on the desk above.</p></div>
    <div class="docks-row" id="docks" aria-labelledby="docks-h">
      <div class="dr-head"><h3 id="docks-h" class="h-sm">Nine docks</h3><p id="dock-info" class="dr-info" aria-live="polite"></p>
        <span class="dr-nav"><button type="button" class="sb-btn" data-rail-prev aria-label="Scroll the docks left"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><button type="button" class="sb-btn" data-rail-next aria-label="Scroll the docks right"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></span></div>
      <div class="dock-rail" id="dock-rail" role="radiogroup" aria-labelledby="docks-h"></div>
    </div>
    <ul class="why why-3">
      ${DOCK_CAPS.map(([ic, t, d]) => `<li><span class="why-ic">${ic}</span><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join("")}
    </ul>
  </div>
</section>

<section id="f-browser" class="sec xsec feature" aria-labelledby="f-browser-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.browser}</span>Lens Browser</p><h2 id="f-browser-h">A light browser, with AI beside the page.</h2><p>Ask in the one box. The AI works next to the page and lists every step it takes.</p></div>
    <div class="bx xmain" data-exhibit="browser">
      <div class="xstage" data-w="1180" data-h="660"><div class="xf" data-xf="browser.html?scene=home" data-marker=".lb-root" role="img" aria-label="Lens Browser, the real app, on its new tab page: one box for search, addresses and questions"></div></div>
      ${xbar("Lens Browser", BROWSER_STEPS[0][1])}
      <script type="application/json" class="xdata">${JSON.stringify(BROWSER_STEPS)}</script>
    </div>
    <ul class="why">
      ${WHY_BROWSER.map(([ic, t, d]) => `<li><span class="why-ic">${ic}</span><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join("")}
    </ul>
  </div>
</section>

<section id="f-magic" class="sec xsec" aria-labelledby="f-magic-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.magic}</span>Right-click</p><h2 id="f-magic-h">Right-click anything.</h2><p>The Lens menu opens right where you clicked, and knows what it is: a link, an image, a video, a window. Try it on the page below.</p></div>
    <div class="mx xmain" id="mx" data-exhibit="magic">
      <div class="xstage" data-w="1180" data-h="640">
        <div class="xf mx-target" data-xf="browser.html?scene=frame" data-xf-magic="1" data-marker=".lb-root" role="img" aria-label="Lens Browser, the real app, with a page open. Right-click it."></div>
        <div class="mx-dim" aria-hidden="true" hidden></div>
        <div class="mx-menu" hidden><div class="xf" data-xf="magic.html?scene=link&amp;drag=0&amp;magic=0" data-marker="[class^=&#39;magic-&#39;]" data-eager="1" role="img" aria-label="The Lens magic window"></div></div>
      </div>
      ${xbar("Right-click", MAGIC_STEPS[0][1])}
      <script type="application/json" class="xdata">${JSON.stringify(MAGIC_STEPS)}</script>
    </div>
  </div>
</section>

<section id="themes" class="sec extras-start" aria-labelledby="themes-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.theme}</span>Themes</p><h2 id="themes-h">Every theme, live.</h2><p>${packs.length || 89} looks for the whole desktop. Point to preview, click to keep, or press <kbd>T</kbd> to shuffle.</p></div>
    <div class="lab">
      <div id="lab-desk" class="desk-host"></div>
      <aside class="lab-side" aria-label="Theme controls">
        <div class="lab-picks" role="group" aria-label="Themes"></div>
        <div class="lab-row"><button type="button" class="btn small" data-all aria-expanded="false" aria-controls="lab-pop">All ${packs.length || 80} themes…</button><button type="button" class="btn small" data-shuffle>Shuffle <kbd>T</kbd></button></div>
        <div class="lab-pop" id="lab-pop" role="dialog" aria-label="All themes" hidden><label class="sr" for="lab-q">Search themes</label><input id="lab-q" type="search" placeholder="Search ${packs.length || 89} themes…"><div class="grid"></div></div>
        <p class="lab-label" id="acc-l">Accent <span>click a colour, or drag one onto the desk</span></p>
        <div class="lab-acc" role="radiogroup" aria-labelledby="acc-l"></div>
        <p class="lab-acc-now" aria-live="polite"></p>
        <div class="lab-row"><button type="button" class="btn small" data-export>Download .lenstheme</button></div>
        <p class="lab-now" aria-live="polite"></p>
      </aside>
    </div>
    <div class="how-themes" id="how-themes">
      <h3>How themes work</h3>
      <ul>
        <li><b>One file</b><span>A <code>.lenstheme</code> carries the colours, glass, corners, dock style and backdrop.</span></li>
        <li><b>Export and share</b><span>“Download .lenstheme” saves the look on this desk. Import it in Settings › Appearance.</span></li>
      </ul>
    </div>
  </div>
</section>

<section id="byo" class="sec xsec" aria-labelledby="byo-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.agent}</span>Agentic desktop</p><h2 id="byo-h">Your agent, across the whole desktop.</h2><p>Connect Claude Code, Claude Desktop, a local model or any MCP agent. It works in Lens Browser, your windows, files and settings, and shows its plan as it goes.</p></div>
    <div class="agent-x xmain" data-exhibit="agent">
      <div class="agent-main">
        <div class="xstage" data-w="1180" data-h="660"><div class="xf ag-browser" data-xf="browser.html?scene=dinner-plan" data-marker=".lb-root" role="img" aria-label="Lens Browser, the real app, with Claude Code's request in the AI panel: book Friday dinner for 4, add it to the calendar, message three people"></div></div>
        <div class="ag-card" hidden><div class="xstage" data-w="470" data-h="660"><div class="xf" data-xf="approval.html?scene=dinner&amp;drag=0&amp;magic=0" data-eager="1" data-marker="[class^=&#39;ap-&#39;]" role="img" aria-label="The real “Needs your OK” card for the booking step: Claude Code, step 3 of 5, the reservation form and its $25 no-show fee, what each step of the task may do, Deny and hold to Book"></div></div></div>
      </div>
      <aside class="ag-side">
        <p class="ag-ask"><span class="ag-who">Claude Code</span>“Book Friday dinner for 4 near me and add it to my calendar, then message Maya, Sam and Priya.”</p>
        <ol class="ag-plan" aria-label="The plan, step by step">
          ${AGENT_PLAN.map(([t, r, k], i) => `<li class="is-${k}" data-i="${i}"><span class="ag-n">${i + 1}</span><span class="ag-t">${esc(t)}</span><span class="ag-r">${esc(r)}</span></li>`).join("")}
        </ol>
        <p class="ag-note">Each step that books, sends or changes something waits on the real “Needs your OK” card: approve it, deny it, or allow that kind of step for this task.</p>
      </aside>
      ${xbar("Agentic desktop", "Claude Code asks for dinner. Lens Browser searches and picks a place: reading runs on its own.")}
    </div>
    <div class="learn">
      <span class="learn-ic" aria-hidden="true">${IC.learn}</span>
      <div><h3>Learns as you go <span class="tag">Coming</span></h3><p>Opt in, and Lens learns your habits on this PC: which apps you open when, how you lay out your windows. Each suggestion says why it's there, and one click forgets it. Nothing leaves your PC.</p></div>
    </div>
  </div>
</section>

<section id="overlays" class="sec xsec" aria-labelledby="ov-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.layers}</span>Also in Lens</p><h2 id="ov-h">Small apps, already there.</h2><p>Themed tools for the jobs Windows makes awkward. Click one to open it on the desk.</p></div>
    <div class="mini-grid" id="core-grid" data-cycle>
      ${SMALL.map(([id, t, d, img, live]) => miniTile(id, t, d, img, live)).join("")}
      ${CORE.filter(([id]) => id !== "notes").map(([id, t, d]) => miniTile(id, t, d, `core-${id}`, true)).join("")}
    </div>
  </div>
</section>

<section id="apps" class="sec xsec" aria-labelledby="apps-h">
  <div class="inner">
    <div class="head center"><p class="kicker"><span class="k-ic">${IC.apps}</span>Lens Apps</p><h2 id="apps-h">Free and open-source apps, one click away.</h2><p>Official releases, checked before they install.</p></div>
    <div class="app-grid">${[...SUITE, ...PICKS].map((id) => appTile(id, catalog.find((a) => a.id === id), apps[id])).join("")}</div>
    <p class="fine apps-fine">Names, screenshots and trademarks belong to each project; Lens isn't affiliated with any of them. Each screenshot comes from the project's own repository; where a repository has none, the tile is Lens's own drawing.</p>
  </div>
</section>

<section id="more" class="sec" aria-labelledby="more-h">
  <div class="inner">
    <div class="head center"><h2 id="more-h">And the extras.</h2></div>
    <div class="ex-grid">
      ${extra("Backdrop Lab", "Animated gradient wallpapers, set live or saved as a theme.", { img: "shot-backdrop-lab.webp", alt: "Backdrop Lab with a gradient preview and its controls" })}
      ${extra("Snip", "Capture, blur what's private, mark it up, send it.", { clip: "snip" })}
      ${extra("The Shelf", "A clipboard for everything you collect.", { clip: "shelf-packs" })}
      ${extra("Voice", "Hold a key and say “Lens, tile my windows”.", { clip: "voice" })}
    </div>
  </div>
</section>

<section id="trust" class="sec" aria-labelledby="trust-h">
  <div class="inner">
    <div class="head"><h2 id="trust-h">Safe to try, easy to leave.</h2></div>
    <ul class="trust">
      <li><strong>Off until you turn it on</strong>New features ship disabled.</li>
      <li><strong>Every change undoes</strong>One button puts Windows back, even if Lens isn't running.</li>
      <li><strong>Games are left alone</strong>Overlays pause for full-screen apps and games. Nothing loads into other apps unless you turn on an optional styling extra.</li>
      <li><strong>Local first</strong>AI is opt-in and shows what it would send. No telemetry, no account.</li>
    </ul>
    <p class="vision-line">One app instead of a dozen utilities: dock, launcher, themes, browser, apps and an AI co-pilot that works across all of them. <a href="${visionHref}">Read the vision</a></p>
  </div>
</section>`;
}
/** A small app in the compact grid: a small real picture, its name, one line. */
function miniTile(id, t, d, img, live) {
  const how = id === "thumbdesk" ? "From the makers of Lens: opens its website" : live ? "Opens on the desk above" : "";
  const pic = `<span class="mini-pic"><img src="media/${img}.webp" alt="" loading="lazy" width="320" height="200"></span><span class="mini-cap"><b>${esc(t)}</b><span>${esc(d)}</span>${how ? `<span class="sr">. ${esc(how)}</span>` : ""}</span>`;
  if (id === "thumbdesk") return `<a class="mini" href="${THUMBDESK.home}">${pic}</a>`;
  return live ? `<button type="button" class="mini" data-open-app="${id}">${pic}</button>` : `<div class="mini">${pic}</div>`;
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
  dock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="15" width="18" height="5" rx="2.5"/><path d="M7 17.5h.01M10.5 17.5h.01M14 17.5h.01M17.5 17.5h.01"/><rect x="5" y="4" width="14" height="8" rx="2"/></svg>`,
  theme: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><path d="M7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01"/></svg>`,
  learn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 18c3-1 5-4 8-4s5 3 8 4"/><path d="M4 12c3-1 5-4 8-4s5 3 8 4" opacity=".55"/><circle cx="12" cy="5" r="1.4" fill="currentColor"/></svg>`,
};
// Lens Apps: one icon set drawn for Lens (not the projects' logos), a monochrome glyph on a matte tile
// with a single accent mark. [glyph in currentColor, accent mark in var(--a), accent colour].
const G = (main, acc, a) => ({ main, acc, a });
const APP_GLYPH = {
  artcraft: G('<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 17.5"/>', '<circle cx="15.5" cy="9" r="1.7"/>', "#f59e0b"),
  wordcraft: G('<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5z"/><path d="M9.5 12h5M9.5 15h5"/>', '<path d="M9.5 9h3"/>', "#60a5fa"),
  deckcraft: G('<rect x="3.5" y="4.5" width="17" height="11" rx="2"/><path d="M12 15.5v4M8.5 20h7"/>', '<path d="M8 12l2.5-3 2 2 3-3.5"/>', "#f97316"),
  gridcraft: G('<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9.5h16M4 14.5h16M10 4v16"/>', '<path d="M13 12h4"/>', "#34d399"),
  thumbdesk: G('<path d="M7 8.5h10a4 4 0 0 1 3.9 4.9l-.8 3.3a2.2 2.2 0 0 1-3.8 1L14.6 15.5H9.4l-1.7 2.2a2.2 2.2 0 0 1-3.8-1l-.8-3.3A4 4 0 0 1 7 8.5z"/><path d="M8 11.5v2.5M6.8 12.75h2.4"/>', '<circle cx="16" cy="12.5" r="1"/>', "#a78bfa"),
  concat: G('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17M3.5 15h17M8 5v4M12 5v4M16 5v4M8 15v4M12 15v4M16 15v4"/>', '<path d="M10.5 10.6v2.8l2.6-1.4z"/>', "#f43f5e"),
  degenview: G('<path d="M4 4v16h16"/><path d="M8 10v5M12 7v9M16 11v4"/>', '<path d="M7 14l4-4 3 2 5-5"/>', "#22d3ee"),
  ollama: G('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>', '<circle cx="12" cy="12" r="1.8"/>', "#e5e7eb"),
  "obs-studio": G('<circle cx="12" cy="12" r="8"/>', '<circle cx="12" cy="12" r="3"/>', "#ef4444"),
  krita: G('<path d="M14.5 4.5l5 5-9.5 9.5H5v-5z"/><path d="M12.5 6.5l5 5"/>', '<path d="M5 19l3-3"/>', "#ec4899"),
  blender: G('<path d="M12 3.5l7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5z"/><path d="M4.5 7.75L12 12l7.5-4.25M12 12v8.5"/>', '<circle cx="12" cy="12" r="1.2"/>', "#fb923c"),
  affine: G('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7 9h6M7 12.5h4"/>', '<rect x="13.5" y="11" width="4" height="4" rx="1"/>', "#818cf8"),
};
export const appGlyph = (id) => {
  const g = APP_GLYPH[id];
  if (!g) return "";
  return `<span class="app-ic" style="--a:${g.a}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><g>${g.main}</g><g class="acc">${g.acc}</g></svg></span>`;
};
const extra = (t, line, { clip: c, img, alt } = {}) => `<article class="ex">${c ? clip(c, t) : img ? `<figure class="clip still"><img src="media/${img}" alt="${esc(alt ?? t)}" loading="lazy" width="1100" height="619"></figure>` : ""}<h3>${esc(t)}</h3><p>${esc(line)}</p></article>`;

/** One app, once: a real screenshot from its own repository (or Lens's drawn tile when the repo has
 *  none), its name and line, who makes it (linked to the source), its licence, the credit, and Get. */
function appTile(id, c, m = {}) {
  if (!c && !m.name) return "";
  const name = c?.name ?? m.name, license = c?.license ?? m.license, repo = c?.repo ?? m.repo ?? c?.homepage ?? m.homepage;
  const author = c?.author ?? c?.publisher ?? "";
  const thumb = c?.thumb?.site ? c.thumb.site.replace(/^docs\//, "") : null;
  const shot = thumb
    ? `<figure class="apt-shot"><img src="${esc(thumb)}" alt="Screenshot of ${esc(name)}" loading="lazy" decoding="async" width="640" height="400"></figure>`
    : `<div class="apt-shot is-glyph">${appGlyph(id)}</div>`;
  return `<article class="apt" data-app-card="${esc(id)}">
  ${shot}
  <div class="apt-body">
    <div class="apt-t"><h3><a href="${esc(c?.homepage ?? repo)}">${esc(name)}</a></h3><span class="apt-line">${esc(LINES[id] ?? "")}</span>
      <span class="apt-by">${author ? `by <a href="${esc(repo)}" aria-label="${esc(author)}: ${esc(name)} source code">${esc(author)}</a> · ` : ""}<span class="apt-lic">${esc(license)}</span></span>
    </div>
    <button class="get-pill" type="button" data-get="${esc(name)}" aria-live="polite">Get</button>
  </div>
  ${thumb ? `<p class="apt-credit">Screenshot: ${esc(name)}, ${esc(license)}</p>` : ""}
</article>`;
}

export function download({ log, stars = null }) {
  return `
<section class="hero dl-hero" aria-labelledby="dl-h">
  <div class="inner">
    <h1 id="dl-h">Get the <span class="lens-rainbow">everything</span> desktop.</h1>
    <p class="lede">Lens is a shell for Windows 10 and 11. It's in beta. Starting with 0.3.0, download the installer from GitHub Releases, or build it from source in a few minutes.</p>
  </div>
</section>
<section id="platforms" class="sec tight" aria-labelledby="pl-h">
  <div class="inner">
    <h2 id="pl-h" class="sr">Platforms</h2>
    <div class="platforms">
      <article class="plat on">
        <div class="plat-h">${OS_ICON.windows}<h3>Windows 10 &amp; 11</h3><span class="tag ok">Beta</span></div>
        <p>Windows 10 (1809 or newer) or 11. <a class="btn small" href="${REPO}/releases">Installer on GitHub Releases</a> (from 0.3.0). The installers are not yet code-signed, so SmartScreen warns the first time: choose <b>More info › Run anyway</b>. Updates are signed.</p>
        <p>To build from source you need <a href="https://www.rust-lang.org/tools/install">Rust</a> and <a href="https://bun.sh">Bun</a>.</p>
        <pre><code>git clone ${REPO.toLowerCase()}
cd lensui
bun install
bun run tauri dev</code></pre>
        <p class="fine">Or double-click <code>Build-Lens-UI.bat</code> for a standalone build. If anything looks wrong, run <code>Restore-Windows-Taskbar.bat</code>. A winget package comes later.</p>
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

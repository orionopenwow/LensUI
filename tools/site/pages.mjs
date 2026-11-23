// HTML for the hand-designed pages (home, features, try). Content comes from content/features.mjs,
// docs/media/clips.json and the theme-pack registry, so the site can't drift from the app.
import { esc } from "./lib/markdown.mjs";
import { FEATURES, TRUST, WORKS_ON } from "./content/features.mjs";
import { REPO } from "./lib/layout.mjs";

const SHORT = { "dock-magnify": "Magnify", "dock-styles": "Six styles", "dock-search": "Search", "playground-sand": "Falling Sand", "playground-ink": "Ink", "command-mini": "Mini → Command", "right-click": "Right-click", "shelf-packs": "Shelf & packs", "browser-agent": "Agent", "youtube-transcript": "Transcripts", "ai-dock": "Ask", approvals: "Approvals" };
const DOCK_STYLES = [["floating", "Floating"], ["slim", "Slim"], ["taskbar", "Taskbar"], ["studio", "Studio"], ["minimal", "Minimal"], ["split", "Split"]];

export function clipFigure(c, base = "", { hidden = false, eager = false } = {}) {
  if (!c?.mp4) return "";
  const label = c.real ? "Recorded on Windows" : "UI preview rendered from the Lens frontend; system integration shown is simulated";
  return `<figure class="clip" data-id="${c.id}"${hidden ? " hidden" : ""}>
  <video muted loop playsinline preload="none" data-src="${base}media/${c.id}.mp4" poster="${base}media/${c.id}.webp" aria-label="${esc(c.title)}"${eager ? "" : ""}></video>
  <button class="btn small play" type="button">Play</button>
  <figcaption><span>${esc(c.title)}</span><span title="">${label}</span></figcaption>
</figure>`;
}

const status = (f) => (f.status === "dev" ? `<span class="pill status-dev"><span class="dot warn"></span>In development · <a href="${REPO}/pull/${f.pr}">#${f.pr}</a></span>` : `<span class="pill"><span class="dot ok"></span>In the beta build</span>`);
const clipOf = (clips, id) => clips.find((c) => c.id === id && c.mp4);

function dockStage({ big = false, lazy = false } = {}) {
  return `<div class="stage" data-dock-stage data-widget="dock" id="dock-demo">
  <div class="screen dither" data-density="0.5" data-seed="5" data-fade="bottom" style="height:${big ? 340 : 300}px">
    <div class="screen-meta"><span class="meta"><span class="dot ok"></span><span data-dock-status>loading the real dock…</span></span><span class="meta">hover · click · <kbd>Tab</kbd></span></div>
    <img class="fallback" src="media/dock-magnify.webp" alt="The Lens dock: a row of app icons on a dark glass pill" width="720" height="187">
    <iframe src="live/dock/index.html" title="Live Lens dock (interactive demo)" ${lazy ? 'loading="lazy"' : ""}></iframe>
  </div>
  <div class="controls">
    <div class="group"><span class="label" id="ds-l">Dock style</span><div class="seg" role="group" aria-labelledby="ds-l" data-seg="dock.style">${DOCK_STYLES.map(([v, l], i) => `<button type="button" data-v="${v}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div></div>
    <div class="group"><label class="label" for="ds-pack">Theme pack</label><select id="ds-pack" data-pack><option>Obsidian</option></select></div>
    <div class="group"><span class="label" id="ds-a">Launch animation</span><div class="seg" role="group" aria-labelledby="ds-a" data-seg="dock.launchAnimation">${["none", "lift", "bounce", "jelly"].map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === "bounce"}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div></div>
    <div class="group"><span class="label" id="ds-m">Magnification</span><div class="seg" role="group" aria-labelledby="ds-m" data-seg="dock.magnification">${["off", "subtle", "classic"].map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === "subtle"}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div></div>
    <div class="group"><span class="label">Search</span><div><button class="btn small" type="button" data-dock-search>Open search in the dock</button></div></div>
  </div>
</div>`;
}

export function home({ clips }) {
  const cards = FEATURES.map((f) => {
    const c = f.clips.map((id) => clipOf(clips, id)).find(Boolean);
    return `<a class="card" href="features.html#${f.id}">
  ${c ? `<div class="thumb"><img src="media/${c.id}.webp" alt="" loading="lazy" width="480" height="270"></div>` : ""}
  <h3>${esc(f.title)}</h3><p>${esc(f.lede)}</p>
  <div class="meta">${f.status === "dev" ? `<span><span class="dot warn"></span>in development</span>` : `<span><span class="dot ok"></span>in the beta</span>`}</div>
</a>`;
  }).join("\n");
  return `
<section class="hero">
  <div class="inner">
    <p class="eyebrow">Windows 10 &amp; 11 · open source · beta</p>
    <h1>A calmer desktop for Windows.</h1>
    <p class="lede">Lens gives Windows a dock, themes that restyle everything at once, a living wallpaper and a local-first AI helper that asks before it acts. Quit it, and Windows is exactly as you left it.</p>
    <div class="actions">
      <a class="btn primary" href="try.html">Try it in your browser</a>
      <a class="btn" href="${REPO}">View on GitHub</a>
      <span class="meta">MIT · no account · no telemetry</span>
    </div>
    ${dockStage()}
    <p class="meta" style="margin-top:10px">Above is the actual Lens dock component running in this page. Clicking apps is simulated: nothing launches.</p>
  </div>
</section>

<section id="features">
  <div class="inner">
    <div class="section-head"><div><p class="eyebrow">What's in it</p><h2>One desktop, not twelve utilities.</h2></div><p>Every part follows the same design language and the same rules: off until you turn it on, and undoable.</p></div>
    <div class="grid">${cards}</div>
  </div>
</section>

<section id="try">
  <div class="inner">
    <div class="card dither" data-density="0.6" data-seed="9" style="padding:28px">
      <p class="eyebrow">Try it here</p>
      <h2 style="max-width:22ch">Play with the real thing before you install anything.</h2>
      <p class="lede">Every demo on the Try page uses Lens's own code: the dock, the theme packs and the .lenstheme exporter, the Falling Sand scene and the offline command engine.</p>
      <div class="chips" style="margin:16px 0 20px"><a class="btn small" href="try.html#dock">Live dock</a><a class="btn small" href="try.html#themes">Theme lab</a><a class="btn small" href="try.html#sand">Falling Sand</a><a class="btn small" href="try.html#approvals">Approval cards</a><a class="btn small" href="try.html#command">Command engine</a><a class="btn small" href="try.html#voice">Voice</a></div>
      <a class="btn primary" href="try.html">Open the demos</a>
    </div>
  </div>
</section>

<section id="trust">
  <div class="inner">
    <div class="section-head"><div><p class="eyebrow">Trust model</p><h2>Safe to try, easy to leave.</h2></div><p>Restore scripts work even when Lens isn't running.</p></div>
    <div class="trust">${TRUST.map(([t, d]) => `<div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>
  </div>
</section>

<section id="works-on">
  <div class="inner">
    <div class="section-head"><div><p class="eyebrow">Works on</p><h2>Windows 10 and 11.</h2></div><p>Expected support, based on the Windows features each part uses. Real-machine testing is ongoing.</p></div>
    <div class="table"><table><thead><tr><th scope="col">Feature</th><th scope="col">Windows 10</th><th scope="col">Windows 11</th></tr></thead><tbody>${WORKS_ON.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join("")}</tbody></table></div>
  </div>
</section>

<section id="get">
  <div class="inner">
    <div class="section-head"><div><p class="eyebrow">Get it</p><h2>Beta: build from source for now.</h2></div><p>There is no signed installer yet. When there is, it will be on the Releases page.</p></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <div class="card"><h3>Build from source</h3><p>Windows 10 (1809+) or 11, Rust (MSVC) and Bun.</p>
<pre><code>git clone ${REPO.toLowerCase()}
cd lensui
bun install
bun run tauri dev</code></pre></div>
      <div class="card"><h3>Releases</h3><p>Signed builds will appear here, with an updater that checks Lens's signing key.</p><p style="margin-top:12px"><a class="btn small" href="${REPO}/releases">GitHub Releases ↗</a></p>
        <h3 style="margin-top:20px">Help test it</h3><p>Testers get a daily checklist inside Lens and a one-click report.</p><p style="margin-top:12px"><a class="btn small" href="test.html">Today's test plan</a></p></div>
    </div>
  </div>
</section>`;
}

export function features({ clips }) {
  const toc = FEATURES.map((f) => `<a class="btn small" href="#${f.id}">${esc(f.title)}</a>`).join("");
  const sections = FEATURES.map((f) => {
    const cs = f.clips.map((id) => clipOf(clips, id)).filter(Boolean);
    const tabs = cs.length > 1 ? `<div class="clip-tabs seg" role="group" aria-label="Clips" data-clip-tabs>${cs.map((c, i) => `<button type="button" data-show="${c.id}" aria-pressed="${i === 0}">${esc(SHORT[c.id] ?? c.title.slice(0, 24))}</button>`).join("")}</div>` : "";
    return `<article class="feature" id="${f.id}" aria-labelledby="${f.id}-h">
  <div class="clip-col">${tabs ? `<div>${tabs}${cs.map((c, i) => clipFigure(c, "", { hidden: i > 0 })).join("")}</div>` : cs.map((c) => clipFigure(c)).join("")}</div>
  <div>
    ${status(f)}
    <h2 id="${f.id}-h" style="margin-top:14px">${esc(f.title)}</h2>
    <p class="lede">${esc(f.lede)}</p>
    <ul>${f.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    ${f.note ? `<p class="note">${esc(f.note)}</p>` : ""}
    <div class="links">${f.lesson ? `<a class="btn small" href="docs/${f.lesson}.html">How-to</a>` : ""}${f.docs.map((d) => `<a class="btn small" href="${REPO}/blob/main/${d}">${esc(d.split("/").pop())} ↗</a>`).join("")}<button class="btn small" type="button" data-ask="${esc(f.title)}">Ask the Guide</button></div>
  </div>
</article>`;
  }).join("\n");
  return `<section class="hero" style="padding-top:56px"><div class="inner">
  <p class="eyebrow">Features</p><h1>Everything in Lens, with clips.</h1>
  <p class="lede">Each clip is rendered from the real Lens interface. Features marked “in development” are in open pull requests and not in a build yet.</p>
  <div class="chips" style="margin-top:18px">${toc}</div>
</div></section>
<section style="padding-top:40px"><div class="inner">${sections}</div></section>`;
}

export function tryPage() {
  const mats = [["sand", "Sand"], ["water", "Water"], ["stone", "Stone"], ["fire", "Fire"], ["plant", "Vine"], ["eraser", "Eraser"]];
  return `<section class="hero" style="padding-top:56px"><div class="inner">
  <p class="eyebrow">Try it</p><h1>Real Lens code, in your browser.</h1>
  <p class="lede">Nothing here touches your computer. The demos run Lens's own interface code against a pretend system: apps don't launch, nothing is sent anywhere.</p>
</div></section>

<section style="padding-top:28px"><div class="inner">

<div class="widget" id="dock">
  <div class="head"><h2>Live dock</h2><p>The real dock component. Hover, click an app, switch styles and themes.</p></div>
  ${dockStage({ big: true, lazy: true })}
</div>

<div class="widget" id="themes" data-widget="themes">
  <div class="head"><h2>Theme lab</h2><p>Start from one of the 18 packs, tweak it, and download a .lenstheme file Lens can import.</p></div>
  <div class="wbox theme-lab">
    <div class="panel">
      <div><span class="label meta">Pack</span><div class="pack-grid" role="group" aria-label="Theme pack"></div><p class="meta" data-pack-desc style="margin-top:8px"></p></div>
      <div><span class="label meta">Accent</span><div class="swatches" role="group" aria-label="Accent colour"></div><label class="field" style="margin-top:8px">Custom accent <input type="color" value="#fafafa"></label></div>
      <label class="field">Roundness <span class="meta" data-v="radius"></span><input type="range" name="radius" min="0" max="20" value="8"></label>
      <label class="field">Glass <span class="meta" data-v="glass"></span><input type="range" name="glass" min="40" max="100" value="96"></label>
      <label class="field">Dither <span class="meta" data-v="dither"></span><input type="range" name="dither" min="0" max="100" value="35"></label>
      <label class="field">Grain <span class="meta" data-v="grain"></span><input type="range" name="grain" min="0" max="100" value="20"></label>
      <label class="field">Name <input type="text" name="themename" placeholder="My theme" maxlength="40"></label>
      <button class="btn primary" type="button" data-export>Download .lenstheme</button>
      <p class="meta" data-out aria-live="polite"></p>
    </div>
    <div class="mini dither" data-fade="none">
      <div class="win" style="left:6%;top:9%;width:52%;height:46%"><div class="tbar"><i></i><i></i><i></i><span>Notes</span></div><div class="content"><div class="line" style="width:70%"></div><div class="line"></div><div class="line" style="width:85%"></div><div class="line acc" style="width:30%"></div></div></div>
      <div class="win active" style="left:36%;top:30%;width:56%;height:48%"><div class="tbar"><i></i><i></i><i></i><span>Settings — Theme &amp; Look</span></div><div class="content"><div class="line" style="width:40%"></div><div class="line" style="width:90%"></div><div class="line" style="width:60%"></div><span class="btnm">Apply</span></div></div>
      <div class="mdock"><b></b><b></b><b></b><b></b><b></b><b></b></div>
    </div>
  </div>
</div>

<div class="widget" id="sand" data-widget="sand">
  <div class="head"><h2>Falling Sand</h2><p>The actual Playground scene from Lens. Paint with the pointer; right-drag erases. Keyboard: focus the canvas, arrows move, <kbd>Space</kbd> paints.</p></div>
  <div class="wbox">
    <div class="sand-stage" tabindex="0" role="application" aria-label="Falling sand canvas. Arrow keys move the brush, Space paints."></div>
    <div class="tools">
      <label class="field" style="grid-auto-flow:column;align-items:center">Scene <select data-scene><option>Falling Sand</option></select></label>
      <div class="seg" role="group" aria-label="Material" data-mats>${mats.map(([id, l], i) => `<button type="button" data-mat="${id}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>
      <button class="btn small" type="button" data-still aria-pressed="false">Calm: off</button>
      <button class="btn small" type="button" data-clear>Clear</button>
    </div>
  </div>
</div>

<div class="widget" id="approvals" data-widget="approvals">
  <div class="head"><h2>Needs your OK</h2><p>How Lens asks before anything risky. Deny, or press and hold to approve (or hold <kbd>Enter</kbd>).</p></div>
  <div class="wbox dither" data-density="0.55" data-seed="4" style="padding:28px 16px">
    <div class="seg" role="group" aria-label="Card type" data-variants style="margin:0 auto 18px;display:flex;width:max-content;max-width:100%"><button type="button" data-v="delete" aria-pressed="true">Delete</button><button type="button" data-v="payment" aria-pressed="false">Payment</button><button type="button" data-v="send" aria-pressed="false">Send</button><button type="button" data-v="click" aria-pressed="false">Click</button></div>
    <div data-card></div>
    <p id="hold-help" class="meta" style="text-align:center;margin-top:14px">Hold to approve, so a stray click can't do it. <button class="btn small" type="button" data-reset>Reset</button></p>
  </div>
</div>

<div class="widget" id="command" data-widget="command">
  <div class="head"><h2>Command engine</h2><p>Lens's offline engine turns plain requests into actions, with no AI model. This is a tested port of the app's parser.</p></div>
  <div class="wbox">
    <div style="padding:14px 14px 0"><label class="sr" for="cmd-in">Type a request</label><input id="cmd-in" type="text" placeholder="Try: tile left, dark mode, timer 10 min, 5 km in miles…" style="width:100%" autocomplete="off"></div>
    <div class="chips" style="padding:10px 14px 0">${["dark mode", "snap left", "apply tokyo night", "volume 40", "workspace 2", "remind me in 20 minutes to stretch", "5 km in miles", "open spotify", "summarise this page"].map((x) => `<button type="button">${x}</button>`).join("")}</div>
    <div class="cmd-out" aria-live="polite"></div>
  </div>
</div>

<div class="widget" id="voice" data-widget="voice">
  <div class="head"><h2>Voice</h2><p>What talking to Lens looks like. Text only unless you choose to try your microphone.</p></div>
  <div class="wbox">
    <div class="voice-hud"><button class="mic" type="button" aria-pressed="false" aria-label="Simulate a voice command"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><div class="bars" aria-hidden="true">${"<i></i>".repeat(12)}</div><span class="said" aria-live="polite">Press the mic or pick a phrase</span></div>
    <div class="chips" style="padding:0 16px"></div>
    <form style="display:flex;gap:8px;padding:12px 16px"><label class="sr" for="say">Type what you'd say</label><input id="say" name="say" type="text" placeholder="Type what you'd say…" style="flex:1"><button class="btn small" type="submit">Say it <kbd>⏎</kbd></button></form>
    <div data-result style="padding:0 16px 14px" aria-live="polite"></div>
    <div class="tools"><button class="btn small" type="button" data-real-mic>Try with your mic</button><span class="meta">Uses your browser's speech service, which may send audio to the browser maker. Lens itself recognises speech on your PC.</span></div>
  </div>
</div>

</div></section>`;
}

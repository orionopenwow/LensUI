// Lens Browser page agent. Injected into the main frame of every tab before page scripts run.
//
// Lens talks to it only through `webview.eval_with_callback("__lensAgent.run(<nonce>, <cmd>)")`:
// the page never gets Tauri IPC. Everything it returns is treated by Lens as untrusted data.
// Captured natives (click, value setters, fetch, JSON) are taken before page scripts can patch
// them, and `__lensAgent` is a frozen, non-configurable global.
(() => {
  if (window.top !== window || window.__lensAgent) return;
  const W = window;
  const D = document;
  const JSONs = JSON.stringify.bind(JSON);
  const JSONp = JSON.parse.bind(JSON);
  const natClick = HTMLElement.prototype.click;
  const natFetch = W.fetch ? W.fetch.bind(W) : null;
  const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  const areaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
  const TEXT_CAP = 200000;
  const refs = new Map(); // ref number → element (rebuilt by each snapshot)
  const jobs = new Map(); // async jobs (captions) → result
  const events = []; // context-menu choices waiting for Lens to collect
  let muted = false;
  let menuHost = null;

  const clip = (s, n) => (s && s.length > n ? s.slice(0, n) : s || "");
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const labelOf = (el) => {
    if (el.labels && el.labels.length) return clean(el.labels[0].textContent);
    const by = el.getAttribute("aria-labelledby");
    if (by) return clean(by.split(/\s+/).map((id) => (D.getElementById(id) || {}).textContent || "").join(" "));
    return clean(el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("title") || "");
  };
  const isCaptcha = (el) => {
    const s = `${el.id} ${el.className} ${el.getAttribute("name") || ""} ${el.src || ""}`.toLowerCase();
    return /captcha|recaptcha|hcaptcha|turnstile|cf-chl/.test(s);
  };
  const formFlags = (form) => {
    if (!form) return { pw: false, card: false };
    const pw = !!form.querySelector('input[type="password"]');
    const card = !!form.querySelector('input[autocomplete^="cc-"],input[name*="card" i],input[name*="cvc" i],input[name*="cvv" i]') ||
      /stripe|braintree|adyen|checkout|payment|paypal/i.test(form.getAttribute("action") || "");
    return { pw, card };
  };
  const pageHasPassword = () => [...D.querySelectorAll('input[type="password"]')].some(visible);
  const captchaOnPage = () => [...D.querySelectorAll("iframe,div")].slice(0, 400).some((e) => isCaptcha(e) && visible(e));

  function targetOf(el) {
    const form = el.form || el.closest("form");
    const f = formFlags(form);
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || "",
      inputType: (el.getAttribute("type") || "").toLowerCase(),
      name: clip(el.getAttribute("name") || el.id || "", 80),
      label: clip(labelOf(el), 160),
      text: clip(clean(el.innerText || el.value || ""), 160),
      autocomplete: (el.getAttribute("autocomplete") || "").toLowerCase(),
      href: el.href ? String(el.href).slice(0, 2048) : "",
      inForm: !!form,
      formHasPassword: f.pw,
      formHasCard: f.card,
      isCaptcha: isCaptcha(el) || (!!form && [...form.querySelectorAll("iframe")].some(isCaptcha)),
    };
  }

  // ---- Readable text (a small readability: main/article, minus nav, ads and boilerplate) ----
  function readable() {
    const root = D.querySelector("article, main, [role=main]") || D.body;
    if (!root) return "";
    const skip = /^(nav|header|footer|aside|script|style|noscript|svg|form|button|iframe)$/i;
    const out = [];
    const walk = (n) => {
      if (out.join("").length > TEXT_CAP) return;
      if (n.nodeType === 3) {
        const t = n.textContent.replace(/\s+/g, " ");
        if (t.trim()) out.push(t);
        return;
      }
      if (n.nodeType !== 1 || skip.test(n.tagName)) return;
      const cls = `${n.className}`.toLowerCase();
      if (/\b(ad|ads|advert|cookie|banner|promo|newsletter|share|social|related)\b/.test(cls)) return;
      const tag = n.tagName;
      if (/^H[1-6]$/.test(tag)) out.push(`\n\n${"#".repeat(Number(tag[1]))} `);
      else if (tag === "LI") out.push("\n- ");
      else if (/^(P|DIV|SECTION|BR|TR|BLOCKQUOTE|PRE)$/.test(tag)) out.push("\n");
      if (tag === "A" && n.href && /^https?:/.test(n.href)) {
        const t = clean(n.textContent);
        if (t) { out.push(`[${t}](${n.href})`); return; }
      }
      for (const c of n.childNodes) walk(c);
    };
    walk(root);
    return clip(out.join("").replace(/\n{3,}/g, "\n\n").trim(), TEXT_CAP);
  }

  // Lines that mention money, fees or irreversibility — shown on the approval card.
  function notes() {
    const text = (D.body && D.body.innerText) || "";
    const lines = text.split(/\n+/).map(clean).filter((l) => l.length > 6 && l.length < 220);
    const hits = lines.filter((l) => /(\$|€|£)\s?\d|\bfee\b|no[- ]show|non[- ]refundable|cannot be undone|charged|cancellation/i.test(l));
    return [...new Set(hits)].slice(0, 6);
  }

  function snapshot() {
    refs.clear();
    const sel = 'a[href],button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=tab],[contenteditable="true"],summary';
    const els = [...D.querySelectorAll(sel)].filter(visible).slice(0, 250);
    const elements = els.map((el, i) => {
      refs.set(i + 1, el);
      const r = el.getBoundingClientRect();
      return { ref: i + 1, ...targetOf(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
    });
    return {
      url: location.href,
      title: D.title,
      lang: D.documentElement.lang || "",
      text: readable(),
      elements,
      notes: notes(),
      hasPasswordField: pageHasPassword(),
      captcha: captchaOnPage(),
      scrollY: W.scrollY,
    };
  }

  // Everything the "Needs your OK" card shows about one element.
  function describe(ref) {
    const el = refs.get(ref);
    if (!el || !el.isConnected) return { ok: false, msg: "That element is gone; take a fresh look at the page." };
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    const form = el.form || el.closest("form");
    const fields = form
      ? [...form.querySelectorAll("input,select,textarea")].filter((f) => f.type !== "hidden" && visible(f)).slice(0, 12).map((f) => {
          const secret = f.type === "password" || /^cc-|one-time-code/.test(f.autocomplete || "");
          return { label: clip(labelOf(f) || f.name || f.type, 60), value: secret ? "••••" : clip(f.type === "checkbox" ? (f.checked ? "yes" : "no") : f.value, 80) };
        })
      : [];
    const cs = getComputedStyle(el);
    return {
      ok: true,
      target: targetOf(el),
      rect: [r.left, r.top, r.width, r.height],
      dpr: W.devicePixelRatio || 1,
      look: { bg: cs.backgroundColor, fg: cs.color, radius: cs.borderRadius, font: cs.fontFamily, weight: cs.fontWeight },
      context: clip(clean((el.closest("section,form,article,div") || el).innerText), 400),
      fields,
      notes: notes(),
      host: location.host,
      title: D.title,
      at: Date.now(),
    };
  }

  function act(cmd) {
    const el = cmd.ref ? refs.get(cmd.ref) : null;
    if (cmd.ref && (!el || !el.isConnected)) return { ok: false, msg: "That element is gone; take a fresh look at the page." };
    switch (cmd.do) {
      case "scroll":
        if (el) el.scrollIntoView({ block: "center" });
        else W.scrollBy({ top: Number(cmd.dy) || 600, behavior: "smooth" });
        return { ok: true, msg: "Scrolled." };
      case "click":
      case "submit":
        el.scrollIntoView({ block: "center" });
        el.focus && el.focus();
        natClick.call(el);
        return { ok: true, msg: `Clicked “${clip(clean(el.innerText || el.value || labelOf(el)), 60)}”.` };
      case "type": {
        if (el.type === "password") return { ok: false, msg: "Lens never types passwords." };
        const v = String(cmd.text ?? "");
        el.focus && el.focus();
        if (el.isContentEditable) el.textContent = v;
        else (el.tagName === "TEXTAREA" ? areaSetter : inputSetter).call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, msg: `Typed into “${clip(labelOf(el) || el.name, 40)}”.` };
      }
      case "select": {
        selectSetter.call(el, String(cmd.value ?? ""));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, msg: "Picked an option." };
      }
      default:
        return { ok: false, msg: "Unknown action." };
    }
  }

  // ---- YouTube captions: the caption tracks the player itself loads (captions only) ----
  function captionTracks() {
    let pr = null;
    try {
      const p = D.getElementById("movie_player");
      pr = (p && p.getPlayerResponse && p.getPlayerResponse()) || W.ytInitialPlayerResponse || null;
    } catch (_) { pr = W.ytInitialPlayerResponse || null; }
    const list = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer && pr.captions.playerCaptionsTracklistRenderer.captionTracks;
    const vid = pr && pr.videoDetails ? { id: pr.videoDetails.videoId, title: pr.videoDetails.title, author: pr.videoDetails.author, seconds: Number(pr.videoDetails.lengthSeconds) || 0 } : null;
    return {
      video: vid,
      tracks: (list || []).map((t) => ({ baseUrl: t.baseUrl, lang: t.languageCode, name: (t.name && (t.name.simpleText || (t.name.runs || []).map((r) => r.text).join(""))) || t.languageCode, auto: t.kind === "asr" })),
    };
  }
  function startCaptions(job, lang) {
    const { video, tracks } = captionTracks();
    if (!/(^|\.)youtube\.com$/.test(location.hostname)) { jobs.set(job, { done: true, error: "not_youtube" }); return; }
    if (!tracks.length) { jobs.set(job, { done: true, error: "no_captions", video }); return; }
    const pick = tracks.find((t) => t.lang === lang && !t.auto) || tracks.find((t) => t.lang === lang) || tracks.find((t) => !t.auto) || tracks[0];
    const url = new URL(pick.baseUrl, location.href);
    if (!/(^|\.)youtube\.com$/.test(url.hostname)) { jobs.set(job, { done: true, error: "bad_track" }); return; }
    url.searchParams.set("fmt", "json3");
    jobs.set(job, { done: false });
    natFetch(url.toString(), { credentials: "same-origin" })
      .then((r) => r.text())
      .then((body) => jobs.set(job, { done: true, video, track: { lang: pick.lang, name: pick.name, auto: pick.auto }, tracks: tracks.map(({ baseUrl, ...t }) => t), body: clip(body, 2000000) }))
      .catch((e) => jobs.set(job, { done: true, error: String(e && e.message || e) }));
  }

  // ---- Unsaved work: edited fields or chosen files keep the tab awake ----
  let dirty = false;
  addEventListener("input", (e) => { const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (t && t.isContentEditable)) dirty = true; }, true);
  addEventListener("submit", () => { dirty = false; }, true);
  const busy = () => dirty || [...D.querySelectorAll('input[type="file"]')].some((f) => f.files && f.files.length > 0);

  // ---- Lens shortcuts while the page has focus (only Lens's own combos) ----
  const LENS_KEYS = { "ctrl+l": 1, "ctrl+t": 1, "ctrl+w": 1, "ctrl+f": 1, "ctrl+j": 1, "ctrl+shift+t": 1, "ctrl+shift+k": 1, "ctrl+d": 1 };
  addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const combo = `ctrl+${e.shiftKey ? "shift+" : ""}${(e.key || "").toLowerCase()}`;
    if (!LENS_KEYS[combo]) return;
    e.preventDefault();
    e.stopPropagation();
    events.push({ action: "key", key: combo, selection: "", linkUrl: "", imageUrl: "", hasVideo: false, isYouTube: false, url: location.href, title: D.title, videoTime: null, at: Date.now() });
  }, true);

  // ---- Glance: Alt+click (or a long press) on a link opens a floating preview in Lens ----
  let pressTimer = 0;
  const glance = (a) => events.push({ action: "glance", linkUrl: a.href, selection: "", imageUrl: "", hasVideo: false, isYouTube: false, url: location.href, title: D.title, videoTime: null, at: Date.now() });
  addEventListener("click", (e) => {
    if (!e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || !/^https?:/.test(a.href)) return;
    e.preventDefault();
    e.stopPropagation();
    glance(a);
  }, true);
  addEventListener("pointerdown", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.pointerType === "mouse" || !/^https?:/.test(a.href)) return;
    pressTimer = setTimeout(() => glance(a), 550);
  }, true);
  addEventListener("pointerup", () => clearTimeout(pressTimer), true);

  // ---- Media ----
  const media = () => [...D.querySelectorAll("video,audio")];
  function applyMute() { for (const m of media()) m.muted = muted || m.muted; }
  new MutationObserver(() => { if (muted) applyMute(); }).observe(D, { childList: true, subtree: true });
  function status() {
    const icon = D.querySelector('link[rel~="icon"]');
    return {
      url: location.href,
      title: D.title,
      favicon: icon ? icon.href : "",
      audible: media().some((m) => !m.paused && !m.muted && m.volume > 0),
      hasVideo: !!D.querySelector("video"),
      scrollY: W.scrollY,
      isYouTube: /(^|\.)youtube\.com$/.test(location.hostname) && location.pathname === "/watch",
      busy: busy(),
      playing: media().some((m) => !m.paused),
      isPdf: D.contentType === "application/pdf",
    };
  }

  // ---- Lens context menu (Shift+right-click always shows the page's own menu) ----
  let menuEnabled = true;
  let aiItems = true;
  let transcriptItems = true;
  const AI_IDS = ["ask", "summarise", "explain", "translate", "rewrite", "extract", "transcribe", "context_add"];
  const ITEMS = [
    ["ask", "Ask about this"], ["summarise", "Summarise"], ["explain", "Explain simply"], ["translate", "Translate"],
    ["rewrite", "Rewrite"], ["extract", "Extract…"], ["-"], ["shelf_add", "Add to Shelf"], ["copy_markdown", "Copy as Markdown"],
    ["context_add", "Copy into context"], ["-"], ["transcribe", "Transcribe video"], ["yt_transcript", "YouTube transcript"], ["pip", "Picture in picture"],
  ];
  function closeMenu() { if (menuHost) { menuHost.remove(); menuHost = null; } }
  function openMenu(e) {
    closeMenu();
    const selection = clip(String(W.getSelection ? W.getSelection() : ""), 20000);
    const t = e.target;
    const link = t.closest && t.closest("a[href]");
    const img = t.closest && t.closest("img");
    const vid = (t.closest && t.closest("video")) || D.querySelector("video");
    const ctx = { selection, linkUrl: link ? link.href : "", imageUrl: img ? img.src : "", hasVideo: !!vid, isYouTube: status().isYouTube };
    menuHost = D.createElement("lens-menu");
    const root = menuHost.attachShadow({ mode: "closed" });
    const items = ITEMS.filter(([id]) => (id === "pip" || id === "transcribe" ? ctx.hasVideo : id === "yt_transcript" ? ctx.isYouTube && transcriptItems : true))
      .filter(([id]) => aiItems || !AI_IDS.includes(id))
      .filter((it, i, all) => it[0] !== "-" || (i > 0 && all[i - 1][0] !== "-" && i < all.length - 1));
    root.innerHTML = `<style>
      :host{all:initial}
      .m{position:fixed;z-index:2147483647;min-width:208px;padding:4px;border-radius:10px;background:var(--b,#141416);color:var(--f,#ededed);
         border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 32px rgba(0,0,0,.38);font:13px/20px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
      button{all:unset;display:block;box-sizing:border-box;width:100%;padding:4px 10px;border-radius:6px;cursor:default}
      button:hover,button:focus{background:rgba(255,255,255,.08)} hr{border:0;border-top:1px solid rgba(255,255,255,.1);margin:4px 2px}
      .h{padding:2px 10px 4px;font:11px/16px ui-monospace,Consolas,monospace;opacity:.6}
    </style><div class="m" role="menu"><div class="h">Lens${ctx.selection ? " · selection" : link ? " · link" : ""}</div>${items
      .map(([id, label]) => (id === "-" ? "<hr>" : `<button role="menuitem" data-id="${id}">${label}</button>`)).join("")}</div>`;
    const m = root.querySelector(".m");
    D.documentElement.appendChild(menuHost);
    const w = 220, h = items.length * 28 + 32;
    m.style.left = `${Math.max(4, Math.min(e.clientX, innerWidth - w - 4))}px`;
    m.style.top = `${Math.max(4, Math.min(e.clientY, innerHeight - h - 4))}px`;
    root.addEventListener("click", (ev) => {
      const b = ev.target.closest && ev.target.closest("button");
      if (!b) return;
      const id = b.dataset.id;
      closeMenu();
      if (id === "pip" && vid) { vid.requestPictureInPicture && vid.requestPictureInPicture().catch(() => {}); return; }
      events.push({ action: id, ...ctx, url: location.href, title: D.title, videoTime: vid ? vid.currentTime : null, at: Date.now() });
      if (events.length > 20) events.shift();
    });
    const first = root.querySelector("button");
    first && first.focus();
  }
  addEventListener("contextmenu", (e) => {
    if (!menuEnabled || e.shiftKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return; // keep spellcheck/paste menus
    e.preventDefault();
    openMenu(e);
  }, true);
  addEventListener("mousedown", (e) => { if (menuHost && !e.composedPath().includes(menuHost)) closeMenu(); }, true);
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); }, true);
  addEventListener("scroll", closeMenu, { passive: true });

  function find(text, back) {
    if (!text) return { ok: true, found: false };
    const found = W.find ? W.find(String(text), false, !!back, true, false, false, false) : false;
    const total = D.body ? (D.body.innerText.toLowerCase().split(String(text).toLowerCase()).length - 1) : 0;
    return { ok: true, found, total };
  }

  const handlers = {
    snapshot: () => snapshot(),
    readable: () => ({ url: location.href, title: D.title, text: readable() }),
    describe: (c) => describe(Number(c.ref)),
    act: (c) => act(c.action || {}),
    status: () => status(),
    events: () => events.splice(0, events.length),
    captionsStart: (c) => { startCaptions(String(c.job), String(c.lang || "en")); return { ok: true }; },
    job: (c) => { const r = jobs.get(String(c.job)); if (r && r.done) jobs.delete(String(c.job)); return r || { done: false }; },
    seek: (c) => { const v = D.querySelector("video"); if (v) v.currentTime = Math.max(0, Number(c.t) || 0); return { ok: !!v }; },
    mute: (c) => { muted = !!c.on; for (const m of media()) m.muted = muted; return { ok: true }; },
    media: (c) => {
      const m = media().find((x) => !x.paused) || media()[0];
      if (!m) return { ok: false };
      if (c.action === "toggle") { if (m.paused) m.play().catch(() => {}); else m.pause(); }
      return { ok: true, playing: !m.paused, title: D.title };
    },
    pip: () => { const v = D.querySelector("video"); if (!v || !v.requestPictureInPicture) return { ok: false }; v.requestPictureInPicture().catch(() => {}); return { ok: true }; },
    find: (c) => find(c.text, c.back),
    menu: (c) => { menuEnabled = !!c.on; aiItems = c.ai !== false; transcriptItems = c.transcripts !== false; if (!menuEnabled) closeMenu(); return { ok: true }; },
    scrollTo: (c) => { W.scrollTo(0, Number(c.y) || 0); return { ok: true }; },
    back: () => { history.back(); return { ok: true }; },
    forward: () => { history.forward(); return { ok: true }; },
  };

  const agent = Object.freeze({
    // Returns a JSON string. Lens matches `nonce` so a page can't pass off its own reply.
    run(nonce, cmd) {
      try {
        const c = typeof cmd === "string" ? JSONp(cmd) : cmd || {};
        const h = handlers[c.op];
        return JSONs({ nonce, ok: true, data: h ? h(c) : null, error: h ? null : "unknown_op" });
      } catch (e) {
        return JSONs({ nonce, ok: false, error: String((e && e.message) || e).slice(0, 300) });
      }
    },
  });
  Object.defineProperty(W, "__lensAgent", { value: agent, writable: false, configurable: false, enumerable: false });
})();

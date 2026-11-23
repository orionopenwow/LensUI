// In-page Lens marks: a tiny Lens orb beside a tweet's action row, in YouTube's player controls,
// on videos, images, 3D models, code blocks and download links. Clicking it opens a short
// command list. Opt-in per placement and per site (settings key "lensMarks").
//
// • Nothing is added to the page's own DOM tree except one host element; the mark and the list
//   live in a CLOSED shadow root in a fixed layer, so there's no layout shift and page CSS can't
//   reach in. Each placement is an adapter: if a site's DOM changes it simply finds nothing.
// • Never on sign-in / banking pages, never in password fields, never reads credentials.
// • Saving media only for plain file URLs; never blob:/MediaSource streams or encrypted media.
//   YouTube gets YouTube's own offline option instead (see docs/IN_PAGE_LENS.md).
// Runs in the extension (dispatch via runtime messages) and in Lens Browser (dispatch through the
// page agent's event queue, window.__lensMarkEvent).
(function () {
  "use strict";
  if (globalThis.__lensMarksLoaded) return;
  globalThis.__lensMarksLoaded = true;
  const M = globalThis.LensMarks;
  if (!M || window.top !== window) return;

  const api = globalThis.browser ?? globalThis.chrome;
  const IN_LENS_BROWSER = !!globalThis.__LENS_MARKS_HOST;
  const HOST = M.normalizeHost(location.hostname);
  const SIZE = 18;
  const DENY = ["accounts.google.com", "login.microsoftonline.com", "login.live.com", "paypal.com", "appleid.apple.com", "bank", "signin", "login"];
  if (DENY.some((d) => HOST.includes(d))) return;

  let settings = M.sanitizeSettings(null);
  let adapters = [];
  const info = new WeakMap(); // element → { kind, anchor(), corner, ctx() }
  let hovered = null;
  let menuFor = null;
  let hideTimer = 0;

  // ---- layer -----------------------------------------------------------------------------------
  const hostEl = document.createElement("lens-marks");
  hostEl.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;contain:layout style;";
  const root = hostEl.attachShadow({ mode: "closed" });
  const dark = () => !matchMedia || matchMedia("(prefers-color-scheme: dark)").matches;
  const reduce = matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.innerHTML = `<style>
    :host{--bg:#141417;--fg:#fafafa;--mut:#a1a1aa;--line:rgb(255 255 255/.12);--hi:rgb(255 255 255/.08)}
    :host([data-light]){--bg:#fff;--fg:#18181b;--mut:#52525b;--line:rgb(0 0 0/.12);--hi:rgb(0 0 0/.06)}
    *{box-sizing:border-box}
    .mark{position:fixed;width:${SIZE}px;height:${SIZE}px;border-radius:50%;padding:0;border:0;cursor:pointer;pointer-events:auto;
      background:#0b0b14;box-shadow:0 0 0 1.5px rgb(228 228 231/.9),0 2px 6px rgb(0 0 0/.35);overflow:hidden;opacity:0;transform:scale(.8);
      transition:opacity .16s ease,transform .16s cubic-bezier(.22,1,.36,1)}
    .mark.on{opacity:1;transform:none}
    .mark:focus-visible{outline:2px solid #818cf8;outline-offset:2px}
    .cloud,.cloud i{position:absolute;inset:0;border-radius:50%}
    .cloud{filter:blur(1.4px) saturate(1.3)}
    .cloud i{mix-blend-mode:screen;opacity:.9}
    .cloud i:nth-child(1){background:radial-gradient(circle at 30% 35%,#ff5f6d 0,transparent 55%)}
    .cloud i:nth-child(2){background:radial-gradient(circle at 70% 30%,#ffd43b 0,transparent 50%)}
    .cloud i:nth-child(3){background:radial-gradient(circle at 60% 72%,#3ddc97 0,transparent 55%)}
    .cloud i:nth-child(4){background:radial-gradient(circle at 28% 70%,#38bdf8 0,transparent 55%)}
    .cloud i:nth-child(5){background:radial-gradient(circle at 50% 50%,#c084fc 0,transparent 45%)}
    ${reduce ? "" : `.mark:hover .cloud i,.mark[aria-expanded=true] .cloud i{animation:b var(--d) ease-in-out infinite alternate}
    .cloud i:nth-child(1){--d:2.3s}.cloud i:nth-child(2){--d:2.9s;animation-delay:-.7s}.cloud i:nth-child(3){--d:3.7s;animation-delay:-1.3s}
    .cloud i:nth-child(4){--d:3.1s;animation-delay:-.4s}.cloud i:nth-child(5){--d:4.3s;animation-delay:-2s}
    @keyframes b{0%{transform:translate(0,0) scale(1)}50%{transform:translate(12%,-10%) scale(1.25)}100%{transform:translate(-10%,8%) scale(.85)}}`}
    .menu{position:fixed;width:248px;pointer-events:auto;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:12px;
      box-shadow:0 12px 32px rgb(0 0 0/.32);padding:6px;font:13px/18px system-ui,-apple-system,"Segoe UI",sans-serif;
      ${reduce ? "" : "animation:in .16s cubic-bezier(.22,1,.36,1);"}}
    @keyframes in{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
    .q{width:100%;border:0;outline:0;background:transparent;color:var(--fg);font:inherit;padding:6px 8px 8px;border-bottom:1px solid var(--line);margin-bottom:4px}
    .q::placeholder{color:var(--mut)}
    .row{display:flex;align-items:center;gap:10px;width:100%;padding:7px 8px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
    .row[aria-selected=true],.row:hover{background:var(--hi)}
    .row svg{width:15px;height:15px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
    .row span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .row kbd{font:11px/1 ui-monospace,monospace;color:var(--mut)}
    .more{color:var(--mut)}
    .empty{padding:8px;color:var(--mut)}
    .toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--bg);color:var(--fg);border:1px solid var(--line);
      border-radius:10px;padding:8px 14px;font:13px/18px system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgb(0 0 0/.25)}
  </style>`;
  const markBtn = document.createElement("button");
  markBtn.className = "mark";
  markBtn.type = "button";
  markBtn.setAttribute("aria-label", "Lens actions");
  markBtn.setAttribute("aria-haspopup", "menu");
  markBtn.setAttribute("aria-expanded", "false");
  markBtn.innerHTML = '<span class="cloud"><i></i><i></i><i></i><i></i><i></i></span>';
  root.append(markBtn);
  const setScheme = () => (dark() ? hostEl.removeAttribute("data-light") : hostEl.setAttribute("data-light", ""));
  setScheme();

  // ---- icons (stroke paths, 24×24) -------------------------------------------------------------
  const ICON = {
    bookmark: "M6 3h12v18l-6-4-6 4z", copy: "M8 8h12v12H8zM4 16V4h12", quote: "M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6",
    doc: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5", spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z", globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
    layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5", send: "M4 12l16-8-6 16-3-7z", chat: "M4 5h16v11H9l-5 4z", text: "M5 6h14M5 11h14M5 16h9",
    list: "M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1", link: "M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1",
    camera: "M4 8h4l2-3h4l2 3h4v11H4zM12 11a3 3 0 100 6 3 3 0 000-6", download: "M12 4v11M7 10l5 5 5-5M5 20h14", music: "M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z",
    pip: "M3 5h18v14H3zM12 12h7v5h-7z", loop: "M17 2l3 3-3 3M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 01-4 4H4", speed: "M12 13l4-4M4 18a9 9 0 1116 0",
    mic: "M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3", palette: "M12 3a9 9 0 000 18c1 0 2-1 2-2s-1-2 0-3 3 0 5-2a9 9 0 00-7-11zM7.5 11h.01M10 7h.01M15 7h.01",
    image: "M3 5h18v14H3zM3 16l5-5 5 5 3-3 5 5M15 9h.01", search: "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5", cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
    play: "M7 4l13 8-13 8z", shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6",
    window: "M3 5h18v14H3zM3 9h18", more: "M5 12h.01M12 12h.01M19 12h.01",
  };
  const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n] || ICON.more}"/></svg>`;

  // ---- adapters --------------------------------------------------------------------------------
  const txt = (el) => (el ? (el.innerText || el.textContent || "").trim() : "");
  const abs = (h) => {
    try {
      return new URL(h, location.href).href;
    } catch {
      return "";
    }
  };
  const isVisible = (el, minW = 1, minH = 1) => {
    const r = el.getBoundingClientRect();
    return r.width >= minW && r.height >= minH;
  };

  /** adapter id → scan(root) registering { el, kind, anchor, corner, ctx } */
  const SCANS = {
    x(reg) {
      for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
        const bar = art.querySelector('[role="group"]');
        if (!bar) continue;
        reg(art, "post", () => bar, "right", () => {
          const link = [...art.querySelectorAll('a[href*="/status/"]')].find((a) => a.querySelector("time"));
          const name = art.querySelector('[data-testid="User-Name"]');
          return {
            text: txt(art.querySelector('[data-testid="tweetText"]')),
            author: txt(name?.querySelector("span")),
            handle: (txt(name).match(/@\w+/) || [""])[0],
            time: link?.querySelector("time")?.getAttribute("datetime") || "",
            url: link ? abs(link.getAttribute("href")) : location.href,
            media: [...art.querySelectorAll('img[src*="/media/"]')].map((i) => i.src).slice(0, 4),
          };
        });
      }
    },
    youtube(reg) {
      const player = document.querySelector("#movie_player");
      const controls = player?.querySelector(".ytp-right-controls");
      if (player && controls) {
        reg(player, "yt", () => controls, "before", () => {
          const v = player.querySelector("video");
          return {
            url: location.href, title: document.title.replace(/ - YouTube$/, ""), time: v ? v.currentTime : 0,
            hasCaptions: !!player.querySelector(".ytp-subtitles-button"), video: v,
          };
        });
      }
      const row = document.querySelector("ytd-watch-metadata #top-level-buttons-computed, ytd-watch-metadata #actions-inner");
      if (row) reg(row, "yt", () => row, "after", () => ({ url: location.href, title: document.title.replace(/ - YouTube$/, ""), time: document.querySelector("#movie_player video")?.currentTime || 0, hasCaptions: true, video: document.querySelector("#movie_player video") }));
      for (const th of document.querySelectorAll("ytd-thumbnail a#thumbnail[href]")) {
        reg(th, "result", () => th, "corner", () => ({ url: abs(th.getAttribute("href")), title: txt(th.closest("ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer")?.querySelector("#video-title")) }));
      }
    },
    reddit(reg) {
      for (const p of document.querySelectorAll("shreddit-post, shreddit-comment")) {
        reg(p, "thread", () => p, "corner", () => ({ text: txt(p.querySelector('[slot="text-body"], [slot="comment"], [id$="-post-rtjson-content"]')) || txt(p).slice(0, 4000), title: p.getAttribute("post-title") || document.title, url: abs(p.getAttribute("permalink") || location.href), author: p.getAttribute("author") || "" }));
      }
    },
    hn(reg) {
      for (const row of document.querySelectorAll("tr.athing")) {
        reg(row, "thread", () => row, "right", () => {
          const a = row.querySelector(".titleline > a");
          return { title: txt(a) || txt(row.querySelector(".commtext")), text: txt(row.querySelector(".commtext")), url: a ? abs(a.getAttribute("href")) : location.href };
        });
      }
    },
    github(reg) {
      const head = document.querySelector('#repository-container-header, [data-testid="repository-container-header"]');
      const repo = (location.pathname.match(/^\/([^/]+\/[^/]+)/) || [])[1];
      if (head && repo) reg(head, "repo", () => head, "corner", () => ({ url: `https://github.com/${repo}`, repo, title: repo }));
      for (const code of document.querySelectorAll(".markdown-body pre, .react-code-file-contents, .blob-wrapper")) {
        reg(code, "ghcode", () => code, "corner", () => ({ code: txt(code).slice(0, 20000), url: location.href, raw: (document.querySelector('a[data-testid="raw-button"], a#raw-url') || {}).href || "" }));
      }
      for (const a of document.querySelectorAll('a[href*="/releases/download/"]')) {
        reg(a, "ghasset", () => a, "after", () => ({ url: abs(a.getAttribute("href")), title: txt(a) }));
      }
    },
    search(reg) {
      for (const r of document.querySelectorAll("#search .MjjYud, #search div.g, li.b_algo, article[data-testid='result']")) {
        const a = r.querySelector("a[href^='http'] h3, h2 a[href^='http'], a[data-testid='result-title-a']");
        const link = a?.closest("a") || (a?.tagName === "A" ? a : null);
        if (!link) continue;
        reg(r, "result", () => r, "corner", () => ({ url: link.href, title: txt(a) }));
      }
    },
    music(reg) {
      for (const row of document.querySelectorAll('[data-testid="tracklist-row"], .soundList__item')) {
        reg(row, "track", () => row, "right", () => ({ title: txt(row.querySelector('[data-testid="internal-track-link"], .soundTitle__title')) || txt(row).split("\n")[0], url: (row.querySelector("a[href]") || {}).href || location.href }));
      }
    },
    docs() {
      /* selection bubble + Alt+L cover these editors (their DOM is canvas/contenteditable). */
    },
    media(reg) {
      if (M.hostMatches(HOST, ["youtube.com"])) return; // the YouTube adapter covers its player
      for (const m of document.querySelectorAll("video, audio")) {
        if (m.tagName === "VIDEO" && !isVisible(m, 160, 90)) continue;
        reg(m, "media", () => m, "corner", () => {
          const src = m.currentSrc || m.src || m.querySelector("source")?.src || "";
          const encrypted = !!m.mediaKeys;
          return { src, url: location.href, title: document.title, canSave: M.mediaSaveAllowed({ src, host: HOST, encrypted }), media: m };
        });
      }
    },
    images(reg) {
      for (const img of document.querySelectorAll("img")) {
        if (img.closest('article[data-testid="tweet"], a#thumbnail')) continue;
        if ((img.naturalWidth || 0) < 200 || !isVisible(img, 160, 120)) continue;
        reg(img, "image", () => img, "corner", () => ({ src: img.currentSrc || img.src, url: img.currentSrc || img.src, title: img.alt || document.title, img }));
      }
    },
    models(reg) {
      for (const mv of document.querySelectorAll("model-viewer, iframe[src*='sketchfab.com/models'], iframe[src*='sketchfab.com/3d-models']")) {
        reg(mv, "model", () => mv, "corner", () => ({ url: abs(mv.getAttribute("src") || ""), src: abs(mv.getAttribute("src") || ""), title: mv.getAttribute("alt") || mv.getAttribute("title") || document.title, canSave: M.fileKind(mv.getAttribute("src") || "") === "model" }));
      }
      for (const a of document.querySelectorAll("a[href]")) {
        if (M.fileKind(a.getAttribute("href")) !== "model") continue;
        reg(a, "model", () => a, "after", () => ({ url: abs(a.getAttribute("href")), src: abs(a.getAttribute("href")), title: txt(a), canSave: true }));
      }
    },
    code(reg) {
      if (M.hostMatches(HOST, ["github.com"])) return;
      for (const pre of document.querySelectorAll("pre")) {
        const code = txt(pre);
        if (code.length < 20 || !isVisible(pre, 120, 24)) continue;
        reg(pre, "code", () => pre, "corner", () => ({ code: code.slice(0, 20000), url: location.href, title: document.title }));
      }
    },
    files(reg) {
      if (M.hostMatches(HOST, ["github.com"])) return; // GitHub release assets have their own adapter
      for (const a of document.querySelectorAll("a[href]")) {
        if (M.fileKind(a.getAttribute("href")) !== "file") continue;
        reg(a, "file", () => a, "after", () => ({ url: abs(a.getAttribute("href")), title: txt(a), canSave: true }));
      }
    },
  };

  let scanQueued = false;
  function scan() {
    scanQueued = false;
    let n = 0;
    const reg = (el, kind, anchor, corner, ctx) => {
      if (n++ > 600 || info.has(el)) return;
      info.set(el, { kind, anchor, corner, ctx });
    };
    for (const a of adapters) {
      try {
        SCANS[a.id]?.(reg);
      } catch {
        /* a site changed shape: this adapter just finds nothing */
      }
    }
  }
  const queueScan = () => {
    if (scanQueued || !adapters.length) return;
    scanQueued = true;
    (globalThis.requestIdleCallback || setTimeout)(scan, 400);
  };
  const mo = new MutationObserver(queueScan);

  // ---- hover → show the mark -------------------------------------------------------------------
  function candidateFor(node) {
    for (let el = node, i = 0; el && i < 14; el = el.parentElement, i++) if (info.has(el)) return el;
    return null;
  }
  function place() {
    if (!hovered) return;
    const it = info.get(hovered);
    const a = it.anchor();
    if (!a || !a.isConnected) return hide(true);
    const r = a.getBoundingClientRect();
    const vp = { width: document.documentElement.clientWidth || innerWidth, height: innerHeight };
    let pos;
    if (it.corner === "before") pos = { left: Math.round(r.left - SIZE - 6), top: Math.round(r.top + (r.height - SIZE) / 2) };
    else if (it.corner === "after") pos = { left: Math.round(r.right + 6), top: Math.round(r.top + (r.height - SIZE) / 2) };
    else pos = M.markPosition(r, vp, SIZE, it.corner === "corner" ? 8 : 6, it.corner);
    markBtn.style.left = pos.left + "px";
    markBtn.style.top = pos.top + "px";
  }
  function show(el) {
    clearTimeout(hideTimer);
    if (hovered === el && markBtn.classList.contains("on")) return;
    if (menuFor) return;
    hovered = el;
    place();
    markBtn.classList.add("on");
  }
  function hide(now) {
    clearTimeout(hideTimer);
    const go = () => {
      if (menuFor) return;
      markBtn.classList.remove("on");
      hovered = null;
    };
    if (now) go();
    else hideTimer = setTimeout(go, 280);
  }
  document.addEventListener("pointerover", (e) => {
    if (!adapters.length) return;
    const el = candidateFor(e.target);
    if (el) show(el);
    else if (e.target !== hostEl) hide();
  }, { passive: true, capture: true });
  markBtn.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  addEventListener("scroll", () => (menuFor ? closeMenu() : place()), { passive: true, capture: true });
  addEventListener("resize", () => place(), { passive: true });

  // ---- the command list --------------------------------------------------------------------------
  let menu = null;
  let rows = [];
  let sel = 0;
  function closeMenu(focusBack) {
    if (!menu) return;
    menu.remove();
    menu = null;
    menuFor = null;
    markBtn.setAttribute("aria-expanded", "false");
    if (focusBack) markBtn.focus();
    hide();
  }
  function openMenu(el, page) {
    closeMenu();
    const it = page ? { kind: "page", ctx: () => ({ url: location.href, title: document.title, text: String(getSelection() || "") }) } : info.get(el);
    let ctx;
    try {
      ctx = it.ctx() || {};
    } catch {
      ctx = {};
    }
    ctx.host = HOST;
    ctx.kind = it.kind;
    menuFor = { el, it, ctx };
    const all = M.actionsFor(ctx, settings);
    menu = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Lens actions");
    menu.innerHTML = `<input class="q" type="text" placeholder="Type to filter…" aria-label="Filter Lens actions" autocomplete="off" spellcheck="false"><div class="rows"></div>`;
    const q = menu.querySelector(".q");
    const list = menu.querySelector(".rows");
    const render = () => {
      rows = M.filterRows(all, q.value);
      sel = Math.min(sel, Math.max(0, rows.length));
      list.innerHTML = rows.map((r, i) => `<button class="row" role="menuitem" data-i="${i}" aria-selected="${i === sel}">${svg(r.icon)}<span>${r.label}</span><kbd>${r.key}</kbd></button>`).join("")
        + (rows.length ? "" : '<div class="empty">No matching action</div>')
        + `<button class="row more" role="menuitem" data-i="${rows.length}" aria-selected="${sel === rows.length}">${svg("more")}<span>More in Lens…</span><kbd>M</kbd></button>`;
    };
    render();
    list.addEventListener("click", (e) => {
      const b = e.target.closest(".row");
      if (b) choose(Number(b.dataset.i));
    });
    q.addEventListener("input", () => {
      sel = 0;
      render();
    });
    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu(true);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + rows.length + 1) % (rows.length + 1);
        render();
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(sel);
      } else if (!q.value && /^[1-9]$/.test(e.key) && rows[Number(e.key) - 1]) {
        e.preventDefault();
        choose(Number(e.key) - 1);
      } else if (!q.value && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        choose(rows.length);
      }
      e.stopPropagation();
    });
    root.append(menu);
    const r = markBtn.getBoundingClientRect();
    const vp = { width: document.documentElement.clientWidth || innerWidth, height: innerHeight };
    const pos = page ? { left: vp.width - 260, top: 12 } : M.menuPosition({ left: r.left, top: r.top, size: SIZE }, vp, 248, Math.min(300, 52 + 34 * (all.length + 1)));
    menu.style.left = pos.left + "px";
    menu.style.top = pos.top + "px";
    markBtn.setAttribute("aria-expanded", "true");
    q.focus({ preventScroll: true });
  }
  markBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu) closeMenu(true);
    else if (hovered) openMenu(hovered);
  });
  document.addEventListener("pointerdown", (e) => {
    if (menu && !e.composedPath().includes(hostEl)) closeMenu();
  }, true);
  addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "l" || e.key === "L") && adapters.length) {
      e.preventDefault();
      openMenu(null, true);
    }
  }, true);

  function choose(i) {
    const m = menuFor;
    if (!m) return;
    const row = rows[i];
    closeMenu(true);
    if (!row) return dispatch("more", m.ctx);
    if (!IN_LENS_BROWSER) {
      settings = M.rememberLast(settings, HOST, row.id);
      api?.storage?.local.set({ lensMarks: settings }).catch?.(() => {});
    }
    run(row.id, m.ctx);
  }

  // ---- actions ---------------------------------------------------------------------------------
  function toast(text) {
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = text;
    root.append(t);
    setTimeout(() => t.remove(), 2200);
  }
  async function copy(text, done = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast("Couldn't copy here");
    }
  }
  function frameBlob(video) {
    return new Promise((res) => {
      try {
        const c = document.createElement("canvas");
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext("2d").drawImage(video, 0, 0);
        c.toBlob(res, "image/png");
      } catch {
        res(null); // cross-origin frames can't be read
      }
    });
  }
  function palette(img) {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 24;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, 24, 24);
      const d = g.getImageData(0, 0, 24, 24).data;
      const buckets = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const k = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
        const b = buckets.get(k) || [0, 0, 0, 0];
        b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++;
        buckets.set(k, b);
      }
      return [...buckets.values()].sort((a, b) => b[3] - a[3]).slice(0, 5)
        .map((b) => "#" + [0, 1, 2].map((j) => Math.round(b[j] / b[3]).toString(16).padStart(2, "0")).join(""));
    } catch {
      return null; // cross-origin image
    }
  }
  async function run(id, c) {
    const body = c.text || c.code || "";
    switch (id) {
      case "md":
        return copy(M.toMarkdown(c), "Copied as Markdown");
      case "quote":
        return copy(`“${(c.text || "").trim()}”\n— ${c.author || c.handle || "Unknown"}\n${c.url || ""}`.trim(), "Copied quote");
      case "clip":
        return copy(M.timeLink(c.url, c.time), "Copied link at this moment");
      case "copyCode":
        return copy((c.code || "").replace(/ /g, " ").replace(/[ \t]+$/gm, ""), "Copied code");
      case "clone":
        return copy(`git clone https://github.com/${c.repo}.git`, "Copied clone command");
      case "raw":
        return c.raw ? copy(c.raw, "Copied raw link") : copy(c.code || "", "Copied file");
      case "pip": {
        const v = c.media || c.video;
        if (v?.requestPictureInPicture) return v.requestPictureInPicture().catch(() => toast("This site blocks picture-in-picture"));
        return toast("No video here");
      }
      case "loop": {
        const v = c.media || c.video;
        if (v) v.loop = !v.loop, toast(v.loop ? "Looping" : "Loop off");
        return;
      }
      case "speed": {
        const v = c.media || c.video;
        if (v) v.playbackRate = v.playbackRate >= 1.5 ? 1 : 1.5, toast(`Speed ${v.playbackRate}×`);
        return;
      }
      case "frame": {
        const v = c.media || c.video;
        const blob = v && (await frameBlob(v));
        if (!blob) return toast("This video's frames can't be copied");
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          return toast("Frame copied");
        } catch {
          return toast("Couldn't copy the frame");
        }
      }
      case "copyImage": {
        const blob = c.img && (await imageBlob(c.img));
        if (!blob) return copy(c.src, "Copied image link");
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          return toast("Image copied");
        } catch {
          return copy(c.src, "Copied image link");
        }
      }
      case "palette": {
        const p = palette(c.img);
        return p ? copy(p.join(" "), "Copied palette " + p.join(" ")) : toast("This image's colours can't be read here");
      }
      case "theme":
        c.palette = palette(c.img) || [];
        return dispatch("command", { ...c, request: M.requestText(id, c) });
      case "saveFile": {
        if (c.canSave === false || !/^https?:/.test(c.src || c.url || "")) return toast("Saving isn't available for this media");
        const a = document.createElement("a");
        a.href = c.src || c.url;
        a.download = "";
        a.rel = "noopener";
        a.click();
        return toast("Saving…");
      }
      case "offline": {
        const own = document.querySelector("ytd-download-button-renderer button, button[aria-label^='Download']");
        if (own) return own.click();
        return toast("Use YouTube's own Download button (YouTube Premium) to watch offline");
      }
      case "shelf":
      case "snippet":
      case "note":
        return dispatch("shelf", { ...c, text: body || c.title || c.url });
      case "context":
        return dispatch("context", { ...c, text: body });
      case "summarize":
      case "translate":
      case "explain":
        return dispatch("run", { ...c, action: id, text: body });
      case "article":
        return dispatch("run", { ...c, action: "rewrite", text: body });
      case "transcript":
        return dispatch("transcript-shelf", c);
      case "transcriptCopy":
        return dispatch("transcript-copy", c);
      case "claude":
      case "ask":
      case "chapters":
      case "readme":
      case "peek":
        return dispatch("command", { ...c, request: id === "chapters" ? `Turn this video's chapters into notes: ${c.url}` : id === "readme" ? `Summarise the README of ${c.url}` : id === "peek" ? `Summarise this page without opening it: ${c.url}` : body || c.title || c.url });
      default:
        return dispatch("command", { ...c, request: M.requestText(id, c) });
    }
  }
  function imageBlob(img) {
    // Draws the already-loaded image; cross-origin images can't be read, so this returns null.
    return new Promise((res) => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        c.toBlob(res, "image/png");
      } catch {
        res(null);
      }
    });
  }

  /** Hands an action to Lens: runtime message in the extension, lens-mark:// in Lens Browser. */
  function dispatch(kind, c) {
    const clean = { url: c.url || location.href, title: c.title || document.title, text: String(c.text || "").slice(0, 20000), request: c.request || "", action: c.action || "", media: c.media && typeof c.media === "object" && c.media.length ? c.media : undefined };
    if (IN_LENS_BROWSER) {
      if (typeof window.__lensMarkEvent !== "function") return toast("Lens isn't reachable");
      window.__lensMarkEvent(kind === "run" ? clean.action : kind, clean);
      return toast(kind === "shelf" ? "Saved to Shelf" : "Sent to Lens");
    }
    if (!api?.runtime) return toast("Lens isn't reachable");
    const ctx = { selection: clean.text || clean.request, url: clean.url, title: clean.title };
    const msg =
      kind === "shelf" ? { type: "add-shelf", ctx }
      : kind === "context" ? { type: "micro-save", ctx }
      : kind === "run" ? { type: "run", action: clean.action, ctx }
      : kind === "transcript-shelf" ? { type: "transcript-shelf" }
      : kind === "transcript-copy" ? { type: "transcript-load" }
      : kind === "more" ? { type: "open-panel", ctx }
      : { type: "open-command", ctx: { ...ctx, selection: clean.request || clean.text } };
    api.runtime.sendMessage(msg).then((r) => {
      if (kind === "transcript-copy") {
        const t = Array.isArray(r?.segments) ? r.segments.map((x) => x.text).join(" ").replace(/\s+/g, " ").trim() : "";
        return t ? copy(t, "Copied transcript") : toast(r?.error || "No transcript for this video");
      }
      toast(r && r.ok === false ? r.error || "Lens couldn't do that" : kind === "shelf" ? "Saved to Shelf" : kind === "run" ? "Answering in Lens…" : "Sent to Lens");
    }).catch(() => toast("Lens isn't reachable — is it running?"));
  }

  // ---- settings & start ------------------------------------------------------------------------
  function apply(s) {
    settings = M.sanitizeSettings(s);
    adapters = M.activeAdapters(settings, HOST);
    if (adapters.length) {
      if (!hostEl.isConnected) document.documentElement.append(hostEl);
      mo.observe(document.documentElement, { childList: true, subtree: true });
      queueScan();
    } else {
      mo.disconnect();
      closeMenu();
      hide(true);
    }
  }
  if (IN_LENS_BROWSER) apply(globalThis.__LENS_MARKS_HOST.settings);
  else if (api?.storage) {
    api.storage.local.get("lensMarks").then((r) => apply(r.lensMarks)).catch(() => {});
    api.storage.onChanged.addListener((ch, area) => area === "local" && ch.lensMarks && apply(ch.lensMarks.newValue));
  }
  matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", setScheme);

  // Test hook (fixture pages only): the shadow root is closed, so tests read state through this.
  if (globalThis.__LENS_MARKS_TEST) {
    globalThis.__lensMarksTest = {
      visible: () => markBtn.classList.contains("on"),
      kind: () => (hovered ? info.get(hovered)?.kind : null),
      rows: () => (menu ? [...menu.querySelectorAll(".row span")].map((e) => e.textContent) : null),
      open: () => markBtn.click(),
      key: (k) => menu?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })),
      markRect: () => markBtn.getBoundingClientRect().toJSON(),
      rescan: () => scan(),
    };
  }
})();

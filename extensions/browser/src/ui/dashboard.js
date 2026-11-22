// Lens Mini for the browser: one dashboard used by the popup, the side panel and the in-page
// panel, so all three look and behave the same as desktop Lens Mini.
//
//   input with a context-mode pill · context chips · 2×3 quick tiles · streaming answer ·
//   Shelf strip · recent answers · footer with provider/privacy and "Open in Lens"
//
// Classic script (no imports/exports): attaches globalThis.LensDash. Everything is built with
// createElement/textContent; no innerHTML, so page or answer text can never become markup.
(function (root) {
  "use strict";

  const CSS = `
.lens-root{--l-bg:#09090b;--l-fg:#fafafa;--l-muted:#a1a1aa;--l-line:#27272a;--l-card:#121215;--l-tile:#18181b;--l-accent:#fafafa;--l-on-accent:#09090b;--l-radius:12px;
  all:initial;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;background:var(--l-bg);color:var(--l-fg);
  font:13px/1.45 "Arial Rounded MT Bold","Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased;padding:12px;width:100%;}
@media (prefers-color-scheme: light){.lens-root:not([data-scheme]){--l-bg:#fafafa;--l-fg:#09090b;--l-muted:#52525b;--l-line:#e4e4e7;--l-card:#ffffff;--l-tile:#f4f4f5;--l-accent:#09090b;--l-on-accent:#fafafa;}}
.lens-root[data-scheme=light]{--l-muted:#52525b;--l-line:#e4e4e7;--l-card:#ffffff;--l-tile:#f4f4f5;}
:where(.lens-root) :where(*){box-sizing:border-box;font:inherit;color:inherit;}
:where(.lens-root) :where(button){all:unset;box-sizing:border-box;cursor:pointer;}
.lens-root [hidden]{display:none!important;}
.lens-root button:focus-visible{outline:2px solid var(--l-accent);outline-offset:2px;}
.lens-root .l-input input:focus-visible{outline:none;}
.l-head{display:flex;align-items:center;gap:8px;}
.l-head img{width:18px;height:18px;border-radius:5px;}
.l-head b{font-weight:700;letter-spacing:.2px;flex:1;}
.l-conn{display:inline-flex;align-items:center;gap:6px;color:var(--l-muted);font-size:11.5px;}
.l-conn i{width:7px;height:7px;border-radius:50%;background:#71717a;display:inline-block;}
.l-conn[data-state=ok] i{background:#22c55e}.l-conn[data-state=off] i{background:#f59e0b}.l-conn[data-state=bad] i{background:#ef4444}
.l-x{width:24px;height:24px;border-radius:8px;display:grid!important;place-items:center;color:var(--l-muted);}
.l-x:hover{background:var(--l-tile);color:var(--l-fg);}
.l-input{display:flex;align-items:center;gap:6px;background:var(--l-card);border:1px solid var(--l-line);border-radius:var(--l-radius);padding:5px 5px 5px 6px;}
.l-input:focus-within{border-color:var(--l-muted);}
.l-pill{flex:none;font-size:11.5px;padding:3px 9px;border-radius:999px;background:var(--l-tile);color:var(--l-fg);white-space:nowrap;}
.l-pill:hover{outline:1px solid var(--l-line);}
.l-input input{all:unset;flex:1;min-width:0;padding:4px 2px;color:var(--l-fg);}
.l-input input::placeholder{color:var(--l-muted);}
.l-send{flex:none;width:28px;height:28px;border-radius:9px;display:grid!important;place-items:center;background:var(--l-accent);color:var(--l-on-accent);}
.l-send svg{stroke:var(--l-on-accent);}
.l-chips{display:flex;gap:6px;flex-wrap:wrap;min-height:0;}
.l-chip{font-size:11px;color:var(--l-muted);border:1px dashed var(--l-line);border-radius:7px;padding:1px 7px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.l-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
.l-tile{display:flex!important;flex-direction:column;align-items:flex-start;gap:6px;padding:10px;border-radius:var(--l-radius);background:var(--l-tile);border:1px solid transparent;min-height:58px;}
.l-tile:hover{border-color:var(--l-line);background:var(--l-card);}
.l-tile[data-default=true]{border-color:var(--l-muted);}
.l-tile span{font-size:12px;font-weight:700;}
.l-tile svg,.l-send svg,.l-x svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
.l-sub{display:flex;gap:6px;flex-wrap:wrap;}
.l-sub button{font-size:11.5px;padding:3px 9px;border-radius:999px;border:1px solid var(--l-line);}
.l-sub button:hover{border-color:var(--l-muted);}
.l-card{background:var(--l-card);border:1px solid var(--l-line);border-radius:var(--l-radius);padding:10px;display:flex;flex-direction:column;gap:8px;}
.l-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.l-title{font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.l-badge{font-size:10.5px;padding:1px 8px;border-radius:999px;border:1px solid var(--l-line);color:var(--l-muted);}
.l-badge[data-engine=local]{color:#16a34a;border-color:#16a34a66}.l-badge[data-engine=claude]{color:#c2410c;border-color:#c2410c66}
.l-state{font-size:11.5px;color:var(--l-muted);display:flex;align-items:center;gap:6px;}
.l-spin{width:10px;height:10px;border:2px solid var(--l-line);border-top-color:var(--l-fg);border-radius:50%;animation:lspin .8s linear infinite;}
@keyframes lspin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.l-spin{animation:none}}
.l-text{white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:220px;overflow:auto;}
.l-err{color:#dc2626;font-size:11.5px;}
.l-btn{font-size:11.5px;padding:4px 10px;border-radius:8px;border:1px solid var(--l-line);}
.l-btn:hover{border-color:var(--l-muted);}
.l-btn.primary{background:var(--l-accent);color:var(--l-on-accent);border-color:var(--l-accent);font-weight:700;}
.l-sec{display:flex;flex-direction:column;gap:6px;}
.l-sec-h{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:700;color:var(--l-muted);text-transform:uppercase;letter-spacing:.6px;}
.l-sec-h button{text-transform:none;letter-spacing:0;font-weight:400;font-size:11.5px;color:var(--l-muted);}
.l-sec-h button:hover{color:var(--l-fg);}
.l-strip{display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin;padding-bottom:2px;}
.l-item{flex:none;width:128px;display:flex!important;flex-direction:column;gap:2px;padding:8px;border-radius:10px;background:var(--l-tile);border:1px solid transparent;}
.l-item:hover{border-color:var(--l-line);}
.l-item b{font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.l-item small{font-size:10.5px;color:var(--l-muted);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.l-empty{font-size:11.5px;color:var(--l-muted);padding:6px 0;}
.l-recent{display:flex;flex-direction:column;gap:2px;}
.l-recent button{display:flex!important;gap:8px;align-items:center;padding:5px 6px;border-radius:8px;font-size:12px;}
.l-recent button:hover{background:var(--l-tile);}
.l-recent button span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.l-recent time{color:var(--l-muted);font-size:11px;}
.l-foot{display:flex;align-items:center;gap:8px;border-top:1px solid var(--l-line);padding-top:9px;margin-top:2px;}
.l-provider{font-size:11px;padding:2px 9px;border-radius:999px;border:1px solid var(--l-line);}
.l-privacy{flex:1;font-size:10.5px;color:var(--l-muted);line-height:1.3;}
.l-toast{font-size:11.5px;color:var(--l-muted);}
.lens-root[data-surface=inpage]{width:340px;border:1px solid var(--l-line);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);padding:10px;}
.lens-root[data-surface=inpage] .l-tile{min-height:50px;padding:8px;}
`;

  // Small Lucide-style icons (24×24 paths).
  const ICONS = {
    summarize: ["M4 6h16", "M4 12h10", "M4 18h7"],
    explain: ["M9 18h6", "M10 22h4", "M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"],
    translate: ["M4 5h8", "M8 3v2", "M5 9c1.5 3 4 5 7 6", "M11 5c-1 4-3.5 7-7 9", "M13 21l4-9 4 9", "M14.5 18h5"],
    rewrite: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
    ask: ["M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"],
    shelf_add: ["M4 20h16", "M6 16V6", "M10 16V4", "M14.5 16.2 17 6.5l3.8 1-2.5 9.7"],
    send: ["M5 12h14", "M13 6l6 6-6 6"],
    close: ["M6 6l12 12", "M18 6L6 18"],
  };

  const TILES = [
    { action: "summarize", label: "Summarise", options: [["tldr", "TL;DR"], ["key_points", "Key points"], ["detailed", "Detailed"]], defaultOption: "tldr" },
    { action: "explain", label: "Explain" },
    { action: "translate", label: "Translate", langs: ["English", "Spanish", "French", "German", "Japanese", "Chinese (Simplified)"] },
    { action: "rewrite", label: "Rewrite", options: [["shorter", "Shorter"], ["friendlier", "Friendlier"], ["formal", "Formal"]] },
    { action: "ask", label: "Ask" },
    { action: "shelf_add", label: "Add to Shelf" },
  ];

  const LABEL = { summarize: "Summary", explain: "Explanation", translate: "Translation", rewrite: "Rewrite", ask: "Answer", fix_grammar: "Grammar fix", extract: "Extract", compare: "Comparison" };
  const STATE_TEXT = { sending: "Sending…", pending: "Waiting for you to confirm in Lens", running: "Answering…", declined: "Declined in Lens", failed: "Failed" };

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }

  function icon(name) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const d of ICONS[name] || []) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      svg.append(p);
    }
    return svg;
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function ago(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return "now";
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${Math.round(s / 3600)}h`;
    return `${Math.round(s / 86400)}d`;
  }

  /** Lens theme tokens (from the host) → CSS variables. null = follow the browser. */
  function applyTheme(el, t) {
    if (!t || !t.bg) {
      el.removeAttribute("data-scheme");
      return;
    }
    el.setAttribute("data-scheme", t.scheme === "light" ? "light" : "dark");
    el.style.setProperty("--l-bg", t.bg);
    el.style.setProperty("--l-fg", t.fg);
    el.style.setProperty("--l-accent", t.accent);
    el.style.setProperty("--l-on-accent", t.scheme === "light" ? "#fafafa" : "#09090b");
    if (t.scheme !== "light") {
      el.style.setProperty("--l-card", "color-mix(in srgb, " + t.fg + " 5%, " + t.bg + ")");
      el.style.setProperty("--l-tile", "color-mix(in srgb, " + t.fg + " 8%, " + t.bg + ")");
      el.style.setProperty("--l-line", "color-mix(in srgb, " + t.fg + " 15%, " + t.bg + ")");
    }
    if (typeof t.radius === "number") el.style.setProperty("--l-radius", Math.max(6, Math.min(20, t.radius + 4)) + "px");
  }

  /** The context the mode pill offers, given what's available. */
  function modesFor(ctx) {
    const m = [];
    if (ctx && ctx.selection) m.push(["selection", "Selection"]);
    if (ctx && (ctx.pageText || ctx.url)) m.push(["page", "This page"]);
    m.push(["none", "No context"]);
    return m;
  }

  function scoped(ctx, mode) {
    const base = { title: ctx.title, url: ctx.url };
    if (mode === "selection") return { ...base, selection: ctx.selection };
    if (mode === "page") return { ...base, pageText: ctx.pageText };
    return {};
  }

  function chipsFor(ctx, mode) {
    const out = [];
    if (mode === "selection" && ctx.selection) out.push(`Selection · ${ctx.selection.length.toLocaleString()} chars`);
    if (mode === "page" && ctx.pageText) out.push(`Page · ${Math.max(1, Math.round(ctx.pageText.length / 1024))} KB`);
    if (mode !== "none" && ctx.title) out.push(ctx.title);
    if (mode !== "none" && ctx.url) out.push(hostOf(ctx.url));
    return out;
  }

  /**
   * Builds the dashboard into `container`.
   * adapter: { surface, send(msg) → Promise, listen(fn) → unsubscribe, getContext() → Promise<ctx>,
   *            defaultAction?, onClose?, logo? , showRecent?, showShelf? }
   */
  function mount(container, adapter) {
    const surface = adapter.surface || "popup";
    // One copy of the CSS per document / shadow root.
    const scope = container.getRootNode ? container.getRootNode() : document;
    const styleHost = scope.nodeType === 9 ? scope.head || scope.documentElement : scope;
    if (styleHost && !styleHost.querySelector("style[data-lens-dash]")) {
      const st = document.createElement("style");
      st.dataset.lensDash = "1";
      st.textContent = CSS;
      styleHost.append(st);
    }
    const rootEl = h("div", { class: "lens-root", "data-surface": surface, role: "region", "aria-label": "Lens" });
    let ctx = {};
    let mode = "none";
    let preferLocal = true;
    let current = null; // clientId of the answer shown
    let records = [];

    // header
    const conn = h("span", { class: "l-conn", "data-state": "", role: "status" }, h("i"), h("span", { text: "Checking…" }));
    const head = h("div", { class: "l-head" }, adapter.logo ? h("img", { src: adapter.logo, alt: "" }) : null, h("b", { text: "Lens" }), conn);
    if (adapter.onClose) head.append(h("button", { class: "l-x", "aria-label": "Close", onclick: adapter.onClose }, icon("close")));

    // input
    const pill = h("button", { class: "l-pill", "aria-label": "What Lens looks at", title: "" });
    const input = h("input", { type: "text", placeholder: "Ask about this…", "aria-label": "Ask Lens", maxlength: "4000" });
    const send = h("button", { class: "l-send", "aria-label": "Ask" }, icon("send"));
    const inputRow = h("div", { class: "l-input" }, pill, input, send);
    const chips = h("div", { class: "l-chips" });
    const sub = h("div", { class: "l-sub", hidden: true });

    // tiles
    const grid = h("div", { class: "l-grid", role: "group", "aria-label": "Quick actions" });
    for (const t of TILES) {
      const b = h("button", { class: "l-tile", "data-action": t.action, "data-default": t.action === (adapter.defaultAction || "summarize") ? "true" : null }, icon(t.action), h("span", { text: t.label }));
      b.addEventListener("click", () => onTile(t));
      grid.append(b);
    }

    // answer
    const answer = h("section", { class: "l-card l-answer", hidden: true, "aria-live": "polite" });
    const toast = h("div", { class: "l-toast", role: "status" });

    // shelf + recent
    const strip = h("div", { class: "l-strip" });
    const shelf = h("section", { class: "l-sec" }, h("div", { class: "l-sec-h" }, h("span", { text: "Shelf" }), h("button", { text: "Open Shelf", onclick: () => openLens({ shelf: true }) })), strip);
    const recentList = h("div", { class: "l-recent" });
    const recent = h("section", { class: "l-sec", hidden: true }, h("div", { class: "l-sec-h" }, h("span", { text: "Recent answers" })), recentList);

    // footer
    const provider = h("button", { class: "l-provider", "aria-label": "Where answers come from" });
    const privacy = h("span", { class: "l-privacy" });
    const openBtn = h("button", { class: "l-btn primary", text: "Open in Lens", onclick: () => openLens({}) });
    const foot = h("footer", { class: "l-foot" }, provider, privacy, openBtn);

    rootEl.append(head, inputRow, chips, sub, grid, answer, toast);
    if (adapter.showShelf !== false) rootEl.append(shelf);
    if (adapter.showRecent) rootEl.append(recent);
    rootEl.append(foot);
    container.append(rootEl);

    function say(t) {
      toast.textContent = t || "";
    }

    function renderProvider() {
      provider.textContent = preferLocal ? "Local only" : "Lens decides";
      privacy.textContent = preferLocal
        ? "Answers come from a model on this PC."
        : "Lens may use Claude; cloud requests wait for your OK in Lens.";
    }
    provider.addEventListener("click", () => {
      preferLocal = !preferLocal;
      renderProvider();
      adapter.send({ type: "prefs-set", preferLocal }).catch(() => {});
    });

    function renderMode() {
      const modes = modesFor(ctx);
      if (!modes.some((m) => m[0] === mode)) mode = modes[0][0];
      pill.textContent = (modes.find((m) => m[0] === mode) || modes[0])[1] + " ▾";
      chips.replaceChildren(...chipsFor(ctx, mode).map((c) => h("span", { class: "l-chip", text: c })));
      input.placeholder = mode === "selection" ? "Ask about the selection…" : mode === "page" ? "Ask about this page…" : "Ask Lens anything…";
    }
    pill.addEventListener("click", () => {
      const modes = modesFor(ctx);
      const i = modes.findIndex((m) => m[0] === mode);
      mode = modes[(i + 1) % modes.length][0];
      renderMode();
    });

    function showSub(items, run) {
      sub.replaceChildren(...items.map(([v, label]) => h("button", { text: label, onclick: () => { sub.hidden = true; run(v); } })));
      sub.hidden = false;
    }

    async function onTile(t) {
      say("");
      if (t.action === "ask") {
        input.focus();
        if (input.value.trim()) run("ask", { question: input.value.trim() });
        return;
      }
      if (t.action === "shelf_add") {
        const r = await adapter.send({ type: "add-shelf", ctx: scoped(ctx, mode === "none" ? "page" : mode) }).catch((e) => ({ ok: false, error: String(e) }));
        say(r && r.ok ? "Added to your Shelf." : (r && r.error) || "Couldn't add to the Shelf.");
        if (r && r.ok) loadShelf();
        return;
      }
      if (t.options) return showSub(t.options, (variant) => run(t.action, { variant }));
      if (t.langs) return showSub(t.langs.map((l) => [l, l]), (targetLang) => run(t.action, { targetLang }));
      run(t.action, {});
    }

    async function run(action, opts) {
      if (mode === "none" && action !== "ask") mode = modesFor(ctx)[0][0];
      const c = scoped(ctx, mode);
      const r = await adapter.send({ type: "run", action, ctx: c, preferLocal, ...opts }).catch((e) => ({ ok: false, error: String(e) }));
      if (r && r.clientId) {
        current = r.clientId;
        renderAnswer({ clientId: current, action, label: LABEL[action] || action, state: "sending", text: "", chips: chipsFor(ctx, mode) });
      } else {
        say((r && r.error) || "Couldn't reach Lens.");
      }
    }

    function engineBadge(engine) {
      return h("span", { class: "l-badge", "data-engine": engine || "", text: engine === "local" ? "Local" : engine === "claude" ? "Claude" : "—" });
    }

    function renderAnswer(rec) {
      if (adapter.showAnswer === false) return;
      answer.hidden = false;
      const busy = ["sending", "pending", "running"].includes(rec.state);
      const title = [rec.label || LABEL[rec.action] || rec.action, rec.variant && rec.variant.replace("_", " "), rec.targetLang].filter(Boolean).join(" · ");
      const kids = [h("div", { class: "l-row" }, h("span", { class: "l-title", text: title }), engineBadge(rec.engine))];
      const st = STATE_TEXT[rec.state];
      if (st) kids.push(h("div", { class: "l-state" }, busy ? h("span", { class: "l-spin" }) : null, st));
      if (rec.text) kids.push(h("pre", { class: "l-text", text: rec.text }));
      if (rec.error) kids.push(h("div", { class: "l-err", text: rec.error }));
      if (rec.text && !busy) {
        kids.push(
          h("div", { class: "l-row" },
            h("button", { class: "l-btn", text: "Copy", onclick: async (e) => { await copy(rec.text); e.target.textContent = "Copied"; } }),
            h("button", { class: "l-btn", text: "Add to Shelf", onclick: async (e) => {
              const r = await adapter.send({ type: "shelf-answer", text: rec.text, title: `${title}: ${(rec.source && rec.source.title) || ctx.title || ""}`.trim(), url: (rec.source && rec.source.url) || ctx.url });
              e.target.textContent = r && r.ok ? "On the Shelf" : "Couldn't add";
              if (r && r.ok) loadShelf();
            } }),
            h("button", { class: "l-btn primary", text: "Open in Lens", onclick: () => openLens({ selection: rec.text }) }),
          ),
        );
      }
      answer.replaceChildren(...kids);
    }

    async function copy(text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = h("textarea");
        ta.value = text;
        rootEl.append(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
    }

    function openLens(extra) {
      adapter.send({ type: "open-command", ctx: { ...scoped(ctx, mode === "none" ? "page" : mode), ...(extra.selection ? { selection: extra.selection } : {}) } }).catch(() => {});
      if (adapter.onOpened) adapter.onOpened();
    }

    async function loadShelf() {
      const r = await adapter.send({ type: "shelf", kind: "recent", limit: 8 }).catch(() => null);
      if (!r || r.state === "lens-offline") {
        strip.replaceChildren(h("div", { class: "l-empty", text: "Start Lens to see your Shelf." }));
        return;
      }
      if (!r.ok) {
        strip.replaceChildren(h("div", { class: "l-empty", text: "Shelf unavailable." }));
        return;
      }
      const items = r.items || [];
      if (!items.length) {
        strip.replaceChildren(h("div", { class: "l-empty", text: "Nothing on your Shelf yet. Use Add to Shelf." }));
        return;
      }
      strip.replaceChildren(
        ...items.map((it) =>
          h("button", { class: "l-item", title: "", onclick: () => adapter.send({ type: "open-command", ctx: { title: it.title, url: it.url || undefined, selection: it.snippet || undefined } }) },
            h("b", { text: it.title || "Untitled" }),
            h("small", { text: it.snippet || hostOf(it.url || "") || it.kind }),
          ),
        ),
      );
    }

    function renderRecent() {
      const done = records.filter((r) => r.clientId !== current).slice(0, 5);
      recent.hidden = done.length === 0;
      recentList.replaceChildren(
        ...done.map((r) =>
          h("button", { onclick: () => { current = r.clientId; renderAnswer(r); renderRecent(); } },
            h("span", { text: `${r.label || r.action}${r.source && r.source.title ? " · " + r.source.title : ""}` }),
            engineBadge(r.engine),
            h("time", { text: ago(r.at || Date.now()) }),
          ),
        ),
      );
    }

    async function loadStatus() {
      const r = await adapter.send({ type: "ping" }).catch(() => null);
      const label = conn.querySelector("span");
      if (r && r.ok && r.state === "ready") {
        conn.dataset.state = "ok";
        label.textContent = "Connected";
      } else if (r && r.state === "lens-offline") {
        conn.dataset.state = "off";
        label.textContent = "Lens isn't running";
      } else {
        conn.dataset.state = "bad";
        label.textContent = "Not connected";
        say((r && r.error) || "");
      }
    }

    // keyboard
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        e.preventDefault();
        run("ask", { question: input.value.trim() });
        input.value = "";
      } else if (e.key === "Enter" && !input.value.trim()) {
        const t = TILES.find((x) => x.action === (adapter.defaultAction || "summarize"));
        if (t) onTile(t);
      }
    });
    send.addEventListener("click", () => {
      if (input.value.trim()) {
        run("ask", { question: input.value.trim() });
        input.value = "";
      } else input.focus();
    });

    const unlisten = adapter.listen((m) => {
      if (!m || m.type !== "lens-answer" || !m.record) return;
      const rec = m.record;
      const i = records.findIndex((r) => r.clientId === rec.clientId);
      if (i >= 0) records[i] = rec;
      else records.unshift(rec);
      if (rec.clientId === current) renderAnswer(rec);
      if (rec.engine === "claude" || rec.engine === "local") provider.dataset.last = rec.engine;
      renderRecent();
    });

    // initial data
    (async () => {
      renderProvider();
      renderMode();
      const [c, theme, prefs, answers] = await Promise.all([
        adapter.getContext().catch(() => ({})),
        adapter.send({ type: "theme" }).catch(() => null),
        adapter.send({ type: "prefs" }).catch(() => null),
        adapter.showRecent ? adapter.send({ type: "answers" }).catch(() => []) : Promise.resolve([]),
      ]);
      ctx = c || {};
      mode = surface === "inpage" && ctx.selection ? "selection" : modesFor(ctx)[0][0];
      applyTheme(rootEl, theme && theme.theme);
      if (prefs && typeof prefs.preferLocal === "boolean") preferLocal = prefs.preferLocal;
      records = Array.isArray(answers) ? answers : [];
      renderProvider();
      renderMode();
      renderRecent();
      loadStatus();
      if (adapter.showShelf !== false) loadShelf();
      if (surface === "inpage") (rootEl.querySelector('.l-tile[data-default="true"]') || input).focus();
      else input.focus();
    })();

    return {
      root: rootEl,
      setContext(next) {
        ctx = next || {};
        renderMode();
      },
      destroy() {
        unlisten && unlisten();
        rootEl.remove();
      },
    };
  }

  root.LensDash = { CSS, TILES, mount, applyTheme, modesFor, scoped, chipsFor };
})(globalThis);

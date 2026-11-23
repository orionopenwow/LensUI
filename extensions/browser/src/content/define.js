// Double-click to define or translate (opt-in: Settings → "Double-click a word"). Registered on
// the sites the user allowed, after selectionLogic.js. Answers come only from a local model in
// Lens; if there is none, the bubble says so and nothing is sent anywhere else.
//
// The bubble lives in a closed Shadow DOM so the page can't style or read it.
(() => {
  if (window.__lensDefine) return;
  window.__lensDefine = true;
  const api = globalThis.browser ?? globalThis.chrome;
  const L = globalThis.LensSel;
  let host = null;
  let current = null; // { clientId }

  const describe = (el) => {
    const d = (n) => n && n.nodeType === 1 ? {
      tag: n.tagName.toLowerCase(), type: n.getAttribute("type") || "", autocomplete: n.getAttribute("autocomplete") || "",
      contentEditable: n.isContentEditable, attrs: Object.fromEntries([...n.attributes].slice(0, 30).map((a) => [a.name, a.value])),
    } : null;
    const ancestors = [];
    for (let n = el?.parentElement; n && ancestors.length < 12; n = n.parentElement) ancestors.push(d(n));
    return { ...(d(el) || {}), ancestors };
  };

  function close() {
    host?.remove();
    host = null;
    current = null;
  }

  function bubble(rect, settings, word) {
    close();
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:absolute;z-index:2147483647;";
    const top = rect.bottom + window.scrollY + 6;
    const left = Math.max(8, Math.min(rect.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - 328));
    host.style.top = `${top}px`;
    host.style.left = `${left}px`;
    const root = host.attachShadow({ mode: "closed" });
    const dark = !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches;
    const c = dark ? { bg: "#18181b", fg: "#fafafa", mu: "#a1a1aa", ln: "#3f3f46" } : { bg: "#ffffff", fg: "#18181b", mu: "#52525b", ln: "#e4e4e7" };
    const st = document.createElement("style");
    st.textContent = `.b{font:13px/20px system-ui,-apple-system,"Segoe UI",sans-serif;width:300px;box-sizing:border-box;padding:12px;border-radius:12px;
      background:${c.bg};color:${c.fg};border:1px solid ${c.ln};box-shadow:0 8px 24px rgba(0,0,0,.25)}
      .h{display:flex;align-items:center;gap:8px;margin-bottom:6px}.w{font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .t{font:inherit;font-size:12px;color:${c.mu};background:transparent;border:1px solid ${c.ln};border-radius:6px;padding:0 8px;height:24px;cursor:pointer}
      .t[aria-pressed=true]{color:${c.fg};border-color:${c.fg}}.a{white-space:pre-wrap;min-height:20px}.m{font-size:11px;color:${c.mu};margin-top:6px}`;
    const box = document.createElement("div");
    box.className = "b";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", `Lens: ${word}`);
    const head = document.createElement("div");
    head.className = "h";
    const w = document.createElement("div");
    w.className = "w";
    w.textContent = word;
    const tabs = ["define", "translate"].map((mode) => {
      const b = document.createElement("button");
      b.className = "t";
      b.textContent = mode === "define" ? "Define" : `→ ${settings.translateTo}`;
      b.addEventListener("click", () => ask(mode));
      return b;
    });
    head.append(w, ...tabs);
    const ans = document.createElement("div");
    ans.className = "a";
    ans.setAttribute("aria-live", "polite");
    const meta = document.createElement("div");
    meta.className = "m";
    meta.textContent = "Local model · stays on this PC";
    box.append(head, ans, meta);
    root.append(st, box);
    document.body.append(host);

    const sentence = (() => {
      const sel = getSelection();
      const node = sel?.anchorNode;
      const text = (node && (node.parentElement?.innerText || node.textContent)) || "";
      return text.replace(/\s+/g, " ").slice(0, 600);
    })();

    async function ask(mode) {
      tabs.forEach((t, i) => t.setAttribute("aria-pressed", String(["define", "translate"][i] === mode)));
      ans.textContent = "…";
      const r = await api.runtime.sendMessage({ type: "define", word, sentence, mode, lang: settings.translateTo }).catch(() => null);
      if (!r?.ok) {
        ans.textContent = r?.error || "Lens isn't reachable.";
        return;
      }
      current = { clientId: r.clientId, ans };
    }
    ask(settings.defineMode);
  }

  api.runtime.onMessage.addListener((m) => {
    if (m?.type !== "lens-answer" || !current || m.record?.clientId !== current.clientId) return;
    const rec = m.record;
    current.ans.textContent = rec.state === "failed" ? rec.error || "No answer." : rec.text || "…";
  });

  document.addEventListener("dblclick", async (e) => {
    if (host && e.composedPath().includes(host)) return;
    const sel = getSelection();
    const word = sel ? sel.toString().trim() : "";
    if (!L.defineWordOk(word)) return;
    const target = e.target;
    if (L.isSensitiveField(describe(target))) return;
    const { lensSettings } = await api.storage.local.get("lensSettings");
    const settings = L.sanitizeSettings(lensSettings);
    if (settings.define !== "all" || L.isDeniedUrl(location.href, settings.never).denied) return;
    const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!range) return;
    bubble(range.getBoundingClientRect(), settings, word);
  });
  document.addEventListener("mousedown", (e) => {
    if (host && !e.composedPath().includes(host)) close();
  }, true);
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
})();

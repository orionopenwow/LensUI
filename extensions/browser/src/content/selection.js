// In-page selection button (opt-in, per site). Runs only where the user turned it on; the
// background registers this script dynamically for those sites after the browser grants access.
//
// • A small Lens dot appears near the end of a text selection.
// • Clicking it opens the same Lens Mini dashboard in a panel next to the selection.
// • Everything lives in a CLOSED shadow root on a custom element, so page CSS can't reach in and
//   Lens CSS can't leak out. Esc or a click outside closes the panel.
// • Never on banking / payment / sign-in pages, pages with a visible password field, password
//   inputs, or fields marked sensitive (see selectionLogic.js).
(function () {
  "use strict";
  if (globalThis.__lensSelectionLoaded) return;
  globalThis.__lensSelectionLoaded = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const L = globalThis.LensSel;
  const D = globalThis.LensDash;
  if (!api || !L || !D) return;

  const DOT = 22;
  let settings = L.sanitizeSettings(null);
  let host = null;
  let shadow = null;
  let dot = null;
  let panelWrap = null;
  let dash = null;
  let lastSelection = "";
  let dotPos = null;
  const listeners = new Set();

  function viewport() {
    return { width: document.documentElement.clientWidth || innerWidth, height: innerHeight, scrollX, scrollY };
  }

  function describe(el) {
    if (!el || el.nodeType !== 1) return null;
    const attrs = {};
    for (const a of ["data-sensitive", "data-private", "data-lens-ignore", "aria-label", "name", "id"]) {
      const v = el.getAttribute(a);
      if (v !== null) attrs[a] = v;
    }
    return { tag: el.tagName, type: el.type, autocomplete: el.getAttribute("autocomplete"), contentEditable: el.isContentEditable ? "true" : "false", attrs };
  }

  function chainFor(node) {
    let el = node && (node.nodeType === 1 ? node : node.parentElement);
    const first = describe(el);
    if (!first) return null;
    const ancestors = [];
    for (let p = el.parentElement, i = 0; p && i < 12; p = p.parentElement, i++) ancestors.push(describe(p));
    return { ...first, ancestors };
  }

  function visiblePasswordFields() {
    return Array.from(document.querySelectorAll("input[type=password]")).map((i) => {
      const r = i.getBoundingClientRect();
      const s = getComputedStyle(i);
      return { type: "password", visible: r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" };
    });
  }

  function allowedHere() {
    return L.buttonEnabledFor(settings, location.href) && !L.pageHasVisiblePassword(visiblePasswordFields());
  }

  function ensureHost() {
    if (host) return;
    host = document.createElement("lens-ui-selection");
    // The host box itself takes no space and no page styles.
    host.style.cssText = "all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;";
    shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.dataset.lensDash = "1"; // tells LensDash.mount the CSS is already here
    style.textContent =
      D.CSS +
      `
:host{all:initial}
.l-dotbtn{all:unset;position:absolute;width:${DOT}px;height:${DOT}px;border-radius:50%;cursor:pointer;display:grid;place-items:center;
  background:#09090b;box-shadow:0 2px 10px rgba(0,0,0,.35),0 0 0 2px #fafafa;transform:scale(.6);opacity:0;transition:transform .14s ease,opacity .14s ease;}
.l-dotbtn[data-on=true]{transform:scale(1);opacity:1}
.l-dotbtn:focus-visible{outline:2px solid #2563eb;outline-offset:3px}
.l-dotbtn i{width:8px;height:8px;border-radius:50%;background:#fafafa;display:block}
@media (prefers-color-scheme: light){.l-dotbtn{background:#fafafa;box-shadow:0 2px 10px rgba(0,0,0,.25),0 0 0 2px #09090b}.l-dotbtn i{background:#09090b}}
@media (prefers-reduced-motion: reduce){.l-dotbtn{transition:none}}
.l-panelwrap{position:absolute}
`;
    dot = document.createElement("button");
    dot.className = "l-dotbtn";
    dot.setAttribute("aria-label", "Lens: act on the selection");
    dot.append(document.createElement("i"));
    dot.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
    dot.addEventListener("click", openPanel);
    panelWrap = document.createElement("div");
    panelWrap.className = "l-panelwrap";
    panelWrap.hidden = true;
    shadow.append(style, dot, panelWrap);
    document.documentElement.append(host);
  }

  function hideDot() {
    if (dot) dot.dataset.on = "false";
    dotPos = null;
  }

  function closePanel() {
    if (dash) dash.destroy();
    dash = null;
    if (panelWrap) panelWrap.hidden = true;
  }

  function onSelection() {
    if (dash) return; // panel open: leave it alone
    const sel = getSelection();
    const text = sel ? String(sel) : "";
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !L.selectionTextOk(text)) return hideDot();
    if (!allowedHere()) return hideDot();
    const range = sel.getRangeAt(0);
    if (L.isSensitiveField(chainFor(range.commonAncestorContainer)) || L.isSensitiveField(chainFor(document.activeElement))) return hideDot();
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return hideDot();
    ensureHost();
    lastSelection = text;
    dotPos = L.dotPosition(rect, viewport(), DOT);
    dot.style.left = dotPos.left + "px";
    dot.style.top = dotPos.top + "px";
    dot.dataset.on = "true";
  }

  function openPanel() {
    if (!dotPos) return;
    const ctx = { selection: lastSelection.slice(0, 50_000), title: document.title, url: location.href };
    const anchor = { ...dotPos }; // before hideDot() clears it
    hideDot();
    closePanel();
    panelWrap.hidden = false;
    panelWrap.style.left = "-9999px";
    panelWrap.style.top = "0px";
    dash = D.mount(panelWrap, {
      surface: "inpage",
      logo: api.runtime.getURL("icons/icon32.png"),
      defaultAction: settings.defaultAction,
      showShelf: true,
      showRecent: false,
      send: (msg) => api.runtime.sendMessage(msg),
      listen: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      getContext: async () => ctx,
      onClose: closePanel,
      onOpened: closePanel,
    });
    // Position once laid out, and again as content grows.
    const place = () => {
      if (!dash) return;
      const box = dash.root.getBoundingClientRect();
      const p = L.panelPosition(anchor, { width: box.width || 340, height: box.height || 360 }, viewport());
      panelWrap.style.left = p.left + "px";
      panelWrap.style.top = p.top + "px";
    };
    requestAnimationFrame(place);
    const ro = new ResizeObserver(place);
    ro.observe(dash.root);
  }

  // Answers for this tab arrive from the background.
  api.runtime.onMessage.addListener((m) => {
    for (const fn of listeners) fn(m);
  });

  // Close on Esc or a click outside the panel.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (dash) closePanel();
      else hideDot();
    }
  }, true);
  document.addEventListener("pointerdown", (e) => {
    if (!host) return;
    if (e.composedPath().includes(host)) return;
    if (dash) closePanel();
  }, true);

  let t = 0;
  const schedule = () => {
    clearTimeout(t);
    t = setTimeout(onSelection, 120);
  };
  document.addEventListener("mouseup", schedule, true);
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key === "Shift") schedule();
  }, true);
  document.addEventListener("selectionchange", () => {
    const s = getSelection();
    if (!s || s.isCollapsed) hideDot();
  });
  addEventListener("scroll", () => {
    if (!dash) hideDot();
  }, { passive: true });

  api.storage.local.get("lensSettings").then((r) => {
    settings = L.sanitizeSettings(r && r.lensSettings);
  });
  api.storage.onChanged.addListener((changes) => {
    if (changes.lensSettings) {
      settings = L.sanitizeSettings(changes.lensSettings.newValue);
      if (!allowedHere()) {
        hideDot();
        closePanel();
      }
    }
  });
})();

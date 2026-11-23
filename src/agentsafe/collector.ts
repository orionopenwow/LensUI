// Page-side text collector for the hidden-text and injection detector (W8-O).
//
// `lensTextCollector` is self-contained on purpose: the browser host injects it into pages with
// `collectorScript()` (Function.prototype.toString), so it must not reference anything outside
// its own body. It returns one node per element's text with the style facts the Rust scorer
// needs: hidden, opacity, contrast against the effective background, font size, off-screen,
// clipped and aria-hidden. Attributes (alt, title, aria-label) and <meta> content are returned as
// their own sources, because people don't see them but models do.
//
// The same function, called with `helpersOnly = true`, returns its pure helpers for unit tests.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CollectedNode {
  id: number;
  text: string;
  source: "dom" | "alt" | "meta";
  displayNone: boolean;
  visibilityHidden: boolean;
  opacity: number;
  contrast: number;
  fontPx: number;
  offscreen: boolean;
  clipped: boolean;
  ariaHidden: boolean;
}

export interface CollectorHelpers {
  parseColor(s: string): [number, number, number, number] | null;
  blend(top: [number, number, number, number], under: [number, number, number]): [number, number, number];
  luminance(rgb: [number, number, number]): number;
  contrastRatio(a: [number, number, number], b: [number, number, number]): number;
  isOffscreen(r: { left: number; top: number; right: number; bottom: number; width: number; height: number }, docW: number, docH: number): boolean;
}

export function lensTextCollector(maxNodes = 4000, helpersOnly = false): CollectedNode[] | CollectorHelpers {
  function parseColor(s: string): [number, number, number, number] | null {
    if (!s) return null;
    const t = s.trim().toLowerCase();
    if (t === "transparent") return [0, 0, 0, 0];
    let m = t.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
    if (m) {
      let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (!isFinite(a)) a = 1;
      return [Math.min(255, +m[1]), Math.min(255, +m[2]), Math.min(255, +m[3]), Math.max(0, Math.min(1, a))];
    }
    m = t.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
      if (h.length !== 6 && h.length !== 8) return null;
      const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
      return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
    }
    if (t === "white") return [255, 255, 255, 1];
    if (t === "black") return [0, 0, 0, 1];
    return null;
  }
  function blend(top: [number, number, number, number], under: [number, number, number]): [number, number, number] {
    const a = top[3];
    return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a)];
  }
  function luminance(rgb: [number, number, number]): number {
    const c = rgb.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function isOffscreen(r: { left: number; top: number; right: number; bottom: number; width: number; height: number }, docW: number, docH: number): boolean {
    return r.right <= 0 || r.bottom <= 0 || r.left >= docW || r.top >= docH || r.left < -1000 || r.top < -1000;
  }
  if (helpersOnly) return { parseColor, blend, luminance, contrastRatio, isOffscreen };

  const out: CollectedNode[] = [];
  const doc: any = (globalThis as any).document;
  if (!doc || !doc.body) return out;
  const win: any = (globalThis as any).window || globalThis;
  const docW = Math.max(doc.documentElement.scrollWidth, win.innerWidth || 0);
  const docH = Math.max(doc.documentElement.scrollHeight, win.innerHeight || 0);
  const styleCache = new Map<any, any>();
  const cs = (el: any) => {
    let s = styleCache.get(el);
    if (!s) {
      s = win.getComputedStyle(el);
      styleCache.set(el, s);
    }
    return s;
  };
  const base = {
    displayNone: false, visibilityHidden: false, opacity: 1, contrast: 0, fontPx: 16, offscreen: false, clipped: false, ariaHidden: false,
  };
  let id = 0;
  const push = (text: string, source: CollectedNode["source"], facts: Partial<CollectedNode>) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t || out.length >= maxNodes) return;
    out.push({ ...base, ...facts, id: id++, text: t.slice(0, 20000), source });
  };

  const factsFor = (el: any): Partial<CollectedNode> => {
    let displayNone = false;
    let visibilityHidden = false;
    let opacity = 1;
    let ariaHidden = false;
    let clipped = false;
    let bg: [number, number, number] | null = null;
    const layers: [number, number, number, number][] = [];
    for (let e = el, depth = 0; e && e.nodeType === 1 && depth < 40; e = e.parentElement, depth++) {
      const s = cs(e);
      if (s.display === "none") displayNone = true;
      if (s.visibility === "hidden" || s.visibility === "collapse" || s.contentVisibility === "hidden") visibilityHidden = true;
      const o = parseFloat(s.opacity);
      if (isFinite(o)) opacity *= o;
      if (e.getAttribute && (e.getAttribute("aria-hidden") === "true" || e.hasAttribute("hidden"))) ariaHidden = true;
      const clip = (s.clip || "") + " " + (s.clipPath || "");
      if (/rect\(\s*0(px)?[ ,]+0(px)?[ ,]+0(px)?[ ,]+0(px)?\s*\)|inset\(\s*(50|100)%/.test(clip)) clipped = true;
      if (bg === null) {
        const c = parseColor(s.backgroundColor);
        if (c && c[3] > 0) {
          layers.push(c);
          if (c[3] >= 0.99) bg = [c[0], c[1], c[2]];
        }
      }
    }
    let under: [number, number, number] = bg || [255, 255, 255];
    // Composite translucent backgrounds from the page backdrop up.
    for (let i = layers.length - 1; i >= 0; i--) if (layers[i][3] < 0.99) under = blend(layers[i], under);
    const s = cs(el);
    const fg = parseColor(s.color) || [0, 0, 0, 1];
    const fgSolid = blend(fg, under);
    const contrast = fg[3] === 0 ? 1 : contrastRatio(fgSolid, under);
    const fontPx = parseFloat(s.fontSize) || 16;
    const r = el.getBoundingClientRect();
    const rect = { left: r.left + (win.scrollX || 0), top: r.top + (win.scrollY || 0), right: r.right + (win.scrollX || 0), bottom: r.bottom + (win.scrollY || 0), width: r.width, height: r.height };
    if (!displayNone && (r.width <= 1 || r.height <= 1) && (s.overflow === "hidden" || s.position === "absolute")) clipped = true;
    const offscreen = !displayNone && (r.width > 0 || r.height > 0) && isOffscreen(rect, docW, docH);
    const textIndent = parseFloat(s.textIndent) || 0;
    return {
      displayNone,
      visibilityHidden,
      opacity: Math.round(opacity * 1000) / 1000,
      contrast: Math.round(contrast * 100) / 100,
      fontPx,
      offscreen: offscreen || textIndent < -999,
      clipped,
      ariaHidden,
    };
  };

  // Text: one node per element, joining its direct text children.
  const seen = new Set<any>();
  const walker = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
  for (let n = walker.nextNode(); n && out.length < maxNodes; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE") continue;
    seen.add(el);
    let text = "";
    for (const c of el.childNodes) if (c.nodeType === 3) text += c.nodeValue;
    if (!text.trim()) continue;
    push(text, tag === "NOSCRIPT" ? "meta" : "dom", tag === "NOSCRIPT" ? {} : factsFor(el));
  }
  // Attributes people don't read but models do.
  for (const el of doc.querySelectorAll("[alt],[title],[aria-label],[placeholder],[data-tooltip]")) {
    if (out.length >= maxNodes) break;
    for (const a of ["alt", "title", "aria-label", "placeholder", "data-tooltip"]) {
      const v = el.getAttribute(a);
      if (v && v.trim().length > 2) push(v, "alt", {});
    }
  }
  for (const m of doc.querySelectorAll("meta[name],meta[property]")) {
    const name = (m.getAttribute("name") || m.getAttribute("property") || "").toLowerCase();
    if (/description|keywords|og:|twitter:|summary|abstract/.test(name)) push(m.getAttribute("content") || "", "meta", {});
  }
  // HTML comments are invisible text too.
  const cw = doc.createTreeWalker(doc.body, 128 /* SHOW_COMMENT */);
  for (let c = cw.nextNode(); c && out.length < maxNodes; c = cw.nextNode()) push(c.nodeValue || "", "meta", {});
  return out;
}

/** The pure helpers, for tests and for OCR contrast estimates. */
export const collectorHelpers = lensTextCollector(0, true) as CollectorHelpers;

/** JavaScript to evaluate inside a page; returns CollectedNode[]. */
export function collectorScript(maxNodes = 4000): string {
  return `(${lensTextCollector.toString()})(${Math.max(1, Math.floor(maxNodes))}, false)`;
}

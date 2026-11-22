import type { Palette, RGB } from "./types";

const FALLBACK: Palette = {
  accent: { r: 96, g: 165, b: 250 },
  base: { r: 9, g: 9, b: 11 },
  elevated: { r: 20, g: 20, b: 24 },
  fg: { r: 250, g: 250, b: 250 },
  dark: true,
};

function parseRgb(text: string): RGB | null {
  const m = text.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
}

/** Resolves CSS custom properties (which may reference each other) to RGB via a probe element. */
export function readPalette(root: HTMLElement = document.documentElement): Palette {
  if (typeof document === "undefined") return FALLBACK;
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  (document.body ?? root).appendChild(probe);
  const resolve = (expr: string, fallback: RGB): RGB => {
    probe.style.color = "";
    probe.style.color = expr;
    return parseRgb(getComputedStyle(probe).color) ?? fallback;
  };
  const dark = root.dataset.scheme !== "light";
  const base = resolve(`var(--lens-pack-base, ${dark ? "#09090b" : "#f4f4f5"})`, FALLBACK.base);
  const p: Palette = {
    accent: resolve("var(--lens-accent, #60a5fa)", FALLBACK.accent),
    base,
    elevated: resolve(`var(--lens-pack-elevated, var(--lens-surface-solid, ${dark ? "#18181b" : "#ffffff"}))`, FALLBACK.elevated),
    fg: resolve(`var(--lens-fg, ${dark ? "#fafafa" : "#09090b"})`, FALLBACK.fg),
    dark,
  };
  probe.remove();
  return p;
}

export function paletteKey(p: Palette): string {
  const k = (c: RGB) => `${c.r | 0},${c.g | 0},${c.b | 0}`;
  return [k(p.accent), k(p.base), k(p.elevated), k(p.fg), p.dark ? 1 : 0].join("|");
}

/** Calls `cb` whenever the theme (attributes / inline CSS variables on <html>) changes. */
export function watchPalette(cb: (p: Palette) => void): () => void {
  let last = "";
  let timer = 0;
  const check = () => {
    timer = 0;
    const p = readPalette();
    const key = paletteKey(p);
    if (key !== last) {
      last = key;
      cb(p);
    }
  };
  const obs = new MutationObserver(() => {
    if (!timer) timer = window.setTimeout(check, 120);
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-scheme", "data-preset"] });
  last = paletteKey(readPalette());
  return () => {
    obs.disconnect();
    if (timer) clearTimeout(timer);
  };
}

export { FALLBACK as FALLBACK_PALETTE };

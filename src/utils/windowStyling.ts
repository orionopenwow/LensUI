// Window styling 2.0 helpers shared by WindowRulesCard and FocusDimSurface.
// Mirrors `sanitize_styling` in src-tauri/src/win_rules.rs so the UI shows what the backend will keep.
import type * as Gen from "../types/generated";

export type WindowStyling = Gen.WindowStyling;
export type ActiveBorder = Gen.ActiveBorder;
export type StylingCaps = Gen.StylingCaps;

export const DEFAULT_BORDER: ActiveBorder = {
  mode: "off",
  style: "solid",
  colors: ["#60A5FA", "#C084FC"],
  widthPx: 2,
  glowPx: 0,
};

export const DEFAULT_STYLING: WindowStyling = {
  dimInactive: 0,
  activeBorder: DEFAULT_BORDER,
  skipFullscreen: true,
  exclusions: [],
  peekDelayMs: 600,
};

export const DEFAULT_CAPS: StylingCaps = { windowsBuild: 0, nativeBorder: true, roundedCorners: true, overlays: true };

const HEX = /^#?[0-9a-fA-F]{6}$/;
export const isHexColor = (v: string) => HEX.test(v.trim());
export const toHex = (v: string) => `#${v.trim().replace(/^#/, "").toUpperCase()}`;

/** Lower-cased file name without ".exe" — the form rules and exclusions use. */
export const processKey = (name: string) =>
  (name.split(/[\\/]/).pop() ?? name).trim().toLowerCase().replace(/\.exe$/, "");

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

export function normalizeStyling(raw: Partial<WindowStyling> | null | undefined): WindowStyling {
  const s = { ...DEFAULT_STYLING, ...(raw ?? {}) };
  const b = { ...DEFAULT_BORDER, ...(s.activeBorder ?? {}) };
  const mode = String(b.mode).trim().toLowerCase();
  let colors = (b.colors ?? []).filter(isHexColor).map(toHex).slice(0, 4);
  if (colors.length === 0) colors = [...DEFAULT_BORDER.colors];
  const seen: string[] = [];
  for (const e of s.exclusions ?? []) {
    const k = processKey(String(e));
    if (k && k.length <= 80 && !seen.includes(k) && seen.length < 64) seen.push(k);
  }
  return {
    dimInactive: clamp(s.dimInactive, 0, 40),
    activeBorder: {
      mode: mode === "native" || mode === "overlay" ? mode : "off",
      style: String(b.style).trim().toLowerCase() === "gradient" ? "gradient" : "solid",
      colors,
      widthPx: clamp(b.widthPx, 1, 8),
      glowPx: clamp(b.glowPx, 0, 24),
    },
    skipFullscreen: s.skipFullscreen !== false,
    exclusions: seen,
    peekDelayMs: clamp(s.peekDelayMs, 200, 2000),
  };
}

/** True when nothing is switched on (the default, which leaves windows exactly as before). */
export const isIdle = (s: WindowStyling) => s.dimInactive === 0 && s.activeBorder.mode === "off";

/** CSS background for the ring, as the overlay draws it (45° gradient, or the first colour). */
export function ringBackground(b: ActiveBorder): string {
  if (b.style === "gradient" && b.colors.length > 1) return `linear-gradient(135deg, ${b.colors.join(", ")})`;
  return b.colors[0] ?? DEFAULT_BORDER.colors[0];
}

/** What the preview should draw for the border on this PC (native is a 1px line, Windows 11 only). */
export function effectiveBorder(b: ActiveBorder, caps: StylingCaps): { width: number; glow: number; background: string } | null {
  if (b.mode === "overlay") return { width: b.widthPx, glow: b.glowPx, background: ringBackground(b) };
  if (b.mode === "native" && caps.nativeBorder) return { width: 1, glow: 0, background: b.colors[0] ?? DEFAULT_BORDER.colors[0] };
  return null;
}

/** Corner radius the overlay uses: 8px on Windows 11, square on Windows 10. */
export const previewRadius = (caps: StylingCaps) => (caps.roundedCorners ? 8 : 0);

export const dimLabel = (pct: number) => (pct <= 0 ? "Off" : `${pct}%`);

/** Short line for the Windows 10 note, or null on Windows 11. */
export function capsNote(caps: StylingCaps): string | null {
  if (!caps.overlays) return "Focus dimming, borders and peek need Windows. These settings are saved but do nothing here.";
  if (caps.nativeBorder) return null;
  return "Running on Windows 10: the thin native border needs Windows 11. Dimming, the overlay border and peek work here, with square corners to match Windows 10 windows.";
}

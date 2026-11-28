// Lens Browser's stock themes and new-tab backdrops. A theme is a bundle of Appearance choices
// (scheme, accent, backdrop, texture): picking one writes those fields and nothing else, so tabs,
// sidebar and type stay as the person set them. Pure; tested in src/__tests__/browserThemes.test.ts.
import type { Appearance } from "./api";

/** New-tab backdrops: soft light behind the page, never behind text you read on a site. */
export const BACKDROPS: { id: string; label: string; css: string }[] = [
  { id: "none", label: "Plain", css: "none" },
  { id: "halo", label: "Halo", css: "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--lens-accent-ui, #8b7cf0) 26%, transparent), transparent 70%)" },
  { id: "aurora", label: "Aurora", css: "radial-gradient(50% 60% at 15% 10%, rgb(56 189 248 / .28), transparent 70%), radial-gradient(45% 55% at 85% 15%, rgb(168 85 247 / .26), transparent 70%), radial-gradient(60% 50% at 50% 100%, rgb(52 211 153 / .18), transparent 70%)" },
  { id: "dusk", label: "Dusk", css: "radial-gradient(70% 55% at 50% 110%, rgb(251 113 133 / .30), transparent 70%), radial-gradient(60% 50% at 80% 0%, rgb(129 140 248 / .24), transparent 70%)" },
  { id: "ocean", label: "Ocean", css: "radial-gradient(80% 60% at 50% 0%, rgb(14 165 233 / .26), transparent 70%), radial-gradient(60% 50% at 0% 100%, rgb(20 184 166 / .20), transparent 70%)" },
  { id: "forest", label: "Forest", css: "radial-gradient(70% 60% at 20% 0%, rgb(74 222 128 / .20), transparent 70%), radial-gradient(60% 60% at 90% 100%, rgb(132 204 22 / .16), transparent 70%)" },
  { id: "ember", label: "Ember", css: "radial-gradient(60% 50% at 50% 100%, rgb(249 115 22 / .28), transparent 70%), radial-gradient(40% 40% at 90% 10%, rgb(239 68 68 / .18), transparent 70%)" },
  { id: "spectrum", label: "Spectrum", css: "conic-gradient(from 200deg at 50% 0%, rgb(239 68 68 / .14), rgb(234 179 8 / .14), rgb(34 197 94 / .14), rgb(14 165 233 / .14), rgb(168 85 247 / .14), rgb(239 68 68 / .14))" },
  { id: "grid", label: "Grid", css: "linear-gradient(var(--lens-border) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, var(--lens-border) 1px, transparent 1px) 0 0 / 32px 32px" },
];

export const BACKDROP_IDS = BACKDROPS.map((b) => b.id);

export function backdropCss(id: string | undefined): string {
  return BACKDROPS.find((b) => b.id === id)?.css ?? "none";
}

export interface StockTheme {
  id: string;
  label: string;
  line: string;
  /** The swatch: two colours, light/top-left and dark/bottom-right. */
  a: string;
  b: string;
  patch: Pick<Appearance, "scheme" | "accent" | "dither" | "grain"> & { backdrop: string };
}

/** Built-in themes, each a complete look. "Lens" is the default look and comes first. */
export const STOCK_THEMES: StockTheme[] = [
  { id: "lens", label: "Lens", line: "Follows your Lens theme", a: "#fafafa", b: "#0b0b0d", patch: { scheme: "auto", accent: null, dither: 40, grain: 20, backdrop: "halo" } },
  { id: "obsidian", label: "Obsidian", line: "Black and white, nothing else", a: "#fafafa", b: "#09090b", patch: { scheme: "dark", accent: null, dither: 0, grain: 0, backdrop: "none" } },
  { id: "paper", label: "Paper", line: "Warm light, ink accent", a: "#f4f1ea", b: "#1c1b19", patch: { scheme: "light", accent: "#3f3f46", dither: 20, grain: 30, backdrop: "none" } },
  { id: "aurora", label: "Aurora", line: "Northern lights on the new tab", a: "#38bdf8", b: "#140f2a", patch: { scheme: "dark", accent: "#7dd3fc", dither: 30, grain: 15, backdrop: "aurora" } },
  { id: "dusk", label: "Dusk", line: "Rose and violet", a: "#fb7185", b: "#1c1328", patch: { scheme: "dark", accent: "#f0879f", dither: 35, grain: 20, backdrop: "dusk" } },
  { id: "ocean", label: "Ocean", line: "Deep blue and teal", a: "#0ea5e9", b: "#06131c", patch: { scheme: "dark", accent: "#38bdf8", dither: 25, grain: 10, backdrop: "ocean" } },
  { id: "sage", label: "Sage", line: "Quiet green", a: "#a8c5a0", b: "#16201a", patch: { scheme: "dark", accent: "#86b18a", dither: 30, grain: 20, backdrop: "forest" } },
  { id: "ember", label: "Ember", line: "Orange glow for late nights", a: "#fb923c", b: "#1f120b", patch: { scheme: "dark", accent: "#fb923c", dither: 40, grain: 25, backdrop: "ember" } },
  { id: "iris", label: "Iris", line: "Soft purple", a: "#a99cf2", b: "#17142a", patch: { scheme: "dark", accent: "#8b7cf0", dither: 40, grain: 20, backdrop: "halo" } },
  { id: "daylight", label: "Daylight", line: "Bright, with a blue accent", a: "#ffffff", b: "#2563eb", patch: { scheme: "light", accent: "#2563eb", dither: 0, grain: 10, backdrop: "ocean" } },
  { id: "spectrum", label: "Spectrum", line: "Every colour of the Lens orb", a: "#f472b6", b: "#0f0f14", patch: { scheme: "dark", accent: "#c084fc", dither: 20, grain: 10, backdrop: "spectrum" } },
  { id: "contrast", label: "Contrast", line: "Highest contrast", a: "#ffffff", b: "#000000", patch: { scheme: "dark", accent: "#ffffff", dither: 0, grain: 0, backdrop: "none" } },
];

/** The appearance with a stock theme applied: only the theme's own fields change. */
export function applyTheme(a: Appearance, id: string): Appearance {
  const t = STOCK_THEMES.find((x) => x.id === id);
  return t ? { ...a, ...t.patch, theme: t.id } : a;
}

/** Which stock theme the appearance matches exactly (the person may have tweaked it since). */
export function matchingTheme(a: Pick<Appearance, "scheme" | "accent" | "dither" | "grain" | "backdrop">): StockTheme | null {
  return (
    STOCK_THEMES.find(
      (t) => t.patch.scheme === a.scheme && (t.patch.accent ?? null) === (a.accent ?? null) && t.patch.dither === a.dither && t.patch.grain === a.grain && t.patch.backdrop === (a.backdrop ?? "halo"),
    ) ?? null
  );
}

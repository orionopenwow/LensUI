// The accent tokens in Lens's own apps (feat/accent-tokens-apps): Lens Browser, Lens Music, Cleaner,
// Lens Apps (and the core apps it opens) and Snip read the contrast-checked accent tokens
// (src/themes/accentTokens.ts) instead of the raw --lens-accent; Lens Music's artwork tint and
// Lens Browser's own look feed the token computation; text selection uses the accent with a
// readable ink; and these areas use the shared press (no stray :active scales).
//   B-140  "Theme follows music" left tokens.css's white in place of the theme accent when it let go
//   B-141  a dark accent on a dark theme (or a pale one on a light theme) made switches, primary
//          buttons and focus rings in these apps unreadable (raw --lens-accent)
//   B-142  Lens Music's artwork tint bypassed the tokens (and Now Playing's focus ring was the
//          window's, dark ink on the dark hero, on light themes)
//   B-143  Lens Browser drew its own presses (own press mode, :active rules); its buttons had no weight
//   B-144  selected text used the webview's fixed blue, whatever the accent
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ACCENT_UI_MIN,
  ON_ACCENT_MIN,
  accentTokens,
  applyAccentTokens,
  followAccent,
  scopedAccentVariables,
  wornAccent,
  type AccentInput,
} from "../themes/accentTokens";
import { browserAccentLook, SCHEME_TOKENS } from "../browser/accentLook";
import { heroBackgrounds, pickTint, tintInk, tintLook } from "../music/tint";
import { contrastRatio } from "../themes/packs";
import { hslToRgb } from "../playground/util";

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/** A stand-in for document.documentElement: inline custom properties only. */
function fakeRoot() {
  const props = new Map<string, string>();
  return {
    props,
    style: {
      setProperty: (k: string, v: string) => void props.set(k, v),
      removeProperty: (k: string) => void props.delete(k),
      getPropertyValue: (k: string) => props.get(k) ?? "",
    },
  };
}

const OBSIDIAN: AccentInput = { accent: "#818CF8", surface: "#08080B", card: "#111116", scheme: "dark", strength: "balanced", fg: "#FAFAFA", secondary: "#A1A1AA" };
const ALABASTER: AccentInput = { accent: "#4F46E5", surface: "#F4F4F5", card: "#FFFFFF", scheme: "light", strength: "balanced", fg: "#18181B", secondary: "#52525B" };

const hex = (h: number, s: number, l: number) => {
  const c = hslToRgb(h, s, l);
  return "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
};
const WHEEL: string[] = [];
for (let h = 0; h < 360; h += 30) for (const s of [0.5, 1]) for (const l of [0.1, 0.3, 0.5, 0.7, 0.92]) WHEEL.push(hex(h, s, l));

/** Every file under a folder with one of the extensions. */
function files(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...files(rel, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(rel);
  }
  return out;
}
const AREAS = ["src/browser", "src/music", "src/cleaner", "src/apps", "src/coreapps", "src/snip"];

describe("B-141: the five apps paint the accent through the tokens, never the raw --lens-accent", () => {
  test("no stylesheet in these areas reads var(--lens-accent) (with or without a fallback)", () => {
    const bad: string[] = [];
    for (const f of AREAS.flatMap((d) => files(d, [".css"]))) {
      const css = noComments(read(f));
      for (const m of css.matchAll(/var\(--lens-accent\s*[,)]/g)) bad.push(`${f}: ${css.slice(Math.max(0, m.index! - 60), m.index! + 30).replace(/\s+/g, " ")}`);
    }
    expect(bad).toEqual([]);
  });

  test("no component in these areas paints with var(--lens-accent) either (SVG strokes, inline styles)", () => {
    const bad: string[] = [];
    for (const f of AREAS.flatMap((d) => files(d, [".tsx"]))) if (/"var\(--lens-accent\)"/.test(read(f))) bad.push(f);
    expect(bad).toEqual([]);
  });

  test("switches, primary buttons, selected chips and meters use the token pairs", () => {
    const browser = read("src/browser/Browser.css");
    expect(browser).toContain(".lb-switch.is-on { background: var(--lens-accent-ui); }");
    expect(browser).toContain(".lb-switch.is-on span { transform: translateX(12px); background: var(--lens-on-accent-ui); }");
    expect(browser).toContain(".lb-btn-primary { background: var(--lens-accent-fill); color: var(--lens-on-accent-fill);");
    const cleaner = read("src/cleaner/cleaner.css");
    expect(cleaner).toMatch(/\.cl-btn\.is-primary \{\s*background: var\(--lens-accent-fill\);\s*border-color: transparent;\s*color: var\(--lens-on-accent-fill\);/);
    expect(cleaner).toMatch(/\.cl-switch\.is-on \{\s*background: var\(--lens-accent-ui\);/);
    expect(cleaner).toMatch(/\.cl-chip\.is-on \{\s*background: var\(--lens-accent-fill\);\s*color: var\(--lens-on-accent-fill\);/);
    expect(read("src/apps/apps.css")).toMatch(/\.la-btn-primary \{\s*color: var\(--lens-on-accent-fill\);\s*background: var\(--lens-accent-fill\);/);
    expect(read("src/apps/library.css")).toMatch(/\.la-tab\[aria-selected="true"\] \{\s*color: var\(--lens-on-accent-fill\);/);
    const shell = read("src/coreapps/shell/shell.css");
    expect(shell).toMatch(/\.ca-switch\.on \{\s*background: var\(--lens-accent-ui\);/);
    expect(shell).toMatch(/\.ca-btn-primary \{\s*background: var\(--lens-accent-fill\);/);
    const snip = read("src/snip/snip.css");
    expect(snip).toContain(".snip-btn.primary { background: var(--lens-accent-fill); color: var(--lens-on-accent-fill);");
    expect(snip).toContain(".snip-btn.on { background: var(--lens-accent-fill); color: var(--lens-on-accent-fill); }");
    const music = read("src/music/music.css");
    expect(music).toContain(".lm-mini-btn.on { background: var(--lens-accent-fill); color: var(--lens-on-accent-fill);");
    expect(read("src/music/dockMusicCard.css")).toMatch(/\.dmc-play \{[^}]*background: var\(--lens-accent-fill\);\s*color: var\(--lens-on-accent-fill\);/);
    expect(read("src/music/immersive.css")).toContain(".lm-imm-chip.is-on { background: var(--lens-accent-fill); border-color: transparent; color: var(--lens-on-accent-fill); }");
  });

  test("the raw accent really could fail where the token cannot (navy on dark, lemon on light)", () => {
    const navy = { ...OBSIDIAN, accent: "#0A1A6B" };
    expect(contrastRatio(navy.accent, navy.surface)).toBeLessThan(ACCENT_UI_MIN);
    const t = accentTokens(navy)!;
    expect(contrastRatio(t.ui, navy.surface)).toBeGreaterThanOrEqual(ACCENT_UI_MIN);
    expect(contrastRatio(t.onFill!, t.fill!)).toBeGreaterThanOrEqual(ON_ACCENT_MIN);
    const lemon = { ...ALABASTER, accent: "#FFF27A" };
    expect(contrastRatio(lemon.accent, lemon.card)).toBeLessThan(ACCENT_UI_MIN);
    const u = accentTokens(lemon)!;
    expect(contrastRatio(u.ui, lemon.card)).toBeGreaterThanOrEqual(ACCENT_UI_MIN);
  });
});

describe("scoped tokens: a subtree with its own accent or scheme", () => {
  test("every variable is written, so nothing leaks in from the window's tokens", () => {
    applyAccentTokens(fakeRoot(), OBSIDIAN);
    const v = scopedAccentVariables({ accent: "#E11D48", surface: "#F5F5F3", card: "#FFFFFF", scheme: "light" });
    for (const k of ["--lens-accent-ui", "--lens-on-accent-ui", "--lens-accent-fill", "--lens-on-accent-fill", "--lens-accent-wash", "--lens-accent-edge", "--lens-accent-hover", "--lens-focus-ring"]) expect(v[k]).toBeDefined();
    expect(contrastRatio(v["--lens-accent-ui"], "#FFFFFF")).toBeGreaterThanOrEqual(ACCENT_UI_MIN);
    expect(contrastRatio(v["--lens-on-accent-fill"], v["--lens-accent-fill"])).toBeGreaterThanOrEqual(ON_ACCENT_MIN);
  });

  test("a grey accent is a no-op: the subtree's own monochrome ink", () => {
    applyAccentTokens(fakeRoot(), OBSIDIAN);
    for (const grey of ["#FFFFFF", "#000000", "#808080", "#3F3F46", "#FAFAFA"]) {
      const v = scopedAccentVariables({ accent: grey, surface: "#0A0A0B", card: "#18181B", scheme: "dark" });
      expect(v["--lens-accent-ui"]).toBe("var(--lens-fg)");
      expect(v["--lens-accent-fill"]).toBe("var(--lens-fg)");
      expect(v["--lens-on-accent-fill"]).toBe("var(--lens-on-fg)");
      expect(v["--lens-accent-wash"]).toBe("0%");
    }
  });

  test("High contrast is unchanged: the accent steps aside in scoped subtrees too", () => {
    applyAccentTokens(fakeRoot(), { ...OBSIDIAN, highContrast: true });
    const v = scopedAccentVariables({ accent: "#E11D48", surface: "#0A0A0B", card: "#18181B", scheme: "dark" });
    expect(v["--lens-accent-ui"]).toBe("var(--lens-fg)");
    expect(v["--lens-accent-fill"]).toBe("var(--lens-fg)");
    applyAccentTokens(fakeRoot(), OBSIDIAN);
  });

  test("the theme's strength carries over: Subtle keeps the ink fill, Vivid washes more than Balanced", () => {
    const look = { accent: "#22C55E", surface: "#0A0A0B", card: "#18181B", scheme: "dark" as const };
    applyAccentTokens(fakeRoot(), { ...OBSIDIAN, strength: "subtle" });
    const subtle = scopedAccentVariables(look);
    expect(subtle["--lens-accent-fill"]).toBe("var(--lens-fg)");
    expect(subtle["--lens-accent-ui"]).not.toBe("var(--lens-fg)");
    applyAccentTokens(fakeRoot(), { ...OBSIDIAN, strength: "vivid" });
    const vivid = parseInt(scopedAccentVariables(look)["--lens-accent-wash"]);
    applyAccentTokens(fakeRoot(), OBSIDIAN);
    const balanced = parseInt(scopedAccentVariables(look)["--lens-accent-wash"]);
    expect(vivid).toBeGreaterThan(balanced);
  });
});

describe("Lens Browser's own look feeds the tokens", () => {
  test("following Lens (no own accent, scheme auto): nothing scoped, the window's tokens fit", () => {
    expect(browserAccentLook({ accent: null, scheme: "auto" })).toBeNull();
  });

  test("its own scheme: the tokens are computed on the browser's own surfaces", () => {
    applyAccentTokens(fakeRoot(), OBSIDIAN);
    const look = browserAccentLook({ accent: null, scheme: "light" })!;
    expect(look.scheme).toBe("light");
    expect(look.surface).toBe(SCHEME_TOKENS.light["--lens-pack-base"]);
    expect(look.card).toBe(SCHEME_TOKENS.light["--lens-bg-elevated"]);
    // Lens's pale indigo on the browser's light paper: lifted to 3:1 there.
    expect(look.accent).toBe(OBSIDIAN.accent);
    const v = scopedAccentVariables(look);
    for (const s of [look.surface, look.card]) expect(contrastRatio(v["--lens-accent-ui"], s)).toBeGreaterThanOrEqual(ACCENT_UI_MIN);
  });

  test("any accent on either of its schemes stays readable (the whole wheel)", () => {
    applyAccentTokens(fakeRoot(), OBSIDIAN);
    const bad: string[] = [];
    for (const scheme of ["light", "dark"] as const) {
      for (const accent of WHEEL) {
        const look = browserAccentLook({ accent, scheme })!;
        const v = scopedAccentVariables(look);
        if (v["--lens-accent-ui"].startsWith("var(")) continue; // a grey: monochrome
        for (const s of [look.surface, look.card]) if (contrastRatio(v["--lens-accent-ui"], s) < ACCENT_UI_MIN) bad.push(`${scheme} ${accent} ui on ${s}`);
        if (contrastRatio(v["--lens-on-accent-ui"], v["--lens-accent-ui"]) < ON_ACCENT_MIN) bad.push(`${scheme} ${accent} knob`);
        if (contrastRatio(v["--lens-on-accent-fill"], v["--lens-accent-fill"]) < ON_ACCENT_MIN) bad.push(`${scheme} ${accent} fill text`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("the browser root writes the scoped tokens next to its own accent", () => {
    const src = read("src/browser/BrowserSurface.tsx");
    expect(src).toContain("const accentVars = useScopedAccent(browserAccentLook(appearance));");
    expect(src).toMatch(/\.\.\.\(appearance\.accent \? \{ "--lens-accent": appearance\.accent \} : \{\}\),\s*\/\/[^\n]*\n\s*\.\.\.accentVars,/);
  });
});

describe("B-142: Lens Music's artwork tint feeds the tokens, never bypasses them", () => {
  const palettes = [
    [{ color: { r: 20, g: 30, b: 120 }, weight: 0.6 }, { color: { r: 10, g: 10, b: 20 }, weight: 0.4 }], // navy cover
    [{ color: { r: 250, g: 230, b: 120 }, weight: 0.7 }, { color: { r: 240, g: 240, b: 240 }, weight: 0.3 }], // pale yellow cover
    [{ color: { r: 200, g: 30, b: 60 }, weight: 0.5 }, { color: { r: 30, g: 30, b: 30 }, weight: 0.5 }], // red
    [{ color: { r: 128, g: 128, b: 128 }, weight: 1 }], // grey: no tint from the art
  ];

  test("Now Playing: tokens from the tint are readable on every part of the hero", () => {
    applyAccentTokens(fakeRoot(), OBSIDIAN);
    const bad: string[] = [];
    for (const pal of palettes) {
      for (const base of ["#09090B", "#0B0B0E", "#1E1E2E"]) {
        const bgs = heroBackgrounds(pal, base, pal[0].color);
        const tint = pickTint(pal, bgs, OBSIDIAN.accent);
        const v = scopedAccentVariables(tintLook(tint, bgs, "dark"), tintInk(tint));
        // Never worse than the tint pickTint checked, and at least 3:1 wherever the tint could be.
        for (const bg of bgs) {
          const floor = Math.min(ACCENT_UI_MIN, contrastRatio(tint.accent, bg));
          if (contrastRatio(v["--lens-accent-ui"], bg) < floor - 0.01) bad.push(`${tint.accent} ui ${contrastRatio(v["--lens-accent-ui"], bg).toFixed(2)} on ${bg}`);
        }
        if (tint.fromArt) for (const bg of bgs) if (contrastRatio(v["--lens-accent-ui"], bg) < ACCENT_UI_MIN) bad.push(`${tint.accent} art ui on ${bg}`);
        if (contrastRatio(v["--lens-on-accent-fill"], v["--lens-accent-fill"]) < ON_ACCENT_MIN) bad.push(`${tint.accent} fill text`);
        if (contrastRatio(v["--lens-focus-ring"], bgs[2]) < ACCENT_UI_MIN) bad.push(`${tint.accent} focus ring`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("the artwork's colour still shows (the tint is kept), at the theme's strength", () => {
    applyAccentTokens(fakeRoot(), OBSIDIAN);
    const pal = palettes[2];
    const bgs = heroBackgrounds(pal, "#09090B", pal[0].color);
    const tint = pickTint(pal, bgs, "#FAFAFA");
    expect(tint.fromArt).toBe(true);
    const v = scopedAccentVariables(tintLook(tint, bgs, "dark"), tintInk(tint));
    expect(v["--lens-accent-ui"]).toBe(tint.accent.toUpperCase());
    applyAccentTokens(fakeRoot(), { ...OBSIDIAN, strength: "subtle" });
    // Subtle: the selected chip keeps the tint's own monochrome ink, as everywhere else.
    expect(scopedAccentVariables(tintLook(tint, bgs, "dark"), tintInk(tint))["--lens-accent-fill"]).toBe(tint.accent);
    applyAccentTokens(fakeRoot(), OBSIDIAN);
  });

  test("a grey accent and no artwork colour: no colour, the page's own light ink (not the window's)", () => {
    applyAccentTokens(fakeRoot(), { ...ALABASTER, accent: "#FAFAFA" });
    const bgs = heroBackgrounds([], "#0B0B0E", null);
    const tint = pickTint([], bgs, "#FAFAFA");
    const v = scopedAccentVariables(tintLook(tint, bgs, "dark"), tintInk(tint));
    expect(v["--lens-accent-ui"]).toBe(tint.accent);
    expect(contrastRatio(v["--lens-focus-ring"], "#0B0B0E")).toBeGreaterThanOrEqual(ON_ACCENT_MIN);
    applyAccentTokens(fakeRoot(), OBSIDIAN);
  });

  test("tintLook checks the hardest backgrounds: the lightest on a dark page, the darkest on a light one", () => {
    const tint = { accent: "#FF0000", onAccent: "#09090B", fromArt: true, ratio: 5 };
    expect(tintLook(tint, ["#101010", "#404040", "#202020"], "dark")).toMatchObject({ surface: "#404040", card: "#202020" });
    expect(tintLook(tint, ["#F3F3F5", "#E4E4E8"], "light")).toMatchObject({ surface: "#E4E4E8", card: "#F3F3F5" });
  });

  test("Now Playing and Immersive write the scoped tokens on their roots", () => {
    const np = read("src/music/NowPlaying.tsx");
    expect(np).toContain("const accentVars = useScopedAccent(tintLook(tint, heroBgs, \"dark\"), tintInk(tint));");
    expect(np).toContain("accentVars={immAccentVars}");
    expect(read("src/music/Immersive.tsx")).toContain("...(p.accentVars ?? {}),");
  });

  test("Theme follows music: every step of the fade re-derives the tokens; letting go restores them", () => {
    const root = fakeRoot();
    applyAccentTokens(root, OBSIDIAN);
    const own = root.props.get("--lens-accent-ui");
    // A navy cover on a dark theme: the raw colour fails, the token is lifted.
    followAccent(root, "#0A1A6B");
    const ui = root.props.get("--lens-accent-ui")!;
    expect(ui).not.toBe(own);
    expect(contrastRatio(ui, OBSIDIAN.surface)).toBeGreaterThanOrEqual(ACCENT_UI_MIN);
    expect(contrastRatio(root.props.get("--lens-on-accent-fill")!, root.props.get("--lens-accent-fill")!)).toBeGreaterThanOrEqual(ON_ACCENT_MIN);
    followAccent(root, null);
    expect(root.props.get("--lens-accent-ui")).toBe(own);
    // A theme change ends the follow (applyThemeToDocument rewrites --lens-accent too).
    followAccent(root, "#0A1A6B");
    applyAccentTokens(root, OBSIDIAN);
    expect(root.props.get("--lens-accent-ui")).toBe(own);
  });

  test("B-140: letting go puts the window's own accent back instead of removing it", async () => {
    const { setFollowedAccent } = await import("../music/themeFollow");
    const root = fakeRoot();
    applyAccentTokens(root, OBSIDIAN);
    root.style.setProperty("--lens-accent", OBSIDIAN.accent);
    setFollowedAccent(root as unknown as HTMLElement, "#C2410C");
    expect(root.props.get("--lens-accent")).toBe("#C2410C");
    setFollowedAccent(root as unknown as HTMLElement, null);
    // Before: removeProperty, so tokens.css's #fafafa showed until the next theme change.
    expect(root.props.get("--lens-accent")).toBe(OBSIDIAN.accent);
    expect(wornAccent()).toBe(OBSIDIAN.accent);
    // The tokens are the theme's own again.
    expect(root.props.get("--lens-accent-ui")).toBe(accentTokens(OBSIDIAN)!.ui);
  });
});

describe("B-144: selected text uses the accent with a readable ink", () => {
  test("::selection reads the accent tokens, outside High contrast and Windows contrast themes", () => {
    const css = noComments(read("src/styles/global.css"));
    expect(css).toMatch(/:root:not\(\[data-contrast="high"\]\) ::selection \{\s*background: var\(--lens-accent-ui\);\s*color: var\(--lens-on-accent-ui\);\s*\}/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*:root:not\(\[data-contrast="high"\]\) ::selection \{\s*background: Highlight;\s*color: HighlightText;/);
    // Never the fixed blue, never the raw accent.
    expect(css).not.toMatch(/::selection[^{]*\{[^}]*(#3b82f6|#60a5fa|var\(--lens-accent\))/i);
  });

  test("the selection ink reads on the selection colour for any accent, dark and light", () => {
    const bad: string[] = [];
    for (const base of [OBSIDIAN, ALABASTER]) {
      for (const accent of WHEEL) {
        const t = accentTokens({ ...base, accent });
        if (!t) continue;
        if (contrastRatio(t.onUi, t.ui) < ON_ACCENT_MIN) bad.push(`${base.scheme} ${accent}`);
      }
    }
    expect(bad).toEqual([]);
    // The monochrome defaults (a grey accent): ink-inverted, readable both ways.
    expect(contrastRatio("#09090B", "#FAFAFA")).toBeGreaterThanOrEqual(ON_ACCENT_MIN);
    expect(contrastRatio("#FAFAFA", "#18181B")).toBeGreaterThanOrEqual(ON_ACCENT_MIN);
  });
});

describe("B-143: these areas use the shared press (DESIGN.md §5.5)", () => {
  test("no :active rule is left in their stylesheets (a slider thumb's grab is not a press)", () => {
    const bad: string[] = [];
    for (const f of AREAS.flatMap((d) => files(d, [".css"]))) {
      for (const m of noComments(read(f)).matchAll(/([^{}]*):active([^{]*)\{/g)) if (!/slider-thumb/.test(m[2])) bad.push(`${f}: ${m[0].trim()}`);
    }
    expect(bad).toEqual([]);
  });

  test("Lens Browser runs the shared press, not its own", () => {
    const main = read("src/main.tsx");
    expect(main).toContain("const OWN_PRESS_SURFACES: readonly string[] = [];");
    expect(main).not.toContain('surfaceName === "browser"');
  });

  test("every component file in these areas is held by the feel guardrail", () => {
    const migrated = new Set(read("tools/polish/feel-migrated.txt").split(/\s+/).filter(Boolean));
    const missing = AREAS.flatMap((d) => files(d, [".tsx"])).filter((f) => !migrated.has(f));
    expect(missing).toEqual([]);
  });

  test("hover never scales the Dock music card's play button", () => {
    expect(noComments(read("src/music/dockMusicCard.css"))).not.toMatch(/\.dmc-play:hover \{[^}]*scale/);
  });
});

// Fable pass, Settings / themes / window styling / setup (fable/settings-20261127):
//   the accent across Lens's own surfaces (src/themes/accentTokens.ts) and its contrast audit,
//   B-58 (three cards whose options were click-dead while the feature was off),
//   B-111 (the "update ready" pill and the first Quick settings tile icon could be unreadable on an accent),
//   B-112 (the Night light switch knob followed the accent's ink),
//   the Dock on the shared press, pop-out origins and the sliding filter pill.
import { describe, expect, mock, test } from "bun:test";
// Module mocks from other test files leak across files (bun), and the real event / window modules
// import names a partial core mock doesn't have: mock all three, as the other suites do.
mock.module("@tauri-apps/api/core", () => ({ invoke: async () => null, convertFileSrc: (p: string) => p, transformCallback: () => 0 }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {}, emitTo: async () => {} }));
mock.module("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "settings", listen: async () => () => {}, onFocusChanged: async () => () => {} }) }));
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AltDragCard } from "../components/AltDragCard";
import { AppSummonCard } from "../components/AppSummonCard";
import { MagicCard } from "../components/MagicCard";
import {
  ACCENT_STRENGTHS,
  ACCENT_UI_MIN,
  ACCENT_VARIABLES,
  ON_ACCENT_MIN,
  accentCssVariables,
  accentTokens,
  applyAccentTokens,
  chroma,
  fitAccent,
  inkOn,
  mixHex,
  normalizeAccentStrength,
  paintedSurfaces,
  restoreAccent,
  retintAccent,
  type AccentStrength,
} from "../themes/accentTokens";
import { surfaces as auditSurfaces, textTokensFor, TEXT_TOKENS } from "../themes/contrastAudit";
import { allPacks, contrastRatio, type ThemePack } from "../themes/packs";
import { hslToRgb } from "../playground/util";
import { sampleConfig } from "./fixtures";

const root = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const STRENGTHS: AccentStrength[] = ["subtle", "balanced", "vivid"];

/** Every promise the tokens make, for one accent on one pair of surfaces. */
function problems(label: string, accent: string, surface: string, card: string, scheme: "light" | "dark", fg: string, secondary: string): string[] {
  const out: string[] = [];
  for (const strength of STRENGTHS) {
    const t = accentTokens({ accent, surface, card, scheme, strength, fg, secondary });
    if (!t) continue;
    const at = `${label} ${accent} ${strength}`;
    for (const s of [surface, card]) {
      if (contrastRatio(t.ui, s) < ACCENT_UI_MIN) out.push(`${at}: accent UI ${contrastRatio(t.ui, s).toFixed(2)}:1 on ${s}`);
      const washed = mixHex(s, t.ui, t.wash);
      if (contrastRatio(fg, washed) < ON_ACCENT_MIN) out.push(`${at}: text on a selected row ${contrastRatio(fg, washed).toFixed(2)}:1`);
      if (contrastRatio(secondary, washed) < ON_ACCENT_MIN) out.push(`${at}: secondary text on a selected row ${contrastRatio(secondary, washed).toFixed(2)}:1`);
      if (contrastRatio(t.ui, washed) < ACCENT_UI_MIN) out.push(`${at}: accent on a selected row ${contrastRatio(t.ui, washed).toFixed(2)}:1`);
    }
    if (contrastRatio(t.onUi, t.ui) < ON_ACCENT_MIN) out.push(`${at}: knob on the accent ${contrastRatio(t.onUi, t.ui).toFixed(2)}:1`);
    if (t.fill && t.onFill && contrastRatio(t.onFill, t.fill) < ON_ACCENT_MIN) out.push(`${at}: text on an accent fill ${contrastRatio(t.onFill, t.fill).toFixed(2)}:1`);
    if (t.hover > t.wash) out.push(`${at}: hover tint above the selected tint`);
  }
  return out;
}

const packInput = (p: ThemePack) => {
  const scheme = p.scheme === "light" ? ("light" as const) : ("dark" as const);
  const text = textTokensFor(p);
  return { scheme, text, ...paintedSurfaces(p.base, scheme, p.accent, p.tint) };
};

describe("accent tokens: contrast audit", () => {
  test("every pack, at every strength: accent UI ≥ 3:1, text on accent ≥ 4.5:1, selected rows stay readable", () => {
    const bad: string[] = [];
    for (const p of allPacks().filter((x) => x.tier !== "Custom")) {
      const i = packInput(p);
      bad.push(...problems(p.id, p.accent, i.surface, i.card, i.scheme, i.text.fg, i.text.secondary));
    }
    expect(bad).toEqual([]);
  });

  test("any accent a person can pick (the whole wheel), on every pack's surfaces", () => {
    const hex = (h: number, s: number, l: number) => {
      const c = hslToRgb(h, s, l);
      return "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
    };
    const wheel: string[] = [];
    for (let h = 0; h < 360; h += 15) for (const s of [0.35, 0.7, 1]) for (const l of [0.12, 0.3, 0.5, 0.7, 0.9]) wheel.push(hex(h, s, l));
    const bad: string[] = [];
    for (const p of allPacks().filter((x) => x.tier !== "Custom")) {
      const scheme = p.scheme === "light" ? ("light" as const) : ("dark" as const);
      const text = textTokensFor(p);
      for (const accent of wheel) {
        // The person's accent also tints the glass by the pack's own amount.
        const s = paintedSurfaces(p.base, scheme, accent, p.tint);
        bad.push(...problems(p.id, accent, s.surface, s.card, scheme, text.fg, text.secondary));
      }
    }
    expect(bad).toEqual([]);
  });

  test("the surfaces are the ones the theme contrast audit checks", () => {
    for (const p of allPacks().filter((x) => x.tier !== "Custom")) {
      const mine = paintedSurfaces(p.base, p.scheme === "light" ? "light" : "dark", p.accent, p.tint);
      expect(mine).toEqual(auditSurfaces(p));
    }
  });

  test("an accent that passes is used as it is; one that doesn't keeps its hue and moves in lightness", () => {
    expect(fitAccent("#818CF8", ["#050507", "#0D0D11"], "dark")).toBe("#818CF8");
    const navy = fitAccent("#0A1A6B", ["#08080B", "#111116"], "dark");
    expect(navy).not.toBe("#0A1A6B");
    expect(contrastRatio(navy, "#111116")).toBeGreaterThanOrEqual(3);
    const lemon = fitAccent("#FFF27A", ["#EEEEF0", "#FFFFFF"], "light");
    expect(contrastRatio(lemon, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    // Still a blue, still a yellow: blue stays the strongest channel, blue stays the weakest.
    expect(parseInt(navy.slice(5, 7), 16)).toBeGreaterThan(parseInt(navy.slice(1, 3), 16));
    expect(parseInt(lemon.slice(5, 7), 16)).toBeLessThan(parseInt(lemon.slice(1, 3), 16));
  });

  test("ink on an accent is always at least 4.5:1, mid-tones included", () => {
    for (let v = 0; v <= 255; v += 5) {
      const grey = "#" + v.toString(16).padStart(2, "0").repeat(3);
      expect(contrastRatio(inkOn(grey), grey)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("accent tokens: colour only where it's earned", () => {
  const base = { surface: "#08080B", card: "#111116", scheme: "dark" as const, fg: TEXT_TOKENS.dark.fg, secondary: TEXT_TOKENS.dark.secondary };

  test("a white, black or grey accent writes nothing: the monochrome defaults stay", () => {
    for (const accent of ["#FAFAFA", "#18181B", "#A1A1AA", "#F4F4F5", "#000"]) {
      expect(chroma(accent)).toBeLessThan(0.08);
      for (const strength of STRENGTHS) expect(accentTokens({ ...base, accent, strength })).toBeNull();
    }
  });

  test("High contrast steps the accent aside", () => {
    expect(accentTokens({ ...base, accent: "#2563EB", strength: "vivid", highContrast: true })).toBeNull();
  });

  test("Subtle: marks, rings and switches only. Balanced adds fills and a wash. Vivid adds hover", () => {
    const at = (strength: AccentStrength) => accentTokens({ ...base, accent: "#818CF8", strength })!;
    expect(at("subtle").fill).toBeNull();
    expect(at("subtle").wash).toBe(0);
    expect(at("subtle").edge).toBe(0);
    expect(at("subtle").ui).toBe("#818CF8");
    expect(at("balanced").fill).toBe("#818CF8");
    expect(at("balanced").wash).toBeGreaterThan(0);
    expect(at("balanced").hover).toBe(0);
    expect(at("vivid").wash).toBeGreaterThan(at("balanced").wash);
    expect(at("vivid").hover).toBeGreaterThan(0);
  });

  test("Balanced is the default, and unknown values fall back to it", () => {
    expect(normalizeAccentStrength(undefined)).toBe("balanced");
    expect(normalizeAccentStrength("loud")).toBe("balanced");
    expect(normalizeAccentStrength("subtle")).toBe("subtle");
    expect(ACCENT_STRENGTHS.map((s) => s.id)).toEqual(["subtle", "balanced", "vivid"]);
    expect(read("src-tauri/src/config.rs")).toMatch(/fn default_accent_strength\(\) -> String \{\s*"balanced"\.into\(\)/);
    expect(read("src-tauri/src/control/catalogue.rs")).toContain('"theme.accentStrength"');
  });

  test("tokens.css defaults are the monochrome look, so nothing changes until an accent has colour", () => {
    const css = noComments(read("src/styles/tokens.css"));
    expect(css).toContain("--lens-accent-ui: var(--cc-accent);");
    expect(css).toContain("--lens-on-accent-ui: var(--lens-on-fg);");
    expect(css).toContain("--lens-accent-fill: var(--cc-accent);");
    expect(css).toContain("--lens-on-accent-fill: var(--lens-on-fg);");
    for (const k of ["wash", "edge", "hover"]) expect(css).toContain(`--lens-accent-${k}: 0%;`);
  });
});

describe("accent tokens: written once, cheaply", () => {
  function fakeRoot() {
    const props = new Map<string, string>();
    let writes = 0;
    return {
      props,
      get writes() {
        return writes;
      },
      style: {
        setProperty: (k: string, v: string) => (writes++, void props.set(k, v)),
        removeProperty: (k: string) => (writes++, void props.delete(k)),
        getPropertyValue: (k: string) => props.get(k) ?? "",
      },
    };
  }
  const input = { accent: "#2563EB", surface: "#EEEEF0", card: "#FFFFFF", scheme: "light" as const, strength: "balanced" as const, fg: TEXT_TOKENS.light.fg, secondary: TEXT_TOKENS.light.secondary };

  test("applying the same theme twice writes nothing the second time (no extra restyle on a theme switch)", () => {
    const r = fakeRoot();
    applyAccentTokens(r, input);
    const first = r.writes;
    expect(first).toBe(ACCENT_VARIABLES.length);
    applyAccentTokens(r, input);
    expect(r.writes).toBe(first);
  });

  test("going back to a grey accent, or to Subtle, removes what no longer applies", () => {
    const r = fakeRoot();
    applyAccentTokens(r, input);
    applyAccentTokens(r, { ...input, strength: "subtle" });
    expect(r.props.has("--lens-accent-fill")).toBe(false);
    expect(r.props.get("--lens-accent-ui")).toBe("#2563EB");
    applyAccentTokens(r, { ...input, accent: "#18181B" });
    expect(r.props.size).toBe(0);
  });

  test("a living look re-derives the tokens for its own colours and gives them back", () => {
    const r = fakeRoot();
    applyAccentTokens(r, input);
    retintAccent(r, { accent: "#F59E0B", surface: "#0B1020", card: "#141A2E", scheme: "dark" });
    const ui = r.props.get("--lens-accent-ui")!;
    expect(ui).not.toBe("#2563EB");
    expect(contrastRatio(ui, "#141A2E")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(r.props.get("--lens-on-accent-ui")!, ui)).toBeGreaterThanOrEqual(4.5);
    restoreAccent(r);
    expect(r.props.get("--lens-accent-ui")).toBe("#2563EB");
  });

  test("the focus ring follows the accent; percentages are whole", () => {
    const v = accentCssVariables(accentTokens(input)!);
    expect(v["--lens-focus-ring"]).toBe(v["--lens-accent-ui"]);
    expect(v["--lens-accent-wash"]).toMatch(/^\d+%$/);
  });

  test("no selector is keyed on the accent: only values change, so style matching costs nothing more", () => {
    for (const f of ["src/styles/tokens.css", "src/styles/global.css", "src/ui/ui.css", "src/settings/ui/settings.css", "src/surfaces/ControlCenterSurface.css", "src/surfaces/QuickSettingsSurface.css", "src/surfaces/DockSurface.css"]) {
      expect(noComments(read(f))).not.toMatch(/\[data-accent/);
    }
    // The theme switch holds transitions when the strength changes, like any other theme value.
    expect(read("src/hooks/useLensState.ts")).toContain('t.accentStrength ?? ""');
  });
});

describe("the accent reaches the shared controls through the tokens", () => {
  const rule = (css: string, sel: string) => {
    const i = css.indexOf(`${sel} {`);
    return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
  };

  test("switches: track in the accent, knob in its ink (Settings, the kit, Quick settings)", () => {
    const cc = read("src/surfaces/ControlCenterSurface.css");
    const ui = read("src/ui/ui.css");
    const qs = read("src/surfaces/QuickSettingsSurface.css");
    expect(rule(cc, ".cc-toggle.on")).toContain("background: var(--lens-accent-ui)");
    expect(rule(cc, ".cc-toggle.on::after")).toContain("background: var(--lens-on-accent-ui)");
    expect(rule(ui, ".lens-toggle.on")).toContain("background: var(--lens-accent-ui)");
    expect(rule(ui, ".lens-toggle.on::after")).toContain("background: var(--lens-on-accent-ui)");
    expect(rule(qs, ".qs-switch.on")).toContain("background: var(--lens-accent-ui)");
    expect(rule(qs, ".qs-switch.on .qs-switch-knob")).toContain("background: var(--lens-on-accent-ui)");
  });

  test("B-112: the amber Night light switch keeps a dark knob whatever the accent's ink is", () => {
    const qs = read("src/surfaces/QuickSettingsSurface.css");
    expect(rule(qs, ".qs-switch.amber.on .qs-switch-knob")).toContain("#09090b");
    expect(contrastRatio("#09090B", "#FBBF24")).toBeGreaterThanOrEqual(4.5);
  });

  test("selected chips, segments and primary buttons take the fill pair, never a fill with someone else's ink", () => {
    const cc = read("src/surfaces/ControlCenterSurface.css");
    const ui = read("src/ui/ui.css");
    for (const [css, sel] of [
      [cc, ".cc-chip.active"],
      [cc, ".tux-seg button.active"],
      [ui, ".lens-btn.is-primary"],
      [ui, ".lens-seg-btn.active"],
      [ui, ".lens-chip.is-selected"],
      [read("src/settings/ui/settings.css"), ".sh-seg-btn.active"],
      [read("src/surfaces/QuickSettingsSurface.css"), ".qs-seg-btn.active"],
      [read("src/surfaces/CommandPaletteSurface.css"), ".pal-filter-pill.active"],
    ] as const) {
      const r = rule(css, sel);
      expect(r).toContain("background: var(--lens-accent-fill)");
      expect(r).toContain("color: var(--lens-on-accent-fill)");
    }
    expect(cc).toMatch(/\.cc-btn-primary \{\s*background: var\(--lens-accent-fill\);\s*color: var\(--lens-on-accent-fill\);/);
  });

  test("selected rows are washed, and plain when there is no accent to show (0 % mixes)", () => {
    const cc = read("src/surfaces/ControlCenterSurface.css");
    expect(rule(cc, ".cc-nav-btn.active")).toContain("color-mix(in srgb, var(--lens-accent-ui) var(--lens-accent-wash), rgb(var(--lens-ink) / 0.09))");
    expect(rule(read("src/surfaces/CommandPaletteSurface.css"), ".pal-result-row.selected")).toContain("var(--lens-accent-wash)");
    expect(rule(read("src/surfaces/QuickSettingsSurface.css"), ".qs-tile.active")).toContain("var(--lens-accent-wash)");
  });

  test("Dock: the focused mark is the accent, running marks carry a hint of it", () => {
    const dock = read("src/surfaces/DockSurface.css");
    expect(rule(dock, ".dock-indicator.focused")).toContain("background: var(--lens-accent-ui)");
    expect(rule(dock, ".dock-indicator")).toContain("color-mix(in srgb, var(--lens-accent-ui) var(--lens-accent-edge), rgb(var(--lens-ink) / 0.4))");
  });

  test("B-111: 'update ready' and the lit Quick settings icon use a checked pair", () => {
    const up = read("src/update/update.css");
    expect(rule(up, ".lu-pill.is-ready")).toContain("background: var(--lens-accent-ui)");
    expect(rule(up, ".lu-pill.is-ready")).toContain("color: var(--lens-on-accent-ui)");
    expect(up).not.toContain("--lens-on-accent,");
    expect(rule(read("src/settings/ui/settings.css"), ".sh-hero-tile.active .sh-hero-icon")).toContain("color: var(--lens-on-accent-ui)");
  });

  test("fill bars: the fill takes the accent, text on the empty track stays body text", () => {
    const s = read("src/settings/ui/settings.css");
    expect(rule(s, ".sh-fill-bar")).toContain("--sh-fill-ink: var(--lens-accent-fill)");
    expect(rule(s, ".sh-fill-content")).toContain("color: var(--lens-fg)");
    expect(rule(s, ".sh-fill-fill .sh-fill-content")).toContain("color: var(--sh-fill-on)");
  });

  test("Appearance has the Accent strength control, three options, and says when there is no colour to show", () => {
    const src = read("src/themeux/ThemeTab.tsx");
    expect(src).toContain('label="Accent strength"');
    expect(src).toContain("setTheme({ accentStrength: v })");
    expect(src).toContain("This accent is a grey, so there is no colour to show.");
  });
});

describe("B-58: options stay usable while the feature is off", () => {
  const cfg = (patch: Record<string, unknown>) => ({ ...(sampleConfig() as object), ...patch }) as never;
  const cards: [string, string][] = [
    ["Alt + drag", renderToStaticMarkup(<AltDragCard config={cfg({ altDrag: { enabled: false, modifier: "alt", resize: true, raise: true, restoreMaximized: true, exclude: ["blender.exe"] } })} onUpdateConfig={() => {}} />)],
    ["Magic", renderToStaticMarkup(<MagicCard config={cfg({})} onUpdateConfig={() => {}} />)],
    ["App hotkeys", renderToStaticMarkup(<AppSummonCard config={cfg({ appSummon: { enabled: false, bindings: [{ id: "a", name: "Terminal", path: "wt.exe", hotkey: "Ctrl+Alt+T", enabled: true }] } })} onUpdateConfig={() => {}} />)],
  ];

  test("no card puts its options under pointer-events: none, and the class is gone for good", () => {
    for (const [name, html] of cards) {
      expect(`${name}: ${html.includes("pi-off")}`).toBe(`${name}: false`);
      expect(`${name}: ${html.includes("pi-dim")}`).toBe(`${name}: true`);
      // Dimmed, not disabled: nothing claims to be disabled while it still takes focus.
      expect(`${name}: ${/class="pi-dim"[^>]*aria-disabled/.test(html)}`).toBe(`${name}: false`);
    }
    const css = noComments(read("src/components/ProductivityCards.css"));
    expect(css).not.toContain(".pi-off");
    const dim = css.slice(css.indexOf(".pi-dim {"), css.indexOf("}", css.indexOf(".pi-dim {")));
    expect(dim).not.toContain("pointer-events");
    for (const f of ["AltDragCard", "MagicCard", "AppSummonCard", "HotCornersCard"]) expect(read(`src/components/${f}.tsx`)).not.toMatch(/className=\{[^}]*"pi-off"/);
  });

  test("the options inside are real, enabled controls", () => {
    const [, alt] = cards[0];
    expect(alt).toMatch(/<button[^>]*class="cc-chip[^"]*"[^>]*>Alt</);
    expect(alt).not.toMatch(/class="cc-chip[^"]*"[^>]*disabled/);
    expect(alt).toContain('aria-label="Allow blender.exe again"');
    const [, apps] = cards[2];
    expect(apps).toContain('aria-label="Terminal hotkey"');
    expect(apps).not.toMatch(/aria-label="Remove Terminal"[^>]*disabled/);
  });
});

describe("the Dock on the feel system", () => {
  test("no :active press rules are left in the Dock's stylesheets or global.css", () => {
    for (const f of ["src/surfaces/DockSurface.css", "src/dock/DockSystemArea.css", "src/dock/DockContextMenu.css", "src/dock/DockAppItem.css", "src/dock/DockSearchDrawer.css", "src/styles/global.css"]) {
      expect(`${f}: ${(noComments(read(f)).match(/:active\b/g) ?? []).length}`).toBe(`${f}: 0`);
    }
  });

  test("the Dock window runs the shared press; only Lens Browser keeps its own", () => {
    const main = read("src/main.tsx");
    expect(main).toContain('const ownPress = surfaceName === "browser";');
    expect(main).not.toMatch(/ownPress = surfaceName === "dock"/);
  });

  test("the buttons that open Settings and Quick settings say so, so the pop-outs grow from them", () => {
    const dock = read("src/surfaces/DockSurface.tsx");
    expect(dock.match(/data-opens="settings"/g)?.length).toBe(2);
    expect(read("src/dock/DockSystemArea.tsx").match(/data-opens="quicksettings"/g)?.length).toBe(4);
    // The labels are the ones the pop-outs listen for.
    expect(read("src/surfaces/ControlCenterSurface.tsx")).toContain('useGrowFromTrigger("settings"');
    expect(read("src/surfaces/QuickSettingsSurface.tsx")).toContain('useGrowFromTrigger("quicksettings"');
  });

  test("the search filter is one sliding pill", () => {
    const src = read("src/dock/DockSearchDrawer.tsx");
    expect(src).toContain("useSlidingIndicator(filtersRef, filterIndRef, dockFilterTab)");
    expect(src).toContain('className="dsd-filter-ind" aria-hidden');
    const css = read("src/dock/DockSearchDrawer.css");
    expect(css).toContain("left: var(--lens-ind-x, 0);");
    expect(css).toContain('.dsd-filters:has(.dsd-filter-ind[data-on="true"]) .pal-filter-pill.active');
  });

  test("the Dock's files are held by the feel guardrail", () => {
    const migrated = read("tools/polish/feel-migrated.txt").split(/\s+/);
    for (const f of ["src/surfaces/DockSurface.tsx", "src/dock/DockAppItem.tsx", "src/dock/DockSystemArea.tsx", "src/dock/DockSearchDrawer.tsx", "src/dock/DockContextMenu.tsx", "src/themeux/ThemeTab.tsx", "src/themeux/DockTab.tsx", "src/components/AltDragCard.tsx"]) expect(migrated).toContain(f);
  });
});

describe("flourishes", () => {
  test("each Accent strength sample is drawn with that strength's own tokens, whatever the window uses", async () => {
    const { sampleVariables, AccentStrengthPreview } = await import("../themeux/AccentStrengthPreview");
    const input = { accent: "#818CF8", surface: "#050507", card: "#0D0D11", scheme: "dark" as const, fg: TEXT_TOKENS.dark.fg, secondary: TEXT_TOKENS.dark.secondary };
    const subtle = sampleVariables(input, "subtle");
    const vivid = sampleVariables(input, "vivid");
    expect(subtle["--lens-accent-ui"]).toBe("#818CF8");
    expect(subtle["--lens-accent-fill"]).toBe("var(--cc-accent)");
    expect(subtle["--lens-accent-wash"]).toBe("0%");
    expect(vivid["--lens-accent-fill"]).toBe("#818CF8");
    expect(parseInt(vivid["--lens-accent-wash"])).toBeGreaterThan(0);
    // A sample never moves the window's focus ring.
    expect(subtle["--lens-focus-ring"]).toBeUndefined();
    // A grey accent: every sample is the plain look.
    expect(sampleVariables({ ...input, accent: "#FAFAFA" }, "vivid")["--lens-accent-ui"]).toBe("var(--cc-accent)");
    const html = renderToStaticMarkup(<AccentStrengthPreview input={input} value="balanced" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/tux-accent-sample /g)?.length).toBe(3);
    expect(html).toMatch(/tux-accent-sample is-current" data-strength="balanced"/);
  });

  test("the note under Accent strength keeps two lines, so a theme switch never moves the page", () => {
    expect(read("src/themeux/ThemeTab.tsx")).toContain('className="cc-desc tux-accent-note"');
    expect(read("src/surfaces/ControlCenterSurface.css")).toMatch(/\.tux-accent-note \{\s*min-height: 32px;/);
  });

  test("the swatch tick lands once with the spring; swatches no longer scale on hover", () => {
    const css = read("src/surfaces/ControlCenterSurface.css");
    expect(css).toContain("animation: tux-check-land var(--lens-dur-base) var(--lens-ease-spring) both;");
    expect(css).not.toMatch(/\.tux-swatch:hover \{\s*transform: scale/);
  });
});

describe("B-113: focus rings and selected outlines in Simple view are contrast-checked", () => {
  test("simple.css never paints the raw accent (a navy accent on a dark theme made focus invisible)", () => {
    const css = noComments(read("src/settings/simple/simple.css"));
    expect(css).not.toMatch(/var\(--lens-accent\)/);
    expect(css).toContain("outline: 2px solid var(--lens-accent-ui)");
    // The raw colour really could fail; the token cannot.
    expect(contrastRatio("#0A1A6B", "#08080B")).toBeLessThan(3);
    const t = accentTokens({ accent: "#0A1A6B", surface: "#08080B", card: "#111116", scheme: "dark", strength: "subtle", fg: "#FAFAFA", secondary: "#A1A1AA" })!;
    expect(contrastRatio(t.ui, "#08080B")).toBeGreaterThanOrEqual(3);
  });
});

describe("B-114: one press per control in Settings and Quick settings", () => {
  test("no hand-written :active scale stacks on the weighted press", () => {
    for (const f of ["src/surfaces/ControlCenterSurface.css", "src/quicksettings/live.css", "src/settings/ui/settings.css", "src/settings/simple/simple.css"]) {
      expect(`${f}: ${/:active[^{]*\{[^}]*(transform|scale)/.test(noComments(read(f)))}`).toBe(`${f}: false`);
    }
  });
});

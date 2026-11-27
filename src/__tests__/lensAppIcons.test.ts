// Lens's own app icons (src/icons/lensApps.ts, DESIGN.md §3.7): one set, bold white glyphs on a plain
// matte tile, no effects; Lens Browser alone keeps the Lens logo.
import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

mock.module("@tauri-apps/api/core", () => ({ invoke: async () => null, convertFileSrc: (p: string) => p, transformCallback: () => 0 }));

import { CORE_APPS, iconSvg, iconUrl } from "../coreapps/registry";
import { LENS_APP_GLYPHS, LENS_APP_IDS, LENS_APP_INK, LENS_APP_STROKE, LENS_APP_TILE, TILE_CLOSE, TILE_OPEN, lensAppIconSvg, lensAppIconUrl, lensBrowserIconSvg } from "../icons/lensApps";

const root = join(import.meta.dir, "../..");
const EFFECTS = /linearGradient|radialGradient|<filter|filter=|feGaussianBlur|feDropShadow|mix-blend|opacity='0\.[2-9]|url\(#/i;
/** The Lens apps the website's demo desks show (tools/site/lib/icons.mjs). */
const SITE_APPS = ["settings", "apps", "command", "notes", "music", "monitor", "cleaner", "timer"] as const;

describe("Lens app icons", () => {
  test("every core app and Lens app has a glyph", () => {
    for (const a of CORE_APPS) expect(LENS_APP_GLYPHS[a.id]).toBeTruthy();
    for (const id of SITE_APPS) expect(LENS_APP_GLYPHS[id]).toBeTruthy();
  });

  test("white glyph, thick round stroke, plain matte tile, no effects", () => {
    expect(LENS_APP_STROKE).toBeGreaterThanOrEqual(2.25);
    expect(LENS_APP_STROKE).toBeLessThanOrEqual(2.6);
    for (const id of LENS_APP_IDS) {
      const svg = lensAppIconSvg(id);
      expect(svg).not.toMatch(EFFECTS);
      expect(svg).toContain(`fill='${LENS_APP_TILE}'`);
      expect(svg).toContain(`stroke='${LENS_APP_INK}' stroke-width='${LENS_APP_STROKE}' stroke-linecap='round' stroke-linejoin='round'`);
      // One flat tile, one hairline, one glyph path: nothing else is drawn.
      expect(svg.match(/<(rect|path|circle|ellipse|polygon|line|polyline|text|image)\b/g)).toEqual(["<rect", "<rect", "<path"]);
      expect(svg).not.toMatch(/#(?!18181B|FAFAFA)[0-9a-f]{6}/i);
    }
  });

  test("glyphs are distinct and stay on the 24 px grid", () => {
    expect(new Set(Object.values(LENS_APP_GLYPHS)).size).toBe(LENS_APP_IDS.length);
    for (const d of Object.values(LENS_APP_GLYPHS)) {
      expect(d).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/);
      // Absolute coordinates sit inside the 24 px box with room for the stroke.
      for (const n of d.match(/(?<=[MLHVC ,]|^M)-?\d+(\.\d+)?/g) ?? []) expect(Math.abs(Number(n))).toBeLessThanOrEqual(24);
    }
  });

  test("core apps render from the set (Dock pins, Search, Command, title bar)", () => {
    for (const a of CORE_APPS) {
      expect(iconSvg(a)).toBe(lensAppIconSvg(a.id));
      expect(iconUrl(a)).toBe(lensAppIconUrl(a.id));
      expect(iconUrl(a)).not.toContain("#");
      expect(iconUrl(a)).not.toContain("<");
    }
  });

  test("the Rust registry draws the identical tile and glyphs", () => {
    const rs = readFileSync(join(root, "src-tauri/src/coreapps/mod.rs"), "utf8");
    expect(rs).toContain(`pub const ICON_OPEN: &str = "${TILE_OPEN}";`);
    expect(rs).toContain(`pub const ICON_CLOSE: &str = "${TILE_CLOSE}";`);
    expect(rs).toContain(`Some(format!("{ICON_OPEN}<path d='{}'/>{ICON_CLOSE}", a.glyph))`);
    expect(rs).not.toMatch(/tint|linearGradient/);
    for (const a of CORE_APPS) expect(rs).toContain(`glyph: "${LENS_APP_GLYPHS[a.id]}"`);
  });

  test("Lens Browser is the one exception: the Lens logo, flat", () => {
    const svg = lensBrowserIconSvg();
    expect(lensAppIconSvg("browser")).toBe(svg);
    expect(svg).toContain(`fill='${LENS_APP_TILE}'`);
    // The logo's colour stays (six hues), the logo's effects go.
    expect(svg.match(/hsl\(\d+ 95% 60%\)' stop-opacity/g)?.length).toBe(6);
    expect(svg).not.toMatch(/<filter|filter=|feTurbulence|feGaussianBlur|feDropShadow|mix-blend|linearGradient/);
  });

  test("the website's demo-desk icons come from the same set", () => {
    const site = readFileSync(join(root, "tools/site/lib/icons.mjs"), "utf8");
    expect(site).toContain("src/icons/lensApps.ts");
    expect(site).not.toMatch(/const obsidian =|lens-logo-small\.svg/);
  });

  test("the website's tour tabs use the same tile and stroke, a distinct glyph each, labelled tabs", () => {
    const hero = readFileSync(join(root, "docs/site/js/hero.js"), "utf8");
    const block = hero.slice(hero.indexOf("const SC_GLYPH"), hero.indexOf("const scIcon"));
    expect(block).toContain(`fill='${LENS_APP_TILE}'`);
    expect(block).toContain(`stroke='${LENS_APP_INK}' stroke-width='${LENS_APP_STROKE}'`);
    expect(block).toContain("transform='translate(12.5 12.5) scale(1.625)'");
    expect(block).not.toMatch(EFFECTS);
    const glyphs = [...block.matchAll(/^\s+(\w+): "(.+)",$/gm)].map((m) => m[2]);
    expect(glyphs.length).toBe(4);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    // Lens Browser keeps the Lens logo; the old rainbow chip is gone.
    expect(hero).toContain('"lens-browser"');
    const css = readFileSync(join(root, "docs/site/css/site.css"), "utf8");
    expect(css).not.toContain(".sc-ic.g { background: var(--spectrum)");
    expect(hero).toMatch(/role="tab"[^>]*aria-label="\$\{esc\(s\.title\)\}/);
  });
});

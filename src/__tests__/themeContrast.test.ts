// Contrast for every theme pack (src/themes/contrastAudit.ts, docs/THEMES_AUDIT.md): body text
// 4.5:1, muted text, icons and the accent 3:1, on the surface and on cards, light and dark packs.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIFTED_TEXT_PACKS, TEXT_TOKENS, auditAllPacks, liftsText, mixSrgb, packContrast } from "../themes/contrastAudit";
import { allPacks, packById } from "../themes/packs";

const root = join(import.meta.dir, "..", "..");
const tokens = readFileSync(join(root, "src/styles/tokens.css"), "utf8");

describe("contrast, every pack", () => {
  test("every listed pack, light and dark, clears its lines", () => {
    const all = auditAllPacks();
    expect(all.length).toBe(allPacks().filter((p) => p.tier !== "Custom").length);
    expect(all.some((p) => p.scheme === "light")).toBe(true);
    expect(all.some((p) => p.scheme === "dark")).toBe(true);
    expect(all.filter((p) => p.failures.length).map((p) => `${p.id}: ${p.failures.join("; ")}`)).toEqual([]);
  });

  test("the audit's text tones are tokens.css's", () => {
    const block = (sel: string) => tokens.slice(tokens.indexOf(sel), tokens.indexOf("}", tokens.indexOf(sel))).toLowerCase();
    const root0 = block(":root {");
    expect(root0).toContain(`--lens-fg-secondary: ${TEXT_TOKENS.dark.secondary.toLowerCase()}`);
    expect(root0).toContain(`--lens-fg-muted: ${TEXT_TOKENS.dark.muted.toLowerCase()}`);
    const light = block(':root[data-scheme="light"] {');
    expect(light).toContain(`--lens-fg: ${TEXT_TOKENS.light.fg.toLowerCase()}`);
    expect(light).toContain(`--lens-fg-secondary: ${TEXT_TOKENS.light.secondary.toLowerCase()}`);
    expect(light).toContain(`--lens-fg-muted: ${TEXT_TOKENS.light.muted.toLowerCase()}`);
    const lifted = block(':root[data-text-lift]:not([data-scheme="light"]) {');
    expect(lifted).toContain(`--lens-fg-secondary: ${TEXT_TOKENS.lifted.secondary.toLowerCase()}`);
    expect(lifted).toContain(`--lens-fg-muted: ${TEXT_TOKENS.lifted.muted.toLowerCase()}`);
  });

  test("every window sets the lift from the same rule", () => {
    const apply = readFileSync(join(root, "src/hooks/useLensState.ts"), "utf8");
    expect(apply).toContain("if (liftsText(packById(cfg.theme.preset))) root.dataset.textLift");
    for (const id of LIFTED_TEXT_PACKS) expect(liftsText(packById(id))).toBe(true);
    expect(liftsText(packById("obsidian"))).toBe(false);
    expect(liftsText(packById("alabaster-daylight"))).toBe(false);
    expect(liftsText(packById("catppuccin-mocha"))).toBe(true);
  });

  test("the two light packs nudged for their accent stay close to upstream", () => {
    for (const [id, accent] of [["cc-everforest-light", "#859801"], ["cc-base16-cupcake", "#6D90B1"]] as const) {
      const p = packById(id)!;
      expect(p.accent).toBe(accent);
      expect(packContrast(p).ratios.accent).toBeGreaterThanOrEqual(3);
    }
  });

  test("tint mixes like color-mix in srgb", () => {
    expect(mixSrgb("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixSrgb("#102030", "#102030", 0.3)).toBe("#102030");
  });

  test("the audit document is current", () => {
    const { buildAudit } = require("../../tools/themes/audit") as { buildAudit: () => string };
    expect(readFileSync(join(root, "docs/THEMES_AUDIT.md"), "utf8")).toBe(buildAudit());
  });
});

// Community packs from the Claude Code ecosystem: schema, credit links, contrast and gallery counts.
import { describe, expect, mock, test } from "bun:test";
import { sampleConfig } from "./fixtures";

mock.module("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => p,
  transformCallback: () => 0,
  invoke: async () => null,
}));

const packs = await import("../themes/packs");
const { CLAUDE_PACKS, CLAUDE_COLLECTION } = await import("../themes/community/claude");

const PLAYGROUND_SCENES = ["aurora", "constellation", "flow", "ink", "rain", "sand", "sky-clock", "starfield"];
const DOCKS = ["floating", "slim", "taskbar", "studio", "minimal", "split"];

describe("Claude Code community packs", () => {
  test("there is a real collection and the built-in count is unchanged", () => {
    expect(CLAUDE_PACKS.length).toBeGreaterThanOrEqual(40);
    expect(packs.THEME_PACKS.length).toBe(21);
    expect(packs.THEME_PACKS.some((p) => p.tier === "Community")).toBe(false);
    expect(packs.COMMUNITY_PACKS.length).toBe(CLAUDE_PACKS.length);
  });

  test("every pack follows the schema and the shared style vocabulary", () => {
    const folderIds = packs.FOLDER_THEMES.map((f) => f.id);
    const frameIds = packs.FRAME_STYLES.map((f) => f.id);
    for (const p of CLAUDE_PACKS) {
      expect(p.id).toMatch(/^cc-[a-z0-9-]+$/);
      expect(p.tier).toBe("Community");
      expect(p.collection).toBe(CLAUDE_COLLECTION);
      expect(p.base).toMatch(/^#[0-9A-F]{6}$/);
      expect(p.accent).toMatch(/^#[0-9A-F]{6}$/);
      expect(p.radius).toBeGreaterThanOrEqual(0);
      expect(p.radius).toBeLessThanOrEqual(20);
      expect(packs.ICON_THEMES).toContain(p.iconTheme);
      expect(packs.ICON_SHAPES).toContain(p.iconShape);
      expect(packs.CONTROL_STYLES).toContain(p.controlStyle);
      expect(folderIds).toContain(p.folderTheme);
      expect(frameIds).toContain(p.frameStyle);
      expect(DOCKS).toContain(p.dockStyle);
      expect((p.description ?? "").length).toBeGreaterThan(10);
      expect(p.aliases.length).toBeGreaterThan(0);
    }
  });

  test("ids never collide with built-ins or each other, and each look is distinct", () => {
    const ids = [...packs.THEME_PACKS, ...CLAUDE_PACKS].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const looks = new Set(CLAUDE_PACKS.map((p) => `${p.base}|${p.accent}`));
    expect(looks.size).toBe(CLAUDE_PACKS.length);
  });

  test("every pack credits its source with an https link and a licence", () => {
    for (const p of CLAUDE_PACKS) {
      const s = p.source!;
      expect(s).toBeDefined();
      expect(s.name.length).toBeGreaterThan(2);
      expect(s.author.length).toBeGreaterThan(1);
      expect(s.url).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/\S*$/i);
      expect(["MIT", "Apache-2.0"]).toContain(s.license);
    }
  });

  test("body text stays readable on every community surface (4.5:1)", () => {
    for (const p of CLAUDE_PACKS) {
      const ink = p.scheme === "light" ? "#18181B" : "#FAFAFA";
      expect(packs.contrastRatio(p.base!, ink)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("backdrops point at real Lens Playground scenes and link the original", () => {
    for (const p of CLAUDE_PACKS) {
      if (!p.backdrop) continue;
      expect(PLAYGROUND_SCENES).toContain(p.backdrop.scene);
      expect(p.backdrop.url).toMatch(/^https:\/\//);
      expect(p.backdrop.note).toContain(p.backdrop.url);
    }
  });

  test("community packs resolve and apply like built-ins", () => {
    expect(packs.packById("cc-claude-dark")?.label).toBe("Claude Dark");
    expect(packs.packByAlias("claude")?.id).toBe("cc-claude-dark");
    expect(packs.packByAlias("catppuccin")?.id).toBe("catppuccin-mocha"); // built-ins win
    const next = packs.applyThemePack(sampleConfig(), "cc-blueprint");
    expect(next.theme.preset).toBe("cc-blueprint");
    expect(next.theme.surfaceHex).toBe("#0C2444");
    // Listed: every community pack except the ones merged into a twin (themes are colour-only).
    const merged = CLAUDE_PACKS.filter((p) => packs.isMergedPack(p.id)).length;
    expect(packs.allPacks().filter((p) => p.collection === CLAUDE_COLLECTION).length).toBe(CLAUDE_PACKS.length - merged);
  });

  test("the six built-in recommended packs are untouched", () => {
    expect(packs.recommendedPacks().every((p) => p.tier !== "Community")).toBe(true);
    expect(packs.recommendedPacks().length).toBe(6);
  });
});

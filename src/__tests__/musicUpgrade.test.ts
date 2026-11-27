// Lens Music upgrade ("learned from Cider"): Immersive view model, artwork tint contrast picking,
// lyric translation keys and parsing, the first-run setup, the press hold and the Command phrase.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, hexToRgb, type LyricLine } from "../music/model";
import { ambientField, controlsHidden, immersiveModel, lineText, lyricWindow, originPose } from "../music/immersiveModel";
import { heroBackgrounds, pickTint, textOn, worstContrast } from "../music/tint";
import { chooseProvider, defaultLanguage, numberedLines, parseTranslation, providerLabel, translatePrompt, translationKey } from "../music/translate";
import { setupSteps, setupSummary } from "../music/setup";
import { isImmersivePhrase, immersiveTemplates, isImmersiveStub } from "../music/command";

const rgb = (h: string) => hexToRgb(h)!;
const lines = (n: number): LyricLine[] => Array.from({ length: n }, (_, i) => ({ startMs: 10_000 + i * 4_000, text: `Line ${i + 1}` }));
const pal = (hexes: [string, number][]) => hexes.map(([h, w]) => ({ color: rgb(h), weight: w }));

describe("Immersive view model", () => {
  test("ambient field: four layers in the artwork's colours, still when reduced", () => {
    const f = ambientField(pal([["#d9468f", 0.5], ["#1e3a8a", 0.3], ["#f59e0b", 0.2]]), "#09090b", false);
    expect(f.layers).toHaveLength(4);
    expect(f.still).toBe(false);
    expect(f.layers[0].background).toContain("radial-gradient");
    // Each layer loops on its own length and phase, so they never move in step.
    expect(new Set(f.layers.map((l) => l.beats)).size).toBe(4);
    expect(new Set(f.layers.map((l) => l.phase)).size).toBe(4);
    expect(ambientField([], "#09090b", true).still).toBe(true);
    // No artwork: neutral layers, faint.
    expect(ambientField([], "#09090b", false).layers.every((l) => l.opacity <= 0.35)).toBe(true);
  });

  test("light theme: a paper base, less colour mixed in", () => {
    const dark = ambientField(pal([["#d9468f", 1]]), "#09090b", false, false);
    const light = ambientField(pal([["#d9468f", 1]]), "#eeeef0", false, true);
    const lum = (h: string) => { const c = rgb(h); return c.r + c.g + c.b; };
    expect(lum(light.base)).toBeGreaterThan(lum(dark.base));
  });

  test("controls hide after the idle time, never over the controls or when empty", () => {
    const base = { lastActivityMs: 0, idleMs: 3000, overControls: false, empty: false };
    expect(controlsHidden({ ...base, nowMs: 2999 })).toBe(false);
    expect(controlsHidden({ ...base, nowMs: 3000 })).toBe(true);
    expect(controlsHidden({ ...base, nowMs: 9000, overControls: true })).toBe(false);
    expect(controlsHidden({ ...base, nowMs: 9000, empty: true })).toBe(false);
    // A silly setting can't hide them instantly.
    expect(controlsHidden({ ...base, idleMs: 0, nowMs: 500 })).toBe(false);
  });

  test("lyric window: current line bright, a few around it, long lyrics stay small", () => {
    const w = lyricWindow(lines(200), 10_000 + 100 * 4_000 + 10, 0, null, "original");
    expect(w.current).toBe(100);
    expect(w.lines.map((l) => l.index)).toEqual([98, 99, 100, 101, 102, 103, 104]);
    const cur = w.lines.find((l) => l.role === "current")!;
    expect(cur.opacity).toBe(1);
    expect(w.lines.every((l) => l.role === "current" || l.opacity < 1)).toBe(true);
    // Before the first line: the first lines wait, nothing is current.
    const early = lyricWindow(lines(10), 0, 0, null, "original");
    expect(early.current).toBe(-1);
    expect(early.lines[0].index).toBe(0);
    expect(early.lines.some((l) => l.role === "current")).toBe(false);
    // Offset: positive shows lines earlier.
    expect(lyricWindow(lines(10), 13_600, 500, null, "original").current).toBe(1);
  });

  test("original / translated / both", () => {
    expect(lineText("Hola", "Hello", "original")).toEqual({ text: "Hola", sub: null });
    expect(lineText("Hola", "Hello", "translated")).toEqual({ text: "Hello", sub: null });
    expect(lineText("Hola", "Hello", "both")).toEqual({ text: "Hola", sub: "Hello" });
    // Missing or identical translations fall back to the original.
    expect(lineText("Hola", "", "translated")).toEqual({ text: "Hola", sub: null });
    expect(lineText("OK", "OK", "both")).toEqual({ text: "OK", sub: null });
    const w = lyricWindow(lines(3), 14_100, 0, ["Ligne 1", "Ligne 2", "Ligne 3"], "both");
    expect(w.lines.find((l) => l.role === "current")!.sub).toBe("Ligne 2");
  });

  test("layout and animation follow what's playing and whether the window is shown", () => {
    const input = {
      hasSession: true, title: "Harbour Lights", artist: "The Placeholders", album: "Lens Sessions", status: "playing", positionMs: 64_000, durationMs: 224_000,
      lyrics: { found: true, synced: true, lines: lines(8) }, lyricsEnabled: true, offsetMs: 0, translated: null, view: "original" as const, hidden: false,
    };
    const m = immersiveModel(input, false);
    expect(m.layout).toBe("art-lyrics");
    expect(m.animate).toBe(true);
    expect(m.subtitle).toBe("The Placeholders — Lens Sessions");
    expect(m.progress).toBeCloseTo(64 / 224, 3);
    expect(immersiveModel({ ...input, hidden: true }, false).animate).toBe(false);
    expect(immersiveModel(input, true).animate).toBe(false);
    expect(immersiveModel({ ...input, status: "paused" }, false).animate).toBe(false);
    expect(immersiveModel({ ...input, lyricsEnabled: false }, false).layout).toBe("art-only");
    expect(immersiveModel({ ...input, lyrics: { found: true, synced: false, lines: lines(3) } }, false).layout).toBe("art-only");
    expect(immersiveModel({ ...input, hasSession: false }, false).layout).toBe("empty");
  });

  test("the artwork grows from what opened Immersive", () => {
    const target = { x: 100, y: 100, w: 400, h: 400 };
    const fromNp = originPose("nowplaying", { x: 40, y: 60, w: 200, h: 200 }, target);
    expect(fromNp).toEqual({ x: -160, y: -140, scale: 0.5 });
    expect(originPose("dock", null, target).y).toBeGreaterThan(0);
    expect(originPose("command", null, target).scale).toBeLessThan(1);
    // Now Playing without a rect (first build): a gentle default.
    expect(originPose("nowplaying", null, target).scale).toBeLessThan(1);
  });
});

describe("artwork tint: contrast picking", () => {
  const bgs = ["#3b1530", "#1f1220", "#09090b"];

  test("a vivid artwork colour is lifted to 4.5:1 on every background and kept", () => {
    const t = pickTint(pal([["#7a1f5c", 0.6], ["#202020", 0.4]]), bgs, "#fafafa");
    expect(t.fromArt).toBe(true);
    expect(worstContrast(rgb(t.accent), bgs.map(rgb))).toBeGreaterThanOrEqual(4.5);
    expect(t.ratio).toBeGreaterThanOrEqual(4.5);
    // Text on the accent fill reads too.
    expect(contrast(rgb(t.onAccent), rgb(t.accent))).toBeGreaterThanOrEqual(4.5);
  });

  test("greys and no artwork fall back to the theme accent, still checked", () => {
    const grey = pickTint(pal([["#808080", 0.7], ["#404040", 0.3]]), bgs, "#0a84ff");
    expect(grey.fromArt).toBe(false);
    expect(grey.ratio).toBeGreaterThanOrEqual(4.5);
    const none = pickTint([], ["#09090b"], "#fafafa");
    expect(none).toMatchObject({ fromArt: false, accent: "#fafafa" });
  });

  test("works on light backgrounds (moves darker, not lighter)", () => {
    const light = ["#eeeef0", "#f5f1e8"];
    const t = pickTint(pal([["#f9a8d4", 0.8]]), light, "#2563eb");
    expect(worstContrast(rgb(t.accent), light.map(rgb))).toBeGreaterThanOrEqual(4.5);
  });

  test("a rare speck of colour doesn't win", () => {
    const t = pickTint(pal([["#ff0000", 0.01], ["#777777", 0.99]]), bgs, "#fafafa");
    expect(t.fromArt).toBe(false);
  });

  test("hero backgrounds are the gradient's top, middle and base", () => {
    const b = heroBackgrounds(pal([["#d9468f", 1]]), "#09090b", rgb("#d9468f"));
    expect(b).toHaveLength(3);
    expect(b[2]).toBe("#09090b");
    expect(textOn(rgb("#fafafa"))).toEqual({ r: 9, g: 9, b: 11 });
  });
});

describe("lyric translation", () => {
  const ls = [{ startMs: 0, text: "Neon rain" }, { startMs: 1, text: "" }, { startMs: 2, text: "Harbour lights" }];

  test("cache keys: 32 lowercase hex, stable, change with the lines and the language", () => {
    const k = translationKey(ls, "French");
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(translationKey(ls, "French")).toBe(k);
    expect(translationKey(ls, " french ")).toBe(k);
    expect(translationKey(ls, "German")).not.toBe(k);
    expect(translationKey([...ls.slice(0, 2), { startMs: 2, text: "Harbour light" }], "French")).not.toBe(k);
    // Timing changes don't make a new translation.
    expect(translationKey(ls.map((l) => ({ ...l, startMs: l.startMs + 500 })), "French")).toBe(k);
  });

  test("lines go out numbered and come back in place", () => {
    expect(numberedLines(ls as LyricLine[])).toBe("1| Neon rain\n2| ♪\n3| Harbour lights");
    expect(translatePrompt("French", 3)).toContain("exactly 3 lines");
    expect(parseTranslation("1| Pluie néon\n2| ♪\n3| Lumières du port", 3)).toEqual(["Pluie néon", "", "Lumières du port"]);
    // Out of order, extra chatter, a missing line.
    expect(parseTranslation("Here you go:\n3. Lumières\n1) Pluie", 3)).toEqual(["Pluie", "", "Lumières"]);
    // No numbers but the right count.
    expect(parseTranslation("Pluie\n♪\nLumières", 3)).toEqual(["Pluie", "", "Lumières"]);
    // Numbers out of range are ignored.
    expect(parseTranslation("9| nope", 3)).toEqual(["", "", ""]);
  });

  test("provider: the local model first, otherwise the chosen one; the script assistant can't", () => {
    const p = (id: string, kind: string, available = true, is_local = false) => ({ id, kind, label: id, available, model: "m", is_local });
    expect(chooseProvider({ providers: [p("claude", "claude"), p("local", "local", true, true)], active: "claude" }).provider?.id).toBe("local");
    expect(chooseProvider({ providers: [p("claude", "claude"), p("local", "local", false, true)], active: "claude" }).provider?.id).toBe("claude");
    expect(chooseProvider({ providers: [p("script", "script")], active: "script" }).provider).toBeNull();
    expect(chooseProvider({ providers: [p("claude", "claude", false)], active: "claude" }).reason).toContain("isn't ready");
    expect(chooseProvider(null).provider).toBeNull();
    expect(providerLabel(p("Ollama", "local", true, true))).toBe("Ollama · m, on this PC");
    expect(providerLabel({ ...p("Claude", "claude"), model: "" })).toBe("Claude");
  });

  test("default language from the Windows locale", () => {
    expect(defaultLanguage("fr-FR")).toBe("French");
    expect(defaultLanguage("")).toBe("English");
  });
});

describe("first-run setup, press weight, Command", () => {
  test("three steps; the summary says only what was chosen", () => {
    expect(setupSteps().map((s) => s.id)).toEqual(["sources", "lyrics", "share"]);
    const off = setupSummary({ enabled: false, lyrics: false, lyricsLrclib: true, lyricsFolder: null, lastfm: false, discord: false });
    expect(off).toEqual(["Lens Music is off: turn it on at the top when you want it."]);
    const on = setupSummary({ enabled: true, lyrics: true, lyricsLrclib: false, lyricsFolder: "C:\\L", lastfm: true, discord: true });
    expect(on).toEqual(["Lens Music is on.", "Synced lyrics from your folder only.", "Scrobbling to Last.fm.", "Showing on Discord."]);
  });

  test("Command opens Immersive on exact phrases only, while Music is on", () => {
    for (const t of ["immersive", "Immersive.", "open immersive", "immersive mode", "/immersive", "start music immersive"]) expect(isImmersivePhrase(t)).toBe(true);
    for (const t of ["immersive reader", "what is immersive audio", "open spotify"]) expect(isImmersivePhrase(t)).toBe(false);
    expect(immersiveTemplates([], false)).toEqual([]);
    expect(immersiveTemplates([{ id: "immersive" }], true)).toEqual([]);
    const [t] = immersiveTemplates([], true);
    expect(isImmersiveStub(t)).toBe(true);
    expect(isImmersiveStub({ ...t })).toBe(false);
  });
});

describe("guardrails for the new music files", () => {
  const ROOT = join(import.meta.dir, "..", "..");
  test("Immersive CSS animates transform and opacity only, on tokens, with no blur or glass", () => {
    const css = readFileSync(join(ROOT, "src/music/immersive.css"), "utf8");
    expect(css).not.toMatch(/backdrop-filter|filter:\s*blur/);
    for (const m of css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)) expect(m[1]).not.toMatch(/\b(width|height|top|left|margin|font-size):/);
    for (const m of css.matchAll(/transition:\s*([^;]+);/g)) expect(m[1]).not.toMatch(/\d+ms|cubic-bezier/);
    expect(css).toContain(".lm-imm.is-still .lm-imm-layer { animation-play-state: paused; }");
  });

  test("interactive elements in Immersive carry a press weight", () => {
    const tsx = readFileSync(join(ROOT, "src/music/Immersive.tsx"), "utf8");
    const buttons = [...tsx.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(buttons.length).toBeGreaterThan(4);
    for (const b of buttons) expect(b).toMatch(/data-weight="(light|medium|heavy)"/);
  });
});

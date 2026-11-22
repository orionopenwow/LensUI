// Palette / Dock routing for AI: which queries ask ai_intent, which offer "Ask AI", which are left alone.
import { describe, expect, mock, test } from "bun:test";

mock.module("@tauri-apps/api/core", () => ({ invoke: async () => null }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

const { routeQuery, decideIntent } = await import("../ai/intent");
const { aiPaletteItems } = await import("../ai/paletteAi");

const h = { openAsk: mock(() => {}), runIntent: mock(() => {}), runQuickAction: mock(() => {}) };

describe("routeQuery", () => {
  test("explicit prefixes go straight to Ask", () => {
    expect(routeQuery("ai: why is my fan loud")).toEqual({ kind: "ask-exclusive", prompt: "why is my fan loud" });
    expect(routeQuery("/ask hello")).toEqual({ kind: "ask-exclusive", prompt: "hello" });
    expect(routeQuery("@claude hi")).toEqual({ kind: "ask-exclusive", prompt: "hi" });
  });
  test("other features' prefixes are never routed", () => {
    for (const q of ["> ipconfig", "? weather", "= 2+2"]) expect(routeQuery(q).kind).toBe("none");
  });
  test("imperatives are commands, questions are questions", () => {
    expect(routeQuery("turn on night light").kind).toBe("command");
    expect(routeQuery("mute spotify").kind).toBe("command");
    expect(routeQuery("how do I change my wallpaper").kind).toBe("question");
    expect(routeQuery("best pizza dough?").kind).toBe("question");
  });
  test("short searches stay searches", () => {
    expect(routeQuery("chrome").kind).toBe("none");
    expect(routeQuery("visual studio").kind).toBe("none");
    expect(routeQuery("").kind).toBe("none");
  });
});

describe("decideIntent", () => {
  test("confident, harmless intents are one key", () => {
    const d = decideIntent({ action: "set_night_light", args: { on: true }, confidence: 0.92, summary: "Turn on night light" });
    expect(d).toMatchObject({ show: true, confirm: false, title: "Turn on night light" });
  });
  test("unsure or risky intents need Enter twice", () => {
    expect(decideIntent({ action: "set_volume", args: {}, confidence: 0.6, summary: "x" }).confirm).toBe(true);
    expect(decideIntent({ action: "close_window", args: {}, confidence: 0.99, summary: "x" }).confirm).toBe(true);
  });
  test("weak intents are hidden", () => {
    expect(decideIntent({ action: "x", args: {}, confidence: 0.2, summary: "x" }).show).toBe(false);
    expect(decideIntent(null).show).toBe(false);
  });
});

describe("aiPaletteItems", () => {
  test("nothing when AI is off", () => {
    expect(aiPaletteItems({ query: "how do I fix this?", enabled: false, hasLocalPlan: false }, h).items).toHaveLength(0);
  });
  test("intent becomes a 'Do it' row above 'Ask AI'", () => {
    const r = aiPaletteItems(
      { query: "turn on night light", enabled: true, hasLocalPlan: false, intent: { action: "night", args: {}, confidence: 0.9, summary: "Turn on night light" } },
      h
    );
    expect(r.items.map((i) => i.badge)).toEqual(["Do it", "Ask"]);
    expect(r.items[0].confirm).toBeUndefined();
    r.items[0].run();
    expect(h.runIntent).toHaveBeenCalled();
  });
  test("Lens's own plan wins over AI for commands", () => {
    const r = aiPaletteItems(
      { query: "mute spotify", enabled: true, hasLocalPlan: true, intent: { action: "mute", args: {}, confidence: 0.99, summary: "Mute" } },
      h
    );
    expect(r.items).toHaveLength(0);
  });
  test("questions put Ask AI at the top; vaguer text at the bottom", () => {
    expect(aiPaletteItems({ query: "why is the sky blue", enabled: true, hasLocalPlan: false }, h).items[0].special).toBe("top");
    expect(aiPaletteItems({ query: "pizza dough recipe ideas", enabled: true, hasLocalPlan: false }, h).items[0].special).toBe("bottom");
  });
  test("ai: is exclusive and runs openAsk", () => {
    const r = aiPaletteItems({ query: "ai: summarise my day", enabled: true, hasLocalPlan: false }, h);
    expect(r.exclusive).toBe(true);
    r.items[0].run();
    expect(h.openAsk).toHaveBeenCalledWith("summarise my day");
  });
  test("'clipboard' lists quick actions when there's something to act on", () => {
    const r = aiPaletteItems({ query: "clipboard", enabled: true, hasLocalPlan: false, clipboardPreview: "teh quick fox" }, h);
    expect(r.items.map((i) => i.key)).toEqual(["ai-quick:explain", "ai-quick:translate", "ai-quick:fix", "ai-quick:todo"]);
  });
});

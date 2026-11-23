import { describe, expect, test } from "bun:test";
import {
  agoLabel,
  cardReducer,
  fallbackPreview,
  denyLabel,
  fromPendingAction,
  primaryLabel,
  toneOf,
  initialCard,
  lookDiff,
  lookTokens,
  needsHold,
  orderTaskList,
  pendingLabel,
  reversibilityLine,
  sessionGrantable,
  type ApprovalPreview,
  type TaskItem,
} from "../approval/model";

const base: ApprovalPreview = {
  question: "Apply 3 changes to your desktop?",
  reason: "Claude Desktop wants to change 3 settings.",
  verb: "Apply",
  kind: "look",
  details: [{ label: "Dock style", value: "floating → slim" }],
  reversible: true,
  risk: "low",
  capabilities: ["change_look"],
};

describe("card state machine", () => {
  test("hold → approve → done", () => {
    let s = initialCard();
    s = cardReducer(s, { type: "hold-start" });
    expect(s.phase).toBe("holding");
    s = cardReducer(s, { type: "hold-progress", p: 0.5 });
    expect(s.progress).toBe(0.5);
    s = cardReducer(s, { type: "hold-progress", p: 7 });
    expect(s.progress).toBe(1);
    s = cardReducer(s, { type: "approve" });
    expect(s.phase).toBe("working");
    s = cardReducer(s, { type: "result", ok: true });
    expect(s.phase).toBe("done");
  });
  test("releasing early cancels the hold", () => {
    let s = cardReducer(initialCard(), { type: "hold-start" });
    s = cardReducer(s, { type: "hold-progress", p: 0.4 });
    s = cardReducer(s, { type: "hold-cancel" });
    expect(s).toMatchObject({ phase: "pending", progress: 0 });
  });
  test("deny, failure and closed cards ignore further input", () => {
    const denied = cardReducer(initialCard(), { type: "deny" });
    expect(denied.phase).toBe("denied");
    expect(cardReducer(denied, { type: "approve" }).phase).toBe("denied");
    expect(cardReducer(denied, { type: "hold-start" }).phase).toBe("denied");
    const working = cardReducer(initialCard(), { type: "approve" });
    const failed = cardReducer(working, { type: "result", ok: false, message: "nope" });
    expect(failed).toMatchObject({ phase: "failed", message: "nope" });
    expect(cardReducer(initialCard(), { type: "result", ok: true }).phase).toBe("pending");
  });
  test("collapse toggles in any phase", () => {
    const s = cardReducer(initialCard(), { type: "toggle-collapse" });
    expect(s.collapsed).toBe(true);
    expect(cardReducer(s, { type: "toggle-collapse" }).collapsed).toBe(false);
  });
});

describe("hold to confirm", () => {
  test("risky or irreversible items hold by default", () => {
    expect(needsHold(base)).toBe(false);
    expect(needsHold({ ...base, risk: "confirm" })).toBe(true);
    expect(needsHold({ ...base, reversible: false })).toBe(true);
    expect(needsHold({ ...base, holdToConfirm: true })).toBe(true);
  });
  test("preference overrides, blocked never holds", () => {
    expect(needsHold(base, "always")).toBe(true);
    expect(needsHold({ ...base, risk: "confirm" }, "never")).toBe(false);
    expect(needsHold({ ...base, risk: "blocked" }, "always")).toBe(false);
  });
});

describe("labels", () => {
  test("pending pill", () => {
    expect(pendingLabel(0)).toBe("");
    expect(pendingLabel(1)).toBe("Approve 1 action");
    expect(pendingLabel(3)).toBe("Approve 3 actions");
  });
  test("reversibility and time", () => {
    expect(reversibilityLine(base)).toBe("Undo available");
    expect(reversibilityLine({ ...base, reversible: false })).toBe("Can't be undone");
    expect(agoLabel(1000, 3000)).toBe("just now");
    expect(agoLabel(0, 42_000)).toBe("42s ago");
    expect(agoLabel(0, 5 * 60_000)).toBe("5 min ago");
  });
});

describe("This task can", () => {
  const list: TaskItem[] = [
    { id: "read_settings", label: "Read your Lens settings", level: "allowed", used: false },
    { id: "destructive", label: "Delete files", level: "blocked", used: false },
    { id: "change_look", label: "Change the look", level: "ask", used: true },
    { id: "launch_apps", label: "Open apps", level: "ask", used: false },
    { id: "quick_settings", label: "Volume", level: "allowed", used: true },
  ];
  test("used first, then ask, allowed, blocked", () => {
    expect(orderTaskList(list).map((t) => t.id)).toEqual(["change_look", "quick_settings", "launch_apps", "read_settings", "destructive"]);
  });
  test("session grants only cover used ask-first capabilities", () => {
    expect(sessionGrantable(list)).toEqual(["change_look"]);
    expect(sessionGrantable([{ id: "destructive", label: "x", level: "ask", used: true }])).toEqual([]);
    expect(sessionGrantable(undefined)).toEqual([]);
  });
});

describe("requests and previews", () => {
  test("pending MCP actions without a preview get a cautious fallback", () => {
    const r = fromPendingAction({ id: "lens-1", tool: "run_action", text: "mute chrome.", client: "Claude Desktop", createdMs: 5 });
    expect(r.preview.question).toBe("mute chrome?");
    expect(r.preview.risk).toBe("confirm");
    expect(needsHold(r.preview)).toBe(true);
    expect(r.source).toBe("Claude Desktop");
    expect(fallbackPreview("", "").question).toBe("Do this?");
  });
  test("the preview's source label wins", () => {
    const r = fromPendingAction({ id: "x", tool: "lens_set", text: "", client: "claude-ai", createdMs: 0 }, { ...base, source: { client: "claude-ai", kind: "claude-desktop", label: "Claude Desktop" } });
    expect(r.source).toBe("Claude Desktop");
  });
  test("look tokens are scoped, clamped and follow light packs", () => {
    const dark = lookTokens({ pack: "obsidian", radius: 99, dim: 80 });
    expect(dark["--lens-radius"]).toBe("20px");
    expect(dark["--lp-dim"]).toBe("0.4");
    expect(dark["--lens-ink"]).toBe("255 255 255");
    const light = lookTokens({ pack: "alabaster-daylight" });
    expect(light["--lens-ink"]).toBe("0 0 0");
    expect(light["--lens-pack-elevated"]).toBe("#ffffff");
    const custom = lookTokens({ pack: "obsidian", accentMode: "custom", accent: "#ff8800" });
    expect(custom["--lens-accent"]).toBe("#ff8800");
    const junk = lookTokens({ pack: "nope", accentMode: "custom", accent: "red;}", surface: "url(x)" });
    expect(junk["--lens-accent"]).not.toContain(";");
    expect(junk["--lens-pack-base"]).toBe("#08080b");
  });
  test("look diff lists what changes in words", () => {
    const d = lookDiff({ pack: "obsidian", dockStyle: "floating", dim: 0 }, { pack: "nord-frost", dockStyle: "slim", dim: 20 });
    expect(d.some((x) => x.startsWith("Theme: Obsidian → "))).toBe(true);
    expect(d).toContain("Dock: floating → slim");
    expect(d).toContain("Dim inactive windows: 0 → 20 %");
  });
});

describe("typed variants", () => {
  const pay: ApprovalPreview = { ...base, kind: "payment", verb: "Pay", risk: "confirm", reversible: false, payment: { amount: "$84.00", method: "Amex ··1007" } };
  const del: ApprovalPreview = { ...base, kind: "delete", verb: "Delete", risk: "confirm", bulk: { count: 2315 } };
  const send: ApprovalPreview = { ...base, kind: "send", verb: "Send", risk: "confirm", reversible: false, send: { to: "Maya", app: "Messages", message: "hi" } };
  test("primary carries the exact verb and number", () => {
    expect(primaryLabel(del)).toBe("Delete 2,315");
    expect(primaryLabel(pay)).toBe("Pay $84.00");
    expect(primaryLabel(send)).toBe("Send");
    expect(denyLabel(send)).toBe("Don't send");
    expect(denyLabel(pay)).toBe("Deny");
  });
  test("payments always hold; messages and bin deletes are one press", () => {
    expect(needsHold(pay)).toBe(true);
    expect(needsHold(pay, "never")).toBe(true);
    expect(needsHold(send)).toBe(false);
    expect(needsHold(del)).toBe(false);
    expect(needsHold(del, "always")).toBe(true);
  });
  test("status dot", () => {
    expect(toneOf(pay)).toBe("danger");
    expect(toneOf({ ...pay, tone: "trusted" })).toBe("trusted");
    expect(toneOf(base)).toBe("trusted");
    expect(toneOf({ ...base, kind: "none", reversible: false })).toBe("danger");
  });
});

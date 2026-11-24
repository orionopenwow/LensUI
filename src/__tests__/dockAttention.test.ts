import { describe, expect, test } from "bun:test";
import { applyAttention, attentionFor, attentionKey, clearFocused } from "../dock/attention";

describe("dock attention", () => {
  test("keys: paths, names and bare names meet on the exe file name", () => {
    expect(attentionKey("C:\\Apps\\Discord\\Discord.exe")).toBe("discord.exe");
    expect(attentionKey("discord.exe")).toBe("discord.exe");
    expect(attentionKey("Discord")).toBe("discord.exe");
    expect(attentionKey("")).toBe("");
    expect(attentionKey(undefined)).toBe("");
  });

  test("start, repeat and stop", () => {
    let m = applyAttention(new Map(), { appId: "Teams.exe", active: true, hwnd: 7 }, 100);
    expect(attentionFor(m, "C:\\x\\teams.exe")?.count).toBe(1);
    expect(attentionFor(m, "teams.exe")?.since).toBe(100);
    // A second request keeps the original start (no second bounce) and records the window.
    m = applyAttention(m, { appId: "teams.exe", active: true, count: 4, hwnd: 8 }, 500);
    expect(attentionFor(m, "teams")).toEqual({ count: 4, since: 100, hwnds: [7, 8] });
    m = applyAttention(m, { appId: "TEAMS.EXE", active: false }, 900);
    expect(attentionFor(m, "teams.exe")).toBeUndefined();
  });

  test("bad payloads change nothing", () => {
    const m = applyAttention(new Map(), { appId: "", active: true }, 1);
    expect(m.size).toBe(0);
    const m2 = applyAttention(new Map(), { appId: "x.exe", active: true, count: -3 }, 1);
    expect(attentionFor(m2, "x.exe")?.count).toBe(1);
  });

  test("activating the app clears it, by process name, exe path or window", () => {
    let m = applyAttention(new Map(), { appId: "a.exe", active: true }, 1);
    m = applyAttention(m, { appId: "b.exe", active: true, hwnd: 42 }, 1);
    m = applyAttention(m, { appId: "c.exe", active: true }, 1);
    m = clearFocused(m, [{ processName: "A.exe" }]);
    expect(attentionFor(m, "a.exe")).toBeUndefined();
    m = clearFocused(m, [{ processName: "other.exe", hwnd: 42 }]);
    expect(attentionFor(m, "b.exe")).toBeUndefined();
    m = clearFocused(m, [{ exePath: "D:\\c.exe" }]);
    expect(m.size).toBe(0);
  });

  test("nothing focused that matters: the same map comes back (no re-render)", () => {
    const m = applyAttention(new Map(), { appId: "a.exe", active: true }, 1);
    expect(clearFocused(m, [{ processName: "z.exe" }])).toBe(m);
  });
});

describe("dock attention snapshots (lens://dock-attention)", () => {
  const { applySnapshot } = require("../dock/attention");
  test("a snapshot replaces the set and keeps start times", () => {
    let m = applySnapshot(new Map(), { version: 1, apps: [{ exePath: "C:\\x\\Teams.exe", processName: "Teams.exe", hwnds: [5], count: 2, sinceMs: 1 }] }, 10);
    expect(attentionFor(m, "teams.exe")).toEqual({ count: 2, since: 10, hwnds: [5] });
    m = applySnapshot(m, { apps: [{ exePath: "C:\\x\\Teams.exe", hwnds: [5, 6], count: 3 }, { processName: "slack.exe" }] }, 99);
    expect(attentionFor(m, "teams")?.since).toBe(10);
    expect(attentionFor(m, "teams")?.count).toBe(3);
    expect(attentionFor(m, "slack.exe")?.since).toBe(99);
    m = applySnapshot(m, { apps: [] }, 120);
    expect(m.size).toBe(0);
  });
  test("an unchanged snapshot hands back the same map", () => {
    const snap = { apps: [{ exePath: "a.exe", hwnds: [1], count: 1 }] };
    const m = applySnapshot(new Map(), snap, 1);
    expect(applySnapshot(m, snap, 2)).toBe(m);
  });
});

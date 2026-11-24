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

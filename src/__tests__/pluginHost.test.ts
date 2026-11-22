// The plugin bridge is the only way a sandboxed plugin reaches Lens. These tests drive it with
// a fake frame and check that every capability is gated by the manifest's permissions and,
// for apps and links, by a per-target user approval.
import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (cmd === "get_telemetry_cmd") return { cpuUsage: 12, memPercent: 40, memUsedGb: 6, memTotalGb: 16, uptimeMinutes: 5, secret: "x" };
    if (cmd === "scan_installed_apps_cmd") return [{ name: "Notepad", path: "C:\\Windows\\notepad.exe" }];
    if (cmd === "plugin_storage_get_cmd") return { theme: "dark" };
    return null;
  },
}));

// Minimal window: the bridge only needs add/removeEventListener for "message".
let listener: ((ev: { source: unknown; data: unknown }) => void) | null = null;
(globalThis as Record<string, unknown>).window = {
  addEventListener: (_: string, fn: typeof listener) => (listener = fn),
  removeEventListener: () => (listener = null),
};

const { PluginBridge, PLUGIN_CSP, PLUGIN_SANDBOX } = await import("../plugins/host");
type Permission = import("../plugins/types").PluginPermission;

function makeBridge(permissions: Permission[], grants: string[] = []) {
  const replies: Record<number, { ok: boolean; result?: unknown; error?: unknown }> = {};
  const contentWindow = { postMessage: (msg: { id?: number; ok: boolean; result?: unknown; error?: unknown }) => { if (msg.id !== undefined) replies[msg.id] = msg; } };
  const stops: string[] = [];
  const bridge = new PluginBridge({ contentWindow } as unknown as HTMLIFrameElement, {
    manifest: {
      id: "test.plugin", name: "Test", version: "1.0.0", author: "t", description: "", slot: "widgets", entry: "index.html",
      permissions, refreshIntervalMs: 1000,
    },
    grants: () => grants,
    onStop: (r) => stops.push(r),
  });
  let nextId = 1;
  const call = async (method: string, params?: unknown, source: unknown = contentWindow) => {
    const id = nextId++;
    if (!listener) return undefined; // bridge stopped itself and unsubscribed
    listener({ source, data: { __lens: 1, id, method, params } });
    for (let i = 0; i < 20 && !replies[id]; i++) await new Promise((r) => setTimeout(r, 0));
    return replies[id];
  };
  return { bridge, call, stops, replies };
}

beforeEach(() => {
  calls.length = 0;
});

describe("sandbox constants", () => {
  test("plugins get scripts only, and no network", () => {
    expect(PLUGIN_SANDBOX).toBe("allow-scripts");
    expect(PLUGIN_CSP).toContain("connect-src 'none'");
    expect(PLUGIN_CSP).toContain("default-src 'none'");
    expect(PLUGIN_CSP).not.toContain("allow-same-origin");
  });
});

describe("permission checks", () => {
  test.each([
    ["telemetry.get", {}],
    ["media.get", {}],
    ["storage.get", { key: "k" }],
    ["storage.set", { key: "k", value: "v" }],
    ["notify", { title: "hi" }],
    ["apps.launch", { name: "Notepad" }],
    ["url.open", { url: "https://example.com" }],
  ])("%s is denied without its permission and never reaches the backend", async (method, params) => {
    const { call, bridge } = makeBridge([]);
    const r = await call(method, params);
    expect(r).toMatchObject({ ok: false, error: "permission-denied" });
    expect(calls).toHaveLength(0);
    bridge.dispose();
  });

  test("granted permissions work and only expose whitelisted fields", async () => {
    const { call, bridge } = makeBridge(["telemetry", "storage"]);
    const t = await call("telemetry.get");
    expect(t.ok).toBe(true);
    expect(t.result).toEqual({ cpuUsage: 12, memPercent: 40, memUsedGb: 6, memTotalGb: 16, uptimeMinutes: 5 });
    expect((await call("storage.get", { key: "theme" })).result).toBe("dark");
    expect(calls.find((c) => c.cmd === "plugin_storage_get_cmd")?.args).toEqual({ id: "test.plugin" });
    expect(await call("storage.set", { key: "x".repeat(65), value: "v" })).toMatchObject({ ok: false, error: "bad-params" });
    bridge.dispose();
  });

  test("apps and links need a per-target approval first", async () => {
    const { call, bridge } = makeBridge(["launch-apps", "open-urls"]);
    expect(await call("apps.launch", { name: "notepad" })).toMatchObject({ ok: false, error: "approval-required" });
    expect(calls.some((c) => c.cmd === "request_plugin_approval_cmd" && c.args?.grant === "launch:C:\\Windows\\notepad.exe")).toBe(true);
    expect(calls.some((c) => c.cmd === "plugin_launch_app_cmd")).toBe(false);
    expect(await call("url.open", { url: "http://example.com" })).toMatchObject({ ok: false, error: "bad-params" });
    expect(await call("url.open", { url: "https://user:pw@example.com" })).toMatchObject({ ok: false, error: "bad-params" });
    expect(await call("url.open", { url: "https://example.com/a" })).toMatchObject({ ok: false, error: "approval-required" });
    bridge.dispose();

    const approved = makeBridge(["launch-apps", "open-urls"], ["launch:C:\\Windows\\notepad.exe", "url:https://example.com"]);
    expect(await approved.call("apps.launch", { name: "Notepad" })).toMatchObject({ ok: true });
    expect(await approved.call("url.open", { url: "https://example.com/a?b=1" })).toMatchObject({ ok: true });
    expect(calls.find((c) => c.cmd === "plugin_open_url_cmd")?.args).toEqual({ id: "test.plugin", url: "https://example.com/a?b=1" });
    approved.bridge.dispose();
  });

  test("notifications are rate limited per plugin", async () => {
    const { call, bridge } = makeBridge(["notifications"]);
    expect(await call("notify", { title: "one" })).toMatchObject({ ok: true });
    expect(await call("notify", { title: "two" })).toMatchObject({ ok: false, error: "rate-limited" });
    bridge.dispose();
  });
});

describe("message hygiene", () => {
  test("messages from another frame are ignored", async () => {
    const { call, bridge } = makeBridge(["telemetry"]);
    expect(await call("telemetry.get", {}, { postMessage() {} })).toBeUndefined();
    expect(calls).toHaveLength(0);
    bridge.dispose();
  });
  test("unknown methods and floods are answered, then the plugin is stopped", async () => {
    const { call, bridge, stops } = makeBridge([]);
    expect(await call("fs.readAll")).toMatchObject({ ok: false, error: "unknown-method" });
    let limited = 0;
    for (let i = 0; i < 120; i++) if ((await call("time.now"))?.error === "rate-limited") limited++;
    expect(limited).toBeGreaterThan(0);
    expect(stops).toEqual(["rate limit"]);
    bridge.dispose();
  });
});

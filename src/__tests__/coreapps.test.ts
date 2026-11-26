// Lens core apps: pure state machines and helpers (docs/CORE_APPS.md).
import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

mock.module("@tauri-apps/api/core", () => ({
  invoke: async () => null,
  convertFileSrc: (p: string) => p,
  transformCallback: () => 0,
}));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

import { CORE_APPS, coreAppMatches, coreAppSearchItems, coreAppTemplates, iconUrl, isCoreAppStub, pinEntry, SLASH } from "../coreapps/registry";
import { friendlyError, loadReducer, type Load } from "../coreapps/models/load";
import { cpuShare, push, slowHints, sortApps } from "../coreapps/models/monitor";
import { sortPrograms, sortStartup, startupImpact, unusedFor } from "../coreapps/models/startup";
import { STOPWATCH0, describeDays, elapsed, parseTime, progress, remainingOf, splits, stopwatch, toggleDay, tzOffsetMin } from "../coreapps/models/timer";
import { addHistory, convertCurrency, evalProgrammer, format, normalise, unitArg } from "../coreapps/models/calculator";
import { addToPalette, contrast, formats, hslToRgb, nudgeToContrast, parseHex, rgbToHsl, toHex, verdict } from "../coreapps/models/color";
import { inline, parse, searchNotes, titleOf, todoProgress, toggleTodo } from "../coreapps/models/notes";
import { healthVerdict, tips, usageSeries, wearSeries } from "../coreapps/models/power";
import { connectionSummary, filterApps, onlineApps, signalWords } from "../coreapps/models/network";
import { filterClips, groupClips } from "../coreapps/models/clipboard";
import { ago, bitsPerSec, bytes, clock, countdown, ymd } from "../coreapps/shell/format";
import type { AppGroup, ClipView, CoreMonitorSample, InstalledProgram, NetAppRow } from "../types/generated";

describe("registry", () => {
  test("mirrors the Rust registry (ids, titles, glyphs)", () => {
    const rs = readFileSync(join(import.meta.dir, "../../src-tauri/src/coreapps/mod.rs"), "utf8");
    for (const a of CORE_APPS) {
      expect(rs).toContain(`id: "${a.id}"`);
      expect(rs).toContain(`title: "${a.title}"`);
      expect(rs).toContain(`glyph: "${a.glyph}"`);
      expect(rs).toContain(`tint: ("${a.tint[0]}", "${a.tint[1]}")`);
    }
    expect((rs.match(/CoreApp \{\s+id:/g) ?? []).length).toBe(CORE_APPS.length);
  });
  test("icons, pins and launcher entries", () => {
    for (const a of CORE_APPS) {
      expect(iconUrl(a).startsWith("data:image/svg+xml,")).toBe(true);
      expect(pinEntry(a).path).toBe(`lens-app:${a.id}`);
    }
    const items = coreAppSearchItems();
    expect(items.length).toBe(CORE_APPS.length);
    expect(items.every((i) => i.kind === "app" && i.key.startsWith("lens:coreapp:"))).toBe(true);
    const mon = items.find((i) => i.key === "lens:coreapp:monitor")!;
    expect(coreAppMatches("spo", mon)).toBe(false);
    expect(coreAppMatches("mon", mon)).toBe(true);
    expect(coreAppMatches("task man", mon)).toBe(true);
    expect(coreAppMatches("spo", { key: "app:spotify", title: "Spotify" })).toBe(true);
  });
  test("slash stubs never shadow an existing command", () => {
    const stubs = coreAppTemplates([{ id: "note" }, { id: "timer" }]);
    expect(stubs.some((s) => s.id === "timer")).toBe(false);
    expect(stubs.some((s) => s.id === "monitor")).toBe(true);
    expect(stubs.every((s) => s.template === "" && isCoreAppStub(s))).toBe(true);
    expect(isCoreAppStub({ id: "monitor" })).toBe(false);
    for (const id of Object.values(SLASH)) expect(CORE_APPS.some((a) => a.id === id)).toBe(true);
  });
});

describe("load state machine", () => {
  const s0: Load<number[]> = { status: "loading", data: null, error: null };
  test("loading → ready / empty / error", () => {
    expect(loadReducer(s0, { type: "ok", data: [1] }).status).toBe("ready");
    expect(loadReducer(s0, { type: "ok", data: [], empty: true }).status).toBe("empty");
    expect(loadReducer(s0, { type: "fail", error: "Error: boom" })).toEqual({ status: "error", data: null, error: "boom" });
  });
  test("a reload keeps data on screen; a failed reload keeps the last good data", () => {
    const ready = loadReducer(s0, { type: "ok", data: [1] });
    expect(loadReducer(ready, { type: "start" })).toBe(ready);
    const failed = loadReducer(ready, { type: "fail", error: "offline" });
    expect(failed.status).toBe("ready");
    expect(failed.data).toEqual([1]);
    expect(failed.error).toBe("offline");
  });
  test("friendly errors", () => {
    expect(friendlyError("")).toBe("Something went wrong.");
    expect(friendlyError("command coreapp_x not found")).toBe("This needs the Lens desktop app.");
    expect(friendlyError("x".repeat(400)).length).toBe(218);
  });
});

describe("monitor", () => {
  const g = (name: string, cpu: number, mem: number, prot = false, pids = [1000]): AppGroup => ({ name, exe: null, pids, cpu, memoryMb: mem, diskBps: 0, protected: prot });
  const sample = (cpu: number, mem: number, apps: AppGroup[], uptime = 60): CoreMonitorSample => ({
    telemetry: { cpuUsage: cpu, memUsedGb: 8, memTotalGb: 16, memPercent: mem, uptimeMinutes: uptime },
    perf: { gpuPct: null, diskReadBps: null, diskWriteBps: null, diskBusyPct: null, netRxBps: null, netTxBps: null },
    apps,
    processCount: apps.length,
    cpuCount: 8,
    takenMs: 0,
  });
  test("history is bounded and keeps unknowns as gaps", () => {
    let h: (number | null)[] = [];
    for (let i = 0; i < 70; i++) h = push(h, i);
    expect(h.length).toBe(60);
    expect(h[0]).toBe(10);
    expect(push([], undefined)).toEqual([null]);
  });
  test("hints in plain English, worst first, never blaming protected processes", () => {
    const apps = [g("svchost", 400, 100, true), g("chrome", 300, 6000), g("code", 50, 900)];
    const hints = slowHints(sample(95, 93, apps), Array(10).fill(95));
    expect(hints[0].tone).toBe("bad");
    expect(hints.find((h) => h.id === "cpu")?.app).toBe("chrome");
    expect(hints.find((h) => h.id === "mem")?.body).toContain("5.9 GB");
    expect(hints.some((h) => h.app === "svchost")).toBe(false);
    const ok = slowHints(sample(5, 30, apps), Array(10).fill(5));
    expect(ok).toEqual([expect.objectContaining({ id: "ok", tone: "ok" })]);
    expect(slowHints(sample(5, 30, apps, 9 * 1440), [5]).some((h) => h.id === "uptime")).toBe(true);
  });
  test("sorting and search; CPU as a share of the PC", () => {
    const apps = [g("b", 1, 500), g("a", 9, 100, false, [42])];
    expect(sortApps(apps, "cpu").map((a) => a.name)).toEqual(["a", "b"]);
    expect(sortApps(apps, "memory").map((a) => a.name)).toEqual(["b", "a"]);
    expect(sortApps(apps, "name", "42").map((a) => a.name)).toEqual(["a"]);
    expect(cpuShare(400, 8)).toBe(50);
    expect(cpuShare(4000, 8)).toBe(100);
  });
});

describe("startup & uninstall", () => {
  test("impact estimates", () => {
    expect(startupImpact({ name: "OneDrive", command: '"C:\\OneDrive.exe"' }).impact).toBe("high");
    expect(startupImpact({ name: "OneDrive", command: '"C:\\OneDrive.exe" /background' }).impact).toBe("medium");
    expect(startupImpact({ name: "SecurityHealth", command: "C:\\Windows\\SecurityHealthSystray.exe" }).impact).toBe("low");
    expect(startupImpact({ name: "Acme Updater", command: "C:\\acme\\update.exe" }).impact).toBe("medium");
    const sorted = sortStartup([
      { name: "Z", command: "z.exe --minimized", enabled: true },
      { name: "Teams", command: "teams.exe", enabled: true },
      { name: "Off", command: "spotify.exe", enabled: false },
    ]);
    expect(sorted.map((s) => s.name)).toEqual(["Teams", "Z", "Off"]);
  });
  const prog = (name: string, sizeKb: number | null, lastUsedMs: number | null): InstalledProgram => ({
    key: name, name, publisher: "P", version: "1", installLocation: "", sizeKb, installDate: "", uninstallString: "", canUninstall: true, blockedReason: null, lastUsedMs, perUser: false,
  });
  test("program sorting and the unused filter", () => {
    const list = [prog("b", 10, 5_000), prog("a", null, null), prog("c", 99, 1_000)];
    expect(sortPrograms(list, "name").map((p) => p.name)).toEqual(["a", "b", "c"]);
    expect(sortPrograms(list, "size").map((p) => p.name)).toEqual(["c", "b", "a"]);
    expect(sortPrograms(list, "lastUsed").map((p) => p.name)).toEqual(["a", "c", "b"]);
    expect(sortPrograms(list, "name", "C").map((p) => p.name)).toEqual(["c"]);
    expect(unusedFor(list, 1, 1_000 + 2 * 86_400_000).map((p) => p.name)).toEqual(["b", "c"]);
  });
});

describe("timer", () => {
  test("stopwatch: start, lap, stop, resume, reset", () => {
    let s = stopwatch(STOPWATCH0, { type: "start", now: 1000 });
    s = stopwatch(s, { type: "lap", now: 3000 });
    s = stopwatch(s, { type: "lap", now: 4000 });
    expect(elapsed(s, 5000)).toBe(4000);
    s = stopwatch(s, { type: "stop", now: 6000 });
    expect(elapsed(s, 99_999)).toBe(5000);
    expect(stopwatch(s, { type: "lap", now: 7000 })).toBe(s);
    s = stopwatch(s, { type: "start", now: 10_000 });
    expect(elapsed(s, 11_000)).toBe(6000);
    expect(stopwatch(s, { type: "reset" })).toBe(s);
    s = stopwatch(stopwatch(s, { type: "stop", now: 12_000 }), { type: "reset" });
    expect(s).toEqual(STOPWATCH0);
  });
  test("lap splits mark fastest and slowest", () => {
    const sp = splits([2000, 3000, 6000]);
    expect(sp.map((l) => l.split)).toEqual([2000, 1000, 3000]);
    expect(sp[1].best && sp[2].worst).toBe(true);
    expect(splits([5000])[0].best).toBe(false);
  });
  test("alarm times and days", () => {
    expect(parseTime("7:30")).toEqual([7, 30]);
    expect(parseTime("7:30 pm")).toEqual([19, 30]);
    expect(parseTime("12am")).toEqual([0, 0]);
    expect(parseTime("12pm")).toEqual([12, 0]);
    expect(parseTime("0730")).toEqual([7, 30]);
    expect(parseTime("19.05")).toEqual([19, 5]);
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("13pm")).toBeNull();
    expect(parseTime("7:61")).toBeNull();
    expect(describeDays(0)).toBe("Once");
    expect(describeDays(0x7f)).toBe("Every day");
    expect(describeDays(0b0011111)).toBe("Weekdays");
    expect(describeDays(0b1100000)).toBe("Weekends");
    expect(describeDays(toggleDay(toggleDay(0, 0), 2))).toBe("Mon, Wed");
    expect(typeof tzOffsetMin()).toBe("number");
  });
  test("remaining time and progress", () => {
    expect(remainingOf({ endsAtMs: 10_000, remainingMs: 0, done: false }, 4_000)).toBe(6_000);
    expect(remainingOf({ endsAtMs: null, remainingMs: 3_000, done: false }, 4_000)).toBe(3_000);
    expect(remainingOf({ endsAtMs: 10_000, remainingMs: 0, done: true }, 4_000)).toBe(0);
    expect(progress(10_000, 2_500)).toBe(0.75);
    expect(progress(0, 5)).toBe(0);
  });
});

describe("calculator", () => {
  test("history dedupes and caps", () => {
    let h = addHistory([], { expr: "1+1", result: "2", at: 1 });
    h = addHistory(h, { expr: "1+1", result: "2", at: 2 });
    expect(h.length).toBe(1);
    for (let i = 0; i < 150; i++) h = addHistory(h, { expr: `${i}`, result: `${i}`, at: i });
    expect(h.length).toBe(100);
    expect(addHistory(h, { expr: " ", result: "", at: 0 })).toBe(h);
  });
  test("normalises keypad symbols and thousands separators", () => {
    expect(normalise("1,299 × 3 ÷ 2 − 1")).toBe("1299 * 3 / 2 - 1");
    expect(unitArg("°C")).toBe("c");
    expect(unitArg("km/h")).toBe("kmh");
    expect(unitArg("MB")).toBe("mb");
  });
  test("currency maths only with rates", () => {
    const rates = { EUR: 0.9, GBP: 0.8 };
    expect(convertCurrency(100, "USD", "EUR", "USD", rates)).toBeCloseTo(90);
    expect(convertCurrency(90, "EUR", "GBP", "USD", rates)).toBeCloseTo(80);
    expect(convertCurrency(1, "USD", "JPY", "USD", rates)).toBeNull();
  });
  test("programmer mode", () => {
    expect(evalProgrammer("0xFF & 0b1010 << 2", 10)).toBe(40n);
    expect(evalProgrammer("FF + 1", 16)).toBe(256n);
    expect(evalProgrammer("1010 | 0101", 2)).toBe(15n);
    expect(evalProgrammer("(2 + 3) * 4", 10)).toBe(20n);
    expect(evalProgrammer("-1", 10, 8)).toBe(-1n);
    expect(format(-1n, 16, 8)).toBe("FF");
    expect(format(255n, 2, 16)).toBe("0000 0000 1111 1111");
    expect(format(255n, 16, 32)).toBe("0000 00FF");
    expect(format(10n, 8, 32)).toBe("12");
    expect(evalProgrammer("127 + 1", 10, 8)).toBe(-128n);
    expect(evalProgrammer("~0", 10, 32)).toBe(-1n);
    expect(evalProgrammer("1 / 0", 10)).toBeNull();
    expect(evalProgrammer("12", 2)).toBeNull();
    expect(evalProgrammer("1 +", 10)).toBeNull();
    expect(evalProgrammer("", 10)).toBeNull();
  });
});

describe("color", () => {
  test("hex round trip and conversions", () => {
    expect(parseHex("#7c5cff")).toEqual([124, 92, 255]);
    expect(parseHex("abc")).toEqual([170, 187, 204]);
    expect(parseHex("nope")).toBeNull();
    expect(toHex([9, 9, 11])).toBe("#09090B");
    const [h, s, l] = rgbToHsl([124, 92, 255]);
    expect(toHex(hslToRgb(h, s, l))).toBe("#7C5CFF");
    expect(formats("#000000")[1].value).toBe("rgb(0, 0, 0)");
  });
  test("WCAG contrast matches the Rust checker", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    const v = verdict([0x76, 0x76, 0x76], [255, 255, 255]);
    expect(v.ratio).toBe(4.54);
    expect(v.aaNormal && !v.aaaNormal).toBe(true);
    expect(verdict([0x77, 0x77, 0x77], [255, 255, 255]).aaNormal).toBe(false);
  });
  test("fix suggestions reach the target", () => {
    const fixed = nudgeToContrast([0x77, 0x77, 0x77], [255, 255, 255], 4.5)!;
    expect(contrast(fixed, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    expect(nudgeToContrast([0, 0, 0], [255, 255, 255])).toEqual([0, 0, 0]);
  });
  test("palette: newest first, no duplicates, capped", () => {
    let p: string[] = [];
    p = addToPalette(p, "#111111");
    p = addToPalette(p, "#222222");
    p = addToPalette(p, "#111111");
    expect(p).toEqual(["#111111", "#222222"]);
    for (let i = 0; i < 40; i++) p = addToPalette(p, `#${String(i).padStart(6, "0")}`);
    expect(p.length).toBe(24);
    expect(addToPalette(p, "zz")).toBe(p);
  });
});

describe("notes", () => {
  const text = "# List\n\n- [ ] one\n- [x] **two**\n- plain\nSee https://x.test and `code`";
  test("markdown-lite blocks, never HTML", () => {
    const b = parse(text);
    expect(b.map((x) => x.t)).toEqual(["h", "gap", "todo", "todo", "li", "p"]);
    expect(inline("**b** *i* `c` <script>")).toEqual([
      { t: "b", v: "b" },
      { t: "text", v: " " },
      { t: "i", v: "i" },
      { t: "text", v: " " },
      { t: "code", v: "c" },
      { t: "text", v: " <script>" },
    ]);
    expect(inline("go https://a.b/c now")[1]).toEqual({ t: "link", v: "https://a.b/c", href: "https://a.b/c" });
  });
  test("to-dos toggle in place", () => {
    const t = toggleTodo(text, 2);
    expect(t.split("\n")[2]).toBe("- [x] one");
    expect(toggleTodo(t, 3).split("\n")[3]).toBe("- [ ] **two**");
    expect(toggleTodo(text, 99)).toBe(text);
    expect(todoProgress(text)).toEqual({ done: 1, total: 2 });
  });
  test("titles and search", () => {
    expect(titleOf("# **Hello** world\nmore")).toBe("Hello world");
    expect(titleOf("\n- [ ] Buy milk")).toBe("Buy milk");
    expect(titleOf("")).toBe("Untitled");
    const notes = [
      { id: "1", title: "A", text: "apples", pinned: false, updated_ms: 2, tags: [] },
      { id: "2", title: "B", text: "bananas", pinned: true, updated_ms: 1, tags: [] },
    ];
    expect(searchNotes(notes, "").map((n) => n.id)).toEqual(["2", "1"]);
    expect(searchNotes(notes, "APPLE").map((n) => n.id)).toEqual(["1"]);
  });
});

describe("power", () => {
  test("health in plain English", () => {
    expect(healthVerdict(95).tone).toBe("ok");
    expect(healthVerdict(70).tone).toBe("warn");
    expect(healthVerdict(50).tone).toBe("bad");
    expect(healthVerdict(null).tone).toBe("warn");
  });
  test("series and tips", () => {
    const r = {
      computer: "",
      scanTime: "",
      batteries: [],
      usage: [
        { localTime: "t1", ac: false, chargeMwh: 1, fullMwh: 2, percent: 50 },
        { localTime: "t2", ac: true, chargeMwh: 0, fullMwh: 0, percent: null },
      ],
      capacityHistory: [{ start: "a", end: "b", fullMwh: 45, designMwh: 50, cycles: null }],
    };
    expect(usageSeries(r)).toEqual([{ t: "t1", pct: 50, ac: false }]);
    expect(wearSeries(r)).toEqual([{ t: "b", pct: 90 }]);
    const b = { hasBattery: true, percent: 15, charging: false, pluggedIn: false, secondsLeft: null, batterySaver: false, powerMode: "performance", powerModeSupported: true };
    const t = tips(b, 70);
    expect(t.some((x) => x.includes("Best performance"))).toBe(true);
    expect(t.some((x) => x.includes("Battery saver"))).toBe(true);
    expect(tips({ ...b, hasBattery: false }, null).length).toBe(1);
  });
});

describe("network", () => {
  const row = (name: string, internet: number, local = 0): NetAppRow => ({ name, pids: [1], exe: null, internet, local, listening: [], peers: internet ? ["1.2.3.4:443"] : [] });
  test("summary and filters", () => {
    expect(signalWords(90)).toBe("Excellent");
    expect(signalWords(30)).toBe("Weak");
    const wifi = { available: true, reason: "", radioOn: true, adapter: "x", connectedSsid: "Home", networks: [{ ssid: "Home", signal: 30, bars: 1, secured: true, connected: true, hasProfile: true }] };
    expect(connectionSummary(wifi, true)).toEqual({ headline: "Home", sub: "Wi-Fi · Weak signal", tone: "warn" });
    expect(connectionSummary(null, true).headline).toBe("Wired");
    expect(connectionSummary({ ...wifi, connectedSsid: null, radioOn: false }, false).sub).toBe("Wi-Fi is turned off");
    const rows = [row("a", 0, 2), row("b", 3), row("c", 7)];
    expect(onlineApps(rows).map((r) => r.name)).toEqual(["c", "b"]);
    expect(filterApps(rows, "", true).map((r) => r.name)).toEqual(["b", "c"]);
    expect(filterApps(rows, "1.2.3", false).map((r) => r.name)).toEqual(["b", "c"]);
  });
});

describe("clipboard", () => {
  const clip = (id: number, ts: number, kind: ClipView["kind"] = "text", pinned = false): ClipView => ({
    id, kind, preview: `c${id}`, chars: 2, hasHtml: false, fileCount: 0, thumbPng: null, imageSize: null, sourceApp: null, url: null, title: null, tsMs: ts, pinned, localOnly: false,
  });
  test("filters and day groups", () => {
    const now = new Date(2026, 10, 23, 15).getTime();
    const day = 86_400_000;
    const list = [clip(1, now - 60_000), clip(2, now - day, "link"), clip(3, now - 3 * day), clip(4, now - 30 * day, "text", true), clip(5, now - 40 * day)];
    expect(filterClips(list, "pinned").map((c) => c.id)).toEqual([4]);
    expect(filterClips(list, "link").map((c) => c.id)).toEqual([2]);
    expect(groupClips(list, now).map((g) => [g.label, g.items.map((c) => c.id)])).toEqual([
      ["Pinned", [4]],
      ["Today", [1]],
      ["Yesterday", [2]],
      ["Earlier this week", [3]],
      ["Older", [5]],
    ]);
  });
});

describe("format", () => {
  test("numbers and times", () => {
    expect(bytes(0)).toBe("0 B");
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(5 * 1024 ** 3)).toBe("5.0 GB");
    expect(bytes(null)).toBe("—");
    expect(bitsPerSec(1_500_000)).toBe("12 Mbps");
    expect(bitsPerSec(100)).toBe("800 bps");
    expect(clock(754_000)).toBe("12:34");
    expect(clock(3_723_400, true)).toBe("1:02:03.4");
    expect(countdown(1)).toBe("0:01");
    expect(countdown(-5)).toBe("0:00");
    expect(ago(1000, 1000 + 30_000)).toBe("just now");
    expect(ago(1000, 1000 + 5 * 60_000)).toBe("5 min ago");
    expect(ago(0)).toBe("—");
    expect(ymd("20260902")).not.toBe("—");
    expect(ymd("bad")).toBe("—");
  });
});

describe("Monitor: copy a process line", () => {
  test("name, PID, usage and path on one line", async () => {
    const { processLine } = await import("../coreapps/models/monitor");
    expect(processLine({ name: "chrome", pids: [4120], cpu: 12.34, memMb: 812.6, path: "C:\\Program Files\\Google\\Chrome\\chrome.exe" })).toBe(
      "chrome · PID 4120 · CPU 12.3% · RAM 813 MB · C:\\Program Files\\Google\\Chrome\\chrome.exe"
    );
    expect(processLine({ name: "idle", pids: [4] })).toBe("idle · PID 4");
    const many = processLine({ name: "msedge", pids: Array.from({ length: 30 }, (_, i) => i + 1), path: null });
    expect(many).toBe("msedge · PID 1, 2, 3, 4, 5, 6, 7, 8, … (30 processes)");
  });
});

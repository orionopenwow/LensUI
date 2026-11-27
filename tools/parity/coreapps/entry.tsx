// Renders one Lens core app with sample data for screenshots: ?app=…&scene=…&preset=…
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/themes/shapes/expressive.css";
import "../../../src/coreapps/shell/shell.css";
import "../../../src/coreapps/apps/apps.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { Monitor } from "../../../src/coreapps/apps/Monitor";
import { StartupUninstall } from "../../../src/coreapps/apps/StartupUninstall";
import { Timer } from "../../../src/coreapps/apps/Timer";
import { Calculator } from "../../../src/coreapps/apps/Calculator";
import { Color } from "../../../src/coreapps/apps/Color";
import { Notes, Sticky } from "../../../src/coreapps/apps/Notes";
import { Power } from "../../../src/coreapps/apps/Power";
import { Network } from "../../../src/coreapps/apps/Network";
import { Clipboard } from "../../../src/coreapps/apps/Clipboard";
import type { AppGroup, CoreMonitorSample, TimerItem } from "../../../src/types/generated";

const p = new URLSearchParams(location.search);
const app = p.get("app") || "monitor";
const scene = p.get("scene") || "home";
const NOW = Date.UTC(2026, 10, 23, 16, 4, 0);
const wave = (n: number, base: number, amp: number, seed = 1) => Array.from({ length: n }, (_, i) => Math.max(0, base + amp * Math.sin(i / 4 + seed) + amp * 0.4 * Math.sin(i * 1.7 + seed * 3)));

const g = (name: string, pids: number[], cpu: number, mem: number, disk = 0, prot = false, exe: string | null = null): AppGroup => ({ name, exe, pids, cpu, memoryMb: mem, diskBps: disk, protected: prot });
const sample: CoreMonitorSample = {
  telemetry: { cpuUsage: 67, memUsedGb: 13.4, memTotalGb: 16, memPercent: 84, uptimeMinutes: 9 * 1440 + 220 },
  perf: { gpuPct: 31, diskReadBps: 18_400_000, diskWriteBps: 4_200_000, diskBusyPct: 22, netRxBps: 1_450_000, netTxBps: 120_000 },
  apps: [
    g("chrome", Array.from({ length: 31 }, (_, i) => 4100 + i), 182, 3650, 820_000),
    g("Code", [5120, 5121, 5122, 5124], 96, 1420, 120_000),
    g("Teams", [6200, 6201], 48, 910),
    g("OneDrive", [7720], 22, 140, 2_400_000),
    g("Spotify", [8010, 8011], 9, 310),
    g("svchost", [1012, 1300, 1460], 14, 260, 40_000, true),
    g("dwm", [1180], 11, 180, 0, true),
    g("explorer", [5004], 4, 160, 0, true),
    g("Discord", [9200, 9201, 9202], 3, 420),
    g("lens-ui", [3100], 2, 120, 0, true),
  ],
  processCount: 248,
  cpuCount: 16,
  takenMs: NOW,
};
const monHist = { cpu: wave(60, 64, 14, 1), mem: wave(60, 82, 2, 2), gpu: wave(60, 28, 10, 3), disk: wave(60, 15e6, 9e6, 4), net: wave(60, 1.2e6, 9e5, 5) };

const timerItem = (o: Partial<TimerItem>): TimerItem => ({
  id: 1, kind: "timer", label: "Timer", durationMs: 600_000, endsAtMs: null, remainingMs: 0, paused: false, done: false,
  hour: 0, minute: 0, weekdays: 0, tzOffsetMin: 0, phase: null, round: 0, pomodoro: null, ...o,
});
const timers: TimerItem[] = [
  timerItem({ id: 1, label: "Pasta", durationMs: 600_000, endsAtMs: NOW + 434_000 }),
  timerItem({ id: 2, label: "Tea", durationMs: 240_000, endsAtMs: null, remainingMs: 95_000, paused: true }),
  timerItem({ id: 3, label: "Stretch", durationMs: 300_000, done: true }),
  timerItem({ id: 4, kind: "alarm", label: "Stand-up", hour: 9, minute: 30, weekdays: 0b0011111, endsAtMs: NOW + 17 * 3600_000 }),
  timerItem({ id: 5, kind: "pomodoro", label: "Focus", durationMs: 25 * 60_000, endsAtMs: NOW + 14 * 60_000 + 12_000, phase: "focus", round: 2, pomodoro: { focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4, dnd: true } }),
];

function Scene() {
  const { config, updateConfig } = useLensState();
  const props = { config, updateConfig };
  switch (app) {
    case "monitor":
      return <Monitor {...props} demo={{ sample, hist: monHist }} />;
    case "startup":
      return (
        <StartupUninstall
          {...props}
          initialView={scene}
          demo={{
            startup: [
              { name: "Microsoft Teams", command: '"C:\\Users\\a\\AppData\\Local\\Microsoft\\Teams\\Update.exe" --processStart Teams.exe', enabled: true },
              { name: "OneDrive", command: '"C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe" /background', enabled: true },
              { name: "Spotify", command: '"C:\\Users\\a\\AppData\\Roaming\\Spotify\\Spotify.exe"', enabled: true },
              { name: "Steam", command: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', enabled: false },
              { name: "SecurityHealth", command: "C:\\Windows\\system32\\SecurityHealthSystray.exe", enabled: true },
              { name: "Logi Options+", command: '"C:\\Program Files\\LogiOptionsPlus\\logioptionsplus_agent.exe" --minimized', enabled: true },
            ],
            programs: [
              { key: "HKLM\\a", name: "Blender 5.1", publisher: "Blender Foundation", version: "5.1.0", installLocation: "C:\\Program Files\\Blender Foundation\\Blender 5.1\\", sizeKb: 1_310_000, installDate: "20260902", uninstallString: "MsiExec.exe /X{8A1B2C3D-1111-2222-3333-444455556666}", canUninstall: true, blockedReason: null, lastUsedMs: NOW - 2 * 86_400_000, perUser: false },
              { key: "HKLM\\b", name: "Krita (x64) 5.3.4", publisher: "Krita Foundation", version: "5.3.4", installLocation: "C:\\Program Files\\Krita (x64)", sizeKb: 640_000, installDate: "20260410", uninstallString: '"C:\\Program Files\\Krita (x64)\\uninstall.exe"', canUninstall: true, blockedReason: null, lastUsedMs: NOW - 140 * 86_400_000, perUser: false },
              { key: "HKCU\\c", name: "Discord", publisher: "Discord Inc.", version: "1.0.9172", installLocation: "", sizeKb: 98_000, installDate: "20250114", uninstallString: "C:\\Users\\a\\AppData\\Local\\Discord\\Update.exe --uninstall", canUninstall: true, blockedReason: null, lastUsedMs: NOW - 3600_000, perUser: true },
              { key: "HKLM\\d", name: "Old Toolbar Helper", publisher: "Unknown", version: "2.1", installLocation: "C:\\Program Files\\OTH", sizeKb: 12_000, installDate: "20190301", uninstallString: "rundll32.exe C:\\Windows\\oth.dll,Remove", canUninstall: false, blockedReason: "The uninstall command starts rundll32.exe, which isn't the app's own uninstaller.", lastUsedMs: null, perUser: false },
              { key: "HKLM\\e", name: "Notepad++ (64-bit x64)", publisher: "Notepad++ Team", version: "8.7.1", installLocation: "C:\\Program Files\\Notepad++", sizeKb: 15_600, installDate: "20260611", uninstallString: "C:\\Program Files\\Notepad++\\uninstall.exe", canUninstall: true, blockedReason: null, lastUsedMs: NOW - 9 * 86_400_000, perUser: false },
              { key: "HKLM\\f", name: "Steam", publisher: "Valve Corporation", version: "2.10.91.91", installLocation: "C:\\Program Files (x86)\\Steam", sizeKb: 420_000, installDate: "20230520", uninstallString: "C:\\Program Files (x86)\\Steam\\uninstall.exe", canUninstall: true, blockedReason: null, lastUsedMs: NOW - 200 * 86_400_000, perUser: false },
            ],
            leftovers: [],
          }}
        />
      );
    case "timer":
      return <Timer {...props} initialView={scene} demo={{ items: timers, now: NOW }} />;
    case "calculator":
      return scene === "programmer" ? (
        <Calculator {...props} demo={{ view: "programmer" }} />
      ) : (
        <Calculator
          {...props}
          demo={{
            expr: "12% of 340 + 18",
            answer: { kind: "math", value: 58.8, text: "58.8", summary: "12% of 340 + 18 = 58.8" },
            history: [
              { expr: "5 km in mi", result: "3.106856", at: NOW - 60_000 },
              { expr: "(1299 - 1099) / 1099 * 100", result: "18.198362", at: NOW - 600_000 },
              { expr: "2^16", result: "65,536", at: NOW - 3600_000 },
              { expr: "72 f to c", result: "22.222222", at: NOW - 86_400_000 },
            ],
          }}
        />
      );
    case "color":
      return (
        <Color
          {...props}
          demo={{
            current: "#7C5CFF",
            fg: "#7C5CFF",
            bg: "#09090B",
            palette: ["#7C5CFF", "#22C55E", "#F97316", "#0EA5E9", "#F43F5E", "#FAFAFA", "#18181B", "#EAB308"],
            sample: { x: 1288, y: 640, hex: "#7C5CFF", clicked: false, grid: Array.from({ length: 81 }, (_, i) => (Math.abs((i % 9) - 4) + Math.abs(Math.floor(i / 9) - 4) < 3 ? "#7C5CFF" : (i % 9) + Math.floor(i / 9) > 9 ? "#1F1B3A" : "#3B2F80")) },
          }}
        />
      );
    case "notes": {
      const notes = [
        { id: "s1", title: "Launch checklist", text: "# Launch checklist\n\n- [x] Screenshots in obsidian and daylight\n- [x] **CI green**\n- [ ] Write the release notes\n- [ ] Tag `v0.3.0`\n\nShip notes go to https://lens.example/notes", pinned: true, updated_ms: NOW - 300_000, tags: ["lens-note"] },
        { id: "s2", title: "Ideas", text: "# Ideas\n\n- Peek: preview any file with Space\n- Fonts browser\n- *Display arranger* for three monitors", pinned: false, updated_ms: NOW - 86_400_000, tags: ["lens-note"] },
        { id: "s3", title: "Groceries", text: "# Groceries\n\n- [ ] Oat milk\n- [ ] Coffee beans\n- [x] Lemons", pinned: false, updated_ms: NOW - 3 * 86_400_000, tags: ["lens-note"] },
      ];
      if (scene === "sticky") return <Sticky noteId="s1" demo={notes[0]} />;
      return <Notes {...props} demo={{ notes, selected: "s1", remindLine: scene === "remind" ? 4 : undefined, packs: [{ id: "default", name: "Default", created_ms: 0, item_count: 4, approx_tokens: 900 }] }} />;
    }
    case "power":
      return (
        <Power
          {...props}
          demo={{
            status: { hasBattery: true, percent: 76, charging: false, pluggedIn: false, secondsLeft: 3 * 3600 + 1240, batterySaver: false, powerMode: "balanced", powerModeSupported: true },
            report: {
              computer: "LENS-LAPTOP",
              scanTime: "2026-11-23T16:02:00",
              batteries: [{ id: "5B10W51867", manufacturer: "SMP", chemistry: "LiP", designMwh: 57000, fullMwh: 49590, cycles: 214, healthPct: 87 }],
              usage: Array.from({ length: 40 }, (_, i) => {
                const ac = i % 13 > 9;
                const pct = ac ? 40 + (i % 13 - 9) * 18 : 98 - (i % 13) * 6;
                return { localTime: `2026-11-2${Math.floor(i / 14)}T${String(8 + (i % 14)).padStart(2, "0")}:00:00`, ac, chargeMwh: Math.round(49590 * pct / 100), fullMwh: 49590, percent: Math.min(100, pct) };
              }),
              capacityHistory: [55200, 54400, 53500, 52100, 51000, 50300, 49590].map((f, i) => ({ start: `2026-0${5 + i}-01`, end: `2026-0${5 + i}-28`, fullMwh: f, designMwh: 57000, cycles: 30 * i || null })),
            },
          }}
        />
      );
    case "network":
      return (
        <Network
          {...props}
          demo={{
            wifi: { available: true, reason: "", radioOn: true, adapter: "Intel(R) Wi-Fi 6E AX211 160MHz", connectedSsid: "Lens Studio 5G", networks: [{ ssid: "Lens Studio 5G", signal: 84, bars: 4, secured: true, connected: true, hasProfile: true }, { ssid: "Neighbour", signal: 40, bars: 2, secured: true, connected: false, hasProfile: false }, { ssid: "Cafe Guest", signal: 22, bars: 1, secured: false, connected: false, hasProfile: false }] },
            snap: {
              apps: [
                { name: "chrome", pids: [4100, 4102, 4107], exe: null, internet: 23, local: 2, listening: [], peers: ["142.250.187.206:443", "140.82.112.25:443", "151.101.1.69:443"] },
                { name: "Teams", pids: [6200], exe: null, internet: 6, local: 0, listening: [], peers: ["52.113.194.132:443", "52.112.0.1:443"] },
                { name: "OneDrive", pids: [7720], exe: null, internet: 3, local: 0, listening: [], peers: ["13.107.42.12:443"] },
                { name: "Spotify", pids: [8010], exe: null, internet: 2, local: 1, listening: [57621], peers: ["35.186.224.25:443"] },
                { name: "Code", pids: [5120], exe: null, internet: 1, local: 0, listening: [], peers: ["[2606:4700::6810:84e5]:443"] },
                { name: "svchost", pids: [1012, 1300], exe: null, internet: 0, local: 3, listening: [135, 5040], peers: [] },
              ],
              totalConnections: 142,
              internetConnections: 35,
              localIpv4: "192.168.1.23",
              localIpv6: "2a01:4b00:84e1:7600:1d3c:9f2e:5a10:1b77",
              takenMs: NOW,
            },
            endpoints: [
              { id: "cloudflare", label: "Cloudflare", host: "speed.cloudflare.com" },
              { id: "hetzner", label: "Hetzner (Germany)", host: "fsn1-speed.hetzner.com" },
            ],
          }}
        />
      );
    case "clipboard":
      return (
        <Clipboard
          {...props}
          demo={{
            now: NOW,
            status: { enabled: true, pausedUntilMs: 0, ignoreNext: false, count: 6, pinned: 1, settings: { enabled: true, maxItems: 500, maxDays: 30, maxTotalBytes: 50_000_000, maxItemBytes: 2_000_000, excludedApps: [] } as never },
            clips: [
              { id: 6, kind: "text", preview: "git -c push.negotiate=true push -u origin feature/core-apps", chars: 58, hasHtml: false, fileCount: 0, thumbPng: null, imageSize: null, sourceApp: "Windows Terminal", url: null, title: null, tsMs: NOW - 120_000, pinned: false, localOnly: false },
              { id: 5, kind: "link", preview: "https://github.com/orionopenwow/lensui/pulls", chars: 44, hasHtml: false, fileCount: 0, thumbPng: null, imageSize: null, sourceApp: "Google Chrome", url: "https://github.com/orionopenwow/lensui/pulls", title: "Pull requests · lensui", tsMs: NOW - 900_000, pinned: false, localOnly: false },
              { id: 4, kind: "text", preview: "Lens Monitor shows what's slowing your PC in plain English.", chars: 59, hasHtml: true, fileCount: 0, thumbPng: null, imageSize: null, sourceApp: "Lens Notes", url: null, title: null, tsMs: NOW - 3 * 3600_000, pinned: false, localOnly: false },
              { id: 3, kind: "files", preview: "core-apps-contact-sheet.png", chars: 0, hasHtml: false, fileCount: 1, thumbPng: null, imageSize: null, sourceApp: "File Explorer", url: null, title: null, tsMs: NOW - 26 * 3600_000, pinned: false, localOnly: false },
              { id: 2, kind: "text", preview: "#7C5CFF", chars: 7, hasHtml: false, fileCount: 0, thumbPng: null, imageSize: null, sourceApp: "Lens Color", url: null, title: null, tsMs: NOW - 3 * 86_400_000, pinned: false, localOnly: true },
              { id: 1, kind: "text", preview: "Thanks! Talk Thursday at 10.", chars: 28, hasHtml: false, fileCount: 0, thumbPng: null, imageSize: null, sourceApp: "Outlook", url: null, title: "Reply template", tsMs: NOW - 20 * 86_400_000, pinned: true, localOnly: false },
            ],
          }}
        />
      );
  }
  return <div>Unknown app {app}</div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Scene />);

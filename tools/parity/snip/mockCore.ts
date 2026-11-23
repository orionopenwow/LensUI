// Parity mock for Lens Snip: the base harness mock plus the snip_* and ai_status commands.
import { invoke as baseInvoke } from "../mock/core";
export { convertFileSrc, isTauri } from "../mock/core";

const now = Date.now();
const settings = {
  enabled: true, hotkey: "Ctrl+Shift+S", printScreen: true, defaultMode: "region", delaySeconds: 0, includeCursor: false, afterCapture: "studio",
  saveDir: "", filenameTemplate: "Lens Snip {date} at {time}", autoRedact: true, ocrLanguage: "auto", beautify: "none", pinOpacity: 1,
  pinClickThrough: false, recordFps: 30, recordFormat: "mp4", recordQuality: "balanced", recordMic: "", recordClickHighlight: true,
  historyEnabled: true, historyDays: 30, historyMax: 500, historyMaxMb: 1024, showRecent: true,
};

const extra: Record<string, (a: any) => unknown> = {
  snip_status: () => ({ settings, ocrLanguages: ["en-US", "de-DE"], canRecord: true, hotkeyOk: true, printScreenOwned: true, message: "", recording: false }),
  snip_recent: () => [
    { id: "claude-desktop", kind: "claude", label: "Claude", exe: null, lastMs: now, count: 9 },
    { id: "app:discord.exe", kind: "app", label: "Discord", exe: "C:\\Users\\u\\AppData\\Local\\Discord\\Discord.exe", lastMs: now - 60_000, count: 4 },
    { id: "share", kind: "share", label: "Share…", exe: null, lastMs: now - 3_600_000, count: 2 },
    { id: "app:slack.exe", kind: "app", label: "Slack", exe: "C:\\Program Files\\Slack\\slack.exe", lastMs: now - 7_200_000, count: 1 },
  ],
  snip_running_apps: () => [
    { hwnd: 11, rect: { x: 0, y: 0, w: 800, h: 600 }, title: "#design-review — Lens", app: "Discord", exe: "C:\\x\\Discord.exe" },
    { hwnd: 12, rect: { x: 0, y: 0, w: 800, h: 600 }, title: "Inbox — Outlook", app: "Olk", exe: "C:\\x\\olk.exe" },
    { hwnd: 13, rect: { x: 0, y: 0, w: 800, h: 600 }, title: "Untitled — Notepad", app: "Notepad", exe: "C:\\x\\notepad.exe" },
  ],
  snip_elements: () => [],
  snip_take_pending: () => null,
  snip_session: () => null,
  snip_history: () => [],
  snip_record_mics: () => ["Microphone Array (Realtek(R) Audio)"],
  ai_status: () => ({
    providers: [
      { id: "local", kind: "local", label: "Ollama · llama3.2", available: true, model: "llama3.2:3b", is_local: true, needs_key: false, has_key: false },
      { id: "claude", kind: "claude", label: "Claude", available: true, model: "claude-sonnet-5-5", is_local: false, needs_key: true, has_key: true },
    ],
    active: new URLSearchParams(location.search).get("ai") === "claude" ? "claude" : "local",
    privacy: "ask_each_time",
  }),
};

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (extra[cmd]) return (await extra[cmd](args ?? {})) as T;
  return baseInvoke<T>(cmd, args);
}

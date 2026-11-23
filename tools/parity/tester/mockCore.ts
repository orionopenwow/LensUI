// Parity mock for the Tester Hub: the base harness mock plus tester commands with sample data.
import { invoke as baseInvoke } from "../mock/core";
export { convertFileSrc, isTauri } from "../mock/core";

const t0 = Date.UTC(2026, 10, 23, 16, 4, 0);
const log = [
  ["info", "app", "Lens 0.2.0 started (Windows 11 Pro 24H2, 2 displays)"],
  ["info", "dock", "Dock style: taskbar, 9 pinned apps"],
  ["warn", "wallpaper", "WorkerW not found on first try; retried after 250 ms"],
  ["info", "theme", "Applied Catppuccin Mocha"],
  ["error", "ai", "Ollama at 127.0.0.1:11434 did not answer within 800 ms"],
  ["mark", "tester", "Dock flickered when I switched to Slim"],
  ["info", "cursor", "Pointer set Accent applied (48 px)"],
  ["warn", "dock", "pill width fell back to measured width"],
].map(([level, area, message], i) => ({ seq: i + 1, atMs: t0 + i * 7300, level, area, message }));

const handlers: Record<string, (a: any) => any> = {
  tester_results_get: () =>
    JSON.stringify({
      steps: {
        "dock-style-switch": { status: "fail", notes: "Slim style flickers once when switching from Taskbar; the clock shows twice for a second.", screenshots: ["C:\\Users\\%USER%\\Pictures\\Screenshots\\slim-flicker.png"] },
        "theme-pack-cycle": { status: "pass", notes: "", screenshots: [] },
        "report-export": { status: "skip", notes: "", screenshots: [] },
      },
    }),
  tester_results_set: () => null,
  tester_log_get: (a) => log.filter((l) => l.seq > (a?.after ?? 0)),
  tester_log_mark: (a) => ({ seq: 99, atMs: t0 + 99000, level: "mark", area: "tester", message: a?.note || "Marked moment" }),
  tester_environment: () => ({
    windows: "Windows 11 Pro 24H2 (build 26100.2605)",
    cpu: "AMD Ryzen 7 7840HS w/ Radeon 780M Graphics",
    gpus: ["AMD Radeon 780M Graphics", "NVIDIA GeForce RTX 4060 Laptop GPU"],
    ramGb: 31.3,
    displays: [
      { width: 2560, height: 1600, scale: 1.5, primary: true },
      { width: 1920, height: 1080, scale: 1, primary: false },
    ],
    lensVersion: "0.2.0",
  }),
  tester_export_plan: (a) => ({
    folder: "%USERPROFILE%\\Downloads",
    files: [
      "report.md — Build, environment and checklist results with your notes",
      "results.json — Checklist results (machine-readable)",
      "session-log.txt — This session's Lens log, redacted",
      "config-redacted.json — Lens settings with keys, tokens and personal content removed",
      ...(a?.screenshots ?? []).map((_: string, i: number) => `screenshots/0${i + 1}.png — Screenshot you attached (slim-flicker.png)`),
    ],
    skipped: [],
  }),
  tester_export_report: () => ({ path: "C:\\Users\\%USER%\\Downloads\\Lens test report 2026-11-23.zip", files: ["a", "b", "c", "d", "e"], skipped: [] }),
};

export async function invoke<T>(cmd: string, args?: any): Promise<T> {
  if (cmd in handlers) return handlers[cmd](args) as T;
  return baseInvoke<T>(cmd, args);
}

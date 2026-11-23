// Runs the smoothness script (docs/SMOOTHNESS.md): start a probe session, play each interaction
// with begin/end marks, stop, analyse and save. One run takes about two minutes and needs nothing
// from the person but to leave the mouse alone.
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { analyze, type RawSession, type SmoothReport } from "./analyze";
import { SCRIPT_LABELS, SMOOTH_SCRIPT, type Interaction, type Step } from "./script";

export interface RunProgress {
  index: number;
  total: number;
  label: string;
}
export interface RunResult {
  report: SmoothReport;
  path: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

interface ThemeConfig {
  theme: { preset: string; [k: string]: unknown };
  [k: string]: unknown;
}

export async function runSmoothCheck(onProgress: (p: RunProgress) => void, signal?: { cancelled: boolean }, script: Interaction[] = SMOOTH_SCRIPT): Promise<RunResult> {
  const notes: Record<string, string> = {};
  let originalPreset: string | null = null;

  const run = async (step: Step, id: string) => {
    switch (step.do) {
      case "wait":
        await sleep(step.ms);
        return;
      case "invoke":
        try {
          await invoke(step.cmd, step.args ?? {});
        } catch (e) {
          notes[id] = `skipped a step: ${String(e).slice(0, 120)}`;
        }
        return;
      case "dom":
        await emit("lens://smooth-act", step.act).catch(() => {});
        return;
      case "theme": {
        try {
          const cfg = await invoke<ThemeConfig>("get_config");
          if (step.preset === "restore") {
            if (originalPreset === null) return;
            await invoke("save_config_cmd", { newConfig: { ...cfg, theme: { ...cfg.theme, preset: originalPreset } } });
            originalPreset = null;
          } else {
            if (originalPreset === null) originalPreset = cfg.theme.preset;
            const next = cfg.theme.preset === step.preset ? "obsidian" : step.preset;
            await invoke("save_config_cmd", { newConfig: { ...cfg, theme: { ...cfg.theme, preset: next } } });
          }
        } catch (e) {
          notes[id] = `theme step failed: ${String(e).slice(0, 120)}`;
        }
        return;
      }
    }
  };

  await invoke("smooth_start_cmd");
  await sleep(500); // let every surface switch its recorder on
  try {
    for (let i = 0; i < script.length; i++) {
      if (signal?.cancelled) break;
      const it = script[i];
      onProgress({ index: i, total: script.length, label: it.label });
      for (const s of it.setup ?? []) await run(s, it.id);
      await invoke("smooth_mark_cmd", { id: it.id, phase: "begin" });
      for (const s of it.steps) await run(s, it.id);
      await sleep(it.settleMs);
      await invoke("smooth_mark_cmd", { id: it.id, phase: "end" });
      for (const s of it.cleanup ?? []) await run(s, it.id);
      await sleep(250);
    }
  } finally {
    // Whatever happened, put the theme back and close what the script opened.
    await run({ do: "theme", preset: "restore" }, "cleanup");
    for (const label of ["quicksettings", "widgets", "settings", "command", "palette"]) {
      await invoke("hide_surface", { label }).catch(() => {});
    }
  }
  const raw = (await invoke<RawSession | null>("smooth_stop_cmd")) ?? { session: "none", startedMs: 0, native: [], chunks: [], marks: [] };
  const report = analyze(raw, SCRIPT_LABELS, notes);
  let path: string | null = null;
  try {
    path = await invoke<string>("smooth_save_cmd", { report });
  } catch {
    path = null;
  }
  return { report, path };
}

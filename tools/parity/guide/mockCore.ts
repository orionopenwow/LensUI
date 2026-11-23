// Parity mock for Lens Guide: the base harness mock plus Guide progress.
import { invoke as baseInvoke } from "../mock/core";
export { convertFileSrc, isTauri } from "../mock/core";

const progress = {
  enabled: true,
  steps: { "first-five-minutes": [1, 2, 3, 4, 5], "make-it-yours": [1], "windows-like-a-pro": [1, 2] },
  current: { "make-it-yours": 2, "windows-like-a-pro": 3 },
  completed: ["first-five-minutes"],
  dismissedTips: [],
  tipOfTheDay: false,
  used: [],
};

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (cmd === "guide_progress_get") return structuredClone(progress) as T;
  if (cmd === "guide_progress_set") return (args?.progress ?? progress) as T;
  if (cmd === "guide_progress_reset") return { ...progress, steps: {}, current: {}, completed: [] } as T;
  return baseInvoke<T>(cmd, args);
}
export const transformCallback = () => 0;

// Tauri bridge for "Lens at work" (docs/PRESENCE.md). Lens windows may only announce as Lens
// itself (internal | voice | magic | apps); outside apps are announced by the backend.
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_CONFIG, type LRect, type PresenceConfig, type PresenceEvent, type PresenceStatus, type StepInput } from "./types";

export type OwnActor = "internal" | "voice" | "magic" | "apps";

export interface AnnounceResult {
  stopped: boolean;
  waitMs: number;
}

function rectOf(el: Element | null | undefined): LRect | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * Announce a step and wait out the visual lead (≤ 150 ms). Resolves `{ stopped: true }` if the
 * user pressed Stop — the caller must then not act. Never throws: if the backend is missing the
 * action simply goes ahead.
 */
export async function announce(actor: OwnActor, step: StepInput, target?: Element | LRect | null, dest?: Element | LRect | null): Promise<AnnounceResult> {
  const toRect = (v: Element | LRect | null | undefined) => (v && "getBoundingClientRect" in v ? rectOf(v) : (v ?? undefined));
  try {
    const res = await invoke<AnnounceResult>("presence_announce", {
      input: { actor, step, targetCss: toRect(target), destCss: toRect(dest) },
    });
    if (!res.stopped && res.waitMs > 0) await new Promise((r) => setTimeout(r, Math.min(res.waitMs, 150)));
    return res;
  } catch {
    return { stopped: false, waitMs: 0 };
  }
}

export function done(actor: OwnActor, label?: string): Promise<void> {
  return invoke<void>("presence_done", { actor, label }).catch(() => {});
}

export function stop(): Promise<string[]> {
  return invoke<string[]>("presence_stop").catch(() => [] as string[]);
}

export function getConfig(): Promise<PresenceConfig> {
  return invoke<PresenceConfig>("presence_get_config").catch(() => ({ ...DEFAULT_CONFIG }));
}

export function setConfig(config: PresenceConfig): Promise<PresenceConfig> {
  return invoke<PresenceConfig>("presence_set_config", { config });
}

export function status(): Promise<PresenceStatus> {
  return invoke<PresenceStatus>("presence_status").catch(() => ({ config: { ...DEFAULT_CONFIG }, hotkeyOk: false, active: [] }));
}

export function last(): Promise<PresenceEvent | null> {
  return invoke<PresenceEvent | null>("presence_last").catch(() => null);
}

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * Answers the Win-key / Alt+Tab hook's liveness pings. After the hook hands a key back to Windows
 * (because Lens didn't answer within 300 ms) it pings every 5 s and re-arms itself as soon as any
 * Lens window answers. Installed once per window; acknowledgements are idempotent.
 */
let installed = false;

export function installKeyhookResponder(): void {
  if (installed) return;
  installed = true;
  listen<{ seq: number }>("lens://keyhook-ping", (e) => {
    const seq = e.payload?.seq;
    if (typeof seq === "number") invoke("keyhook_ack_cmd", { seq }).catch(() => {});
  }).catch(() => {
    installed = false;
  });
}

/** Payload of "lens://keyhook" (mirrors win_keyhook::HookEvent, tagged by `kind`). */
export type KeyhookEvent =
  | { kind: "launcherToggle" }
  | { kind: "overviewOpen"; backwards: boolean }
  | { kind: "overviewStep"; delta: number }
  | { kind: "overviewCommit" }
  | { kind: "overviewCancel" };

export interface KeyhookMessage {
  seq: number;
  event: KeyhookEvent;
}

export function ackKeyhook(seq: number): void {
  invoke("keyhook_ack_cmd", { seq }).catch(() => {});
}

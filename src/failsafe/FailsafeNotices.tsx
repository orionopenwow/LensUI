// Tells the person, once, when Lens protected itself: a feature paused after repeated failures,
// settings that were repaired, Safe Mode (docs/FAILSAFE.md). Mounted in the Dock window only, so
// each notice is shown by exactly one window. It goes out as an ordinary Lens notification: it
// respects Do Not Disturb and stays in the Notification Center, where clicking it opens
// Settings › About & Testing › Safety net ("Turn back on" lives there).
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Notice } from "../types/generated";

export const FAILSAFE_CATEGORY = "failsafe";

export function noticeTitle(n: Pick<Notice, "id" | "kind">): string {
  if (n.id === "safe-mode") return "Lens is in Safe Mode";
  if (n.id.startsWith("breaker:")) return "A feature was paused";
  if (n.id.startsWith("config-")) return "Settings were repaired";
  if (n.id.startsWith("surface:")) return "Part of Lens is off";
  return n.kind === "error" ? "Lens hit a problem" : "Lens";
}

async function deliver(): Promise<void> {
  const notices = await invoke<Notice[]>("failsafe_take_notices").catch(() => [] as Notice[]);
  for (const n of notices) {
    await invoke("push_notification_cmd", { title: noticeTitle(n), body: n.text, appName: "Lens", category: FAILSAFE_CATEGORY }).catch(() => {});
  }
}

export function FailsafeNotices(): null {
  useEffect(() => {
    // Notices queued before any window existed (config repair, Safe Mode) wait for the
    // notification window to be listening.
    const first = window.setTimeout(() => void deliver(), 2500);
    const unlisten = listen("lens://failsafe-notice", () => void deliver());
    return () => {
      window.clearTimeout(first);
      unlisten.then((off) => off()).catch(() => {});
    };
  }, []);
  return null;
}

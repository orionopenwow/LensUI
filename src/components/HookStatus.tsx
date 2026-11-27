// One quiet line under the "Legacy in-app window styling" switch: is the helper actually in use
// right now? Lens keeps it out while a fullscreen app or an anti-cheat protected game is running.
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Pure: the line for a status. */
export function hookStatusLine(s: { wanted: boolean; installed: boolean } | null): string {
  if (!s || !s.wanted) return "";
  return s.installed ? "In use now." : "Paused: a fullscreen app or a protected game is running. It comes back by itself.";
}

export const HookStatus: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const [status, setStatus] = useState<{ wanted: boolean; installed: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    let alive = true;
    const read = () =>
      invoke<{ wanted: boolean; installed: boolean }>("legacy_hook_status")
        .then((s) => alive && setStatus(s))
        .catch(() => undefined);
    read();
    const t = window.setInterval(read, 3000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [enabled]);
  const line = hookStatusLine(status);
  return line ? (
    <div className="cc-desc" role="status">
      {line}
    </div>
  ) : null;
};

export default HookStatus;

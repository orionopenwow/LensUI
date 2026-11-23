import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Why "Start with Windows" can't be turned on from this copy of Lens (null when it can).
 * Development builds load their pages from the dev server, so they must never start at
 * sign-in (B-21).
 */
export function useStartupBlock(): string | null {
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    invoke<string | null>("startup_block_reason_cmd")
      .then((r) => {
        if (alive) setReason(r ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return reason;
}

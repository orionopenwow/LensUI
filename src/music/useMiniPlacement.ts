import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { music } from "./api";

/** Where the music mini player lives ("dock" | "topbar" | "hidden"), and whether Music is on at all. */
export function useMiniPlacement(): string {
  const [where, setWhere] = useState("hidden");
  useEffect(() => {
    const read = () =>
      music
        .config()
        .then((c) => setWhere(c && c.enabled ? c.miniPlayer || "dock" : "hidden"))
        .catch(() => setWhere("hidden"));
    read();
    // Re-read when settings change or a new track starts, so the mini player moves without a restart.
    const uns = [listen("lens://config-updated", read), listen("lens://music/now", read)];
    return () => {
      uns.forEach((u) => u.then((f) => f()).catch(() => {}));
    };
  }, []);
  return where;
}

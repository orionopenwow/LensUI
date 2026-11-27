// The visible "Lens Remote is on" indicator for the Top Bar (Tester mode). Shown only while the
// Remote is serving; clicking it opens Settings › Music, where it can be turned off.
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Smartphone } from "lucide-react";
import { EVENT_REMOTE, music, type RemoteInfo } from "./api";
import "./remotePill.css";

export const RemotePill: React.FC = () => {
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  useEffect(() => {
    music.remoteStatus().then(setInfo).catch(() => {});
    const un = listen<RemoteInfo>(EVENT_REMOTE, (e) => setInfo(e.payload));
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, []);
  if (!info?.on) return null;
  return (
    <button
      type="button"
      data-weight="medium"
      className="th-badge lm-remote-pill"
      aria-label={`Lens Remote is on at ${info.address}, ${info.phones} phone(s) paired. Open Music settings`}
      onClick={() => invoke("open_dock_popout_tab_cmd", { tab: "music" }).catch(() => {})}
    >
      <Smartphone size={11} strokeWidth={2.6} aria-hidden="true" /> Remote on
    </button>
  );
};

export default RemotePill;

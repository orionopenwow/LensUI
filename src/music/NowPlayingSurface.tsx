import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NowPlayingView } from "./NowPlaying";
import { useLensState } from "../hooks/useLensState";

/** The `nowplaying` window (docs/MUSIC.md §2). */
export const NowPlayingSurface: React.FC = () => {
  // Theme tokens (data-scheme, pack colours) and live updates, like every other surface.
  useLensState();
  const win = getCurrentWindow();
  // The visual rig opens Immersive straight away (?immersive=1); the app does it by event.
  const immersive = new URLSearchParams(location.search).get("immersive") === "1" ? { from: "command" as const } : undefined;
  return (
    <NowPlayingView
      immersive={immersive}
      onClose={() => void win.hide()}
      onMode={(m) => void win.setFullscreen(m === "fullscreen").catch(() => {})}
    />
  );
};

export default NowPlayingSurface;

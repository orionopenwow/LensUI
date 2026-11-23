import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NowPlayingView } from "./NowPlaying";
import { useLensState } from "../hooks/useLensState";

/** The `nowplaying` window (docs/MUSIC.md §2). */
export const NowPlayingSurface: React.FC = () => {
  // Theme tokens (data-scheme, pack colours) and live updates, like every other surface.
  useLensState();
  const win = getCurrentWindow();
  return (
    <NowPlayingView
      onClose={() => void win.hide()}
      onMode={(m) => void win.setFullscreen(m === "fullscreen").catch(() => {})}
    />
  );
};

export default NowPlayingSurface;

import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NowPlayingView } from "./NowPlaying";

/** The `nowplaying` window (docs/MUSIC.md §2). */
export const NowPlayingSurface: React.FC = () => {
  const win = getCurrentWindow();
  return (
    <NowPlayingView
      onClose={() => void win.hide()}
      onMode={(m) => void win.setFullscreen(m === "fullscreen").catch(() => {})}
    />
  );
};

export default NowPlayingSurface;

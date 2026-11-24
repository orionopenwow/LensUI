// Lens Studio window (`?surface=studio`): Backdrop Lab and the Wallpaper Switcher's picker share it.
// Window config: tauri.conf.json "studio" (built on first open). Docs: docs/BACKDROP_LAB.md,
// docs/WALLPAPER_SWITCHER.md.
import React, { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Images, Minus, Square, X } from "lucide-react";
import { BackdropLab } from "./backdrop/ui/BackdropLab";
import { WallpaperPicker } from "../wallpapers/WallpaperPicker";
import { STUDIO_VIEW_EVENT, takePendingStudioView, type StudioView } from "../wallpapers/open";

const WindowButtons: React.FC = () => {
  const w = () => getCurrentWindow();
  return (
    <div className="bd-winbtns">
      <button type="button" className="bd-icon-btn" aria-label="Minimise" onClick={() => w().minimize().catch(() => {})}>
        <Minus size={13} aria-hidden />
      </button>
      <button type="button" className="bd-icon-btn" aria-label="Maximise" onClick={() => w().toggleMaximize().catch(() => {})}>
        <Square size={11} aria-hidden />
      </button>
      <button type="button" className="bd-icon-btn close" aria-label="Close Lens Studio" onClick={() => w().hide().catch(() => {})}>
        <X size={14} aria-hidden />
      </button>
    </div>
  );
};

/** `?view=wallpapers` (or a note left by /wallpaper, Settings or voice) opens on the picker. */
function firstView(): StudioView {
  const fromUrl = typeof location !== "undefined" ? new URLSearchParams(location.search).get("view") : null;
  if (fromUrl === "wallpapers") return "wallpapers";
  return takePendingStudioView() ?? "backdrop";
}

export function StudioSurface() {
  const [view, setView] = useState<StudioView>(firstView);
  useEffect(() => {
    const un = listen<StudioView>(STUDIO_VIEW_EVENT, (e) => {
      takePendingStudioView();
      if (e.payload === "wallpapers" || e.payload === "backdrop") setView(e.payload);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);
  return (
    <div className="lens-glass bd-studio" data-studio-view={view}>
      {view === "wallpapers" ? (
        <WallpaperPicker windowControls={<WindowButtons />} onOpenLab={() => setView("backdrop")} />
      ) : (
        <BackdropLab
          windowControls={
            <>
              <button type="button" className="bd-chip" onClick={() => setView("wallpapers")}>
                <Images size={13} aria-hidden /> Wallpapers
              </button>
              <WindowButtons />
            </>
          }
        />
      )}
    </div>
  );
}

// Lens Studio window (`?surface=studio`): Backdrop Lab today; other creator tools can join it.
// Window config: tauri.conf.json "studio" (built on first open). Docs: docs/BACKDROP_LAB.md.
import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { BackdropLab } from "./backdrop/ui/BackdropLab";

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

export function StudioSurface() {
  return (
    <div className="lens-glass bd-studio">
      <BackdropLab windowControls={<WindowButtons />} />
    </div>
  );
}

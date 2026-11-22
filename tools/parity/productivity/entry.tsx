// Parity gallery for the productivity-input cards (not part of the app bundle).
// harness.html?card=hotcorners|altdrag|summon|dnd&preset=<pack>
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import "../../../src/surfaces/QuickSettingsSurface.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { HotCornersCard } from "../../../src/components/HotCornersCard";
import { AltDragCard } from "../../../src/components/AltDragCard";
import { AppSummonCard } from "../../../src/components/AppSummonCard";
import { NotificationCenterPane } from "../../../src/components/NotificationCenterPane";

const W = globalThis as any;
const params = new URLSearchParams(location.search);
const card = params.get("card") || "hotcorners";
const off = params.get("off") === "1";

// Realistic, switched-on settings for the screenshots (the real defaults are all off).
const seed = W.__lensConfig();
W.__lensSetConfig({
  ...seed,
  hotCorners: { enabled: !off, topLeft: "overview", topRight: "notifications", bottomLeft: "none", bottomRight: "show-desktop", dwellMs: 250, sizePx: 3, allMonitors: true },
  altDrag: { enabled: !off, modifier: "alt", resize: true, raise: true, restoreMaximized: true, exclude: ["blender.exe", "photoshop.exe"] },
  appSummon: {
    enabled: !off,
    bindings: [
      { id: "a", name: "Terminal", path: "wt.exe", hotkey: "ctrl+alt+Backquote", enabled: true },
      { id: "b", name: "Notes", path: "C:\\Program Files\\Obsidian\\Obsidian.exe", hotkey: "alt+KeyW", enabled: true },
    ],
  },
});

const Gallery: React.FC = () => {
  const { config, updateConfig } = useLensState();
  if (!config) return null;
  if (card === "dnd") {
    return (
      <div className="qs-panel lens-glass" style={{ width: 376, margin: 14 }}>
        <div className="qs-body">
          <NotificationCenterPane />
        </div>
      </div>
    );
  }
  const Card = card === "altdrag" ? AltDragCard : card === "summon" ? AppSummonCard : HotCornersCard;
  return (
    <div className="cc-shell lens-glass" style={{ borderRadius: 12 }}>
      <main className="cc-content">
        <Card config={config} onUpdateConfig={updateConfig} />
      </main>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Gallery />);

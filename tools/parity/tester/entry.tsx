// Renders the Tester Hub for screenshots: ?scene=new|checklist|log|report|report-confirm|empty|badge&preset=…
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { TesterHub, TesterBadge, type TesterTab } from "../../../src/tester/TesterHub";
import type { BuildInfo } from "../../../src/tester/model";
import example from "../../../docs/tester/LATEST.example.json";

const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "new";

const commits = [
  ["feat(dock): six dock styles with magnification and jelly launch (#8)", ["src/dock/styles.ts", "src/surfaces/DockSurface.tsx"]],
  ["Taskbar style shows the clock in the dock", ["src/surfaces/TopBarSurface.tsx", "src/dock/DockSystemArea.tsx"]],
  ["Theme & Look: current theme on top, six recommended packs (#6)", ["src/themeux/ThemeTab.tsx"]],
  ["Real Nord, Dracula and Solarized backgrounds", ["src/themes/packs.ts"]],
  ["Dim inactive windows and gradient active border (#10)", ["src-tauri/src/win_focus_dim.rs"]],
  ["Hot corners and Alt+drag (#11)", ["src-tauri/src/win_hotcorners.rs", "src-tauri/src/win_altdrag.rs"]],
  ["Playground: falling sand and ink scenes (#13)", ["src/playground/scenes/sand.ts"]],
  ["Lens Command and the Shelf (#16)", ["src/command/CommandSurface.tsx", "src-tauri/src/shelf/mod.rs"]],
  ["Ollama and LM Studio detection (#14)", ["src-tauri/src/ai/providers/local.rs"]],
  ["Tester Hub in Settings", ["src/tester/TesterHub.tsx"]],
  ["CI: cache cargo registry", [".github/workflows/build.yml"]],
].map(([subject, files], i) => ({ sha: `${(i + 1).toString(16).padStart(2, "0")}a9c3f1e0d`, subject: subject as string, files: files as string[] }));

const info: BuildInfo = {
  version: "0.2.0",
  sha: "4f2c9e1b7a30",
  builtAt: "2026-11-23T12:20:00Z",
  commits: scene === "empty" ? [] : commits,
  latest: scene === "empty" ? null : example,
  latestSource: "example",
};

function App() {
  useLensState();
  const tab = (scene.startsWith("report") ? "report" : scene === "empty" ? "checklist" : scene) as TesterTab;
  React.useEffect(() => {
    if (scene !== "report-confirm") return;
    const t = window.setInterval(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "Export…") as HTMLButtonElement | undefined;
      if (b) {
        b.click();
        window.clearInterval(t);
      }
    }, 100);
    return () => window.clearInterval(t);
  }, []);
  if (scene === "badge") {
    return (
      <div style={{ padding: 16, display: "flex", gap: 12, alignItems: "center" }} className="lens-glass">
        <span style={{ fontSize: 12 }}>Top bar corner:</span>
        <TesterBadge info={info} />
      </div>
    );
  }
  return (
    <div className="lens-glass cc-content" style={{ minHeight: "100%", boxSizing: "border-box", borderRadius: 0 }}>
      <div className="cc-card">
        <TesterHub info={info} initialTab={tab} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

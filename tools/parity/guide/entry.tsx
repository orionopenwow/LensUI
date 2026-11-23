// Renders Lens Guide scenes for screenshots: ?scene=home|search|answer|lesson|coach|drawer&preset=…
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { GuidePanel } from "../../../src/guide/GuidePanel";
import { CoachMarkLayer } from "../../../src/guide/CoachMarkLayer";
import { GuideDrawer } from "../../../src/guide/GuideDrawer";
import { GUIDE_INDEX } from "../../../src/guide/indexData";
import type { GuideProgress } from "../../../src/guide/types";

const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "home";

const progress: GuideProgress = {
  enabled: true,
  steps: { "first-five-minutes": [1, 2, 3, 4, 5], "make-it-yours": [1], "windows-like-a-pro": [1, 2] },
  current: { "make-it-yours": 2, "windows-like-a-pro": 3 },
  completed: ["first-five-minutes"],
  dismissedTips: [],
  tipOfTheDay: false,
  used: [],
};

const answer = {
  provider: "Ollama · llama3.2:3b",
  text: "Turn on **Dim inactive windows** in Windows & Quick › Window styling › Focus & Borders [1]. Pick a strength from 0 to 40 %; the active window, the dock and other always-on-top windows stay bright [1]. If you also want a coloured outline on the window you're using, the same card has the active border options [2].",
  sourceIds: ["setting.system.windowrulescard.dim-inactive-windows", "card.system.windowrulescard"],
};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--lens-pack-base, #0b0b0e)", display: "grid", placeItems: "center" }}>
      <div style={{ width: 380, height: 640, borderRadius: 14, overflow: "hidden", background: "var(--lens-surface-solid, #111116)", border: "1px solid rgb(var(--lens-ink) / 0.12)" }}>{children}</div>
    </div>
  );
}

function Panel() {
  const { config } = useLensState();
  if (scene === "search") return <Frame><GuidePanel index={GUIDE_INDEX} config={config} initialQuery="How do I make the dock thinner?" initialProgress={progress} context={{ tab: "dock" }} /></Frame>;
  if (scene === "answer") return <Frame><GuidePanel index={GUIDE_INDEX} config={config} aiEnabled initialQuery="How do I dim windows I'm not using?" initialAnswer={answer} initialProgress={progress} /></Frame>;
  if (scene === "lesson") return <Frame><GuidePanel index={GUIDE_INDEX} config={config} initialLesson="make-it-yours" initialProgress={progress} /></Frame>;
  return <Frame><GuidePanel index={GUIDE_INDEX} config={config} initialProgress={progress} context={{ tab: "system" }} onClose={() => {}} /></Frame>;
}

async function main() {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  if (scene === "coach" || scene === "drawer") {
    // The real Control Center (reads ?tab=) with a Show-me highlight or the Guide drawer on top.
    const { ControlCenterSurface: ControlCenter } = await import("../../../src/surfaces/ControlCenterSurface");
    root.render(
      <>
        <ControlCenter />
        {scene === "coach" ? (
          <CoachMarkLayer
            sticky
            initial={{ target: { surface: "settings", tab: "system", label: "Hot Corners" }, title: "Hot Corners", note: "Give each screen corner an action, like Overview or Show desktop.", ts: 0 }}
          />
        ) : (
          <GuideDrawer initiallyOpen />
        )}
      </>
    );
    return;
  }
  root.render(<Panel />);
}
main();

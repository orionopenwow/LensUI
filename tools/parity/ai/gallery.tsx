// Renders one AI surface state per page for screenshots: tools/parity/ai/out/index.html?scene=<name>&preset=<pack>.
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import "../../../src/surfaces/DockSurface.css";
import { applyThemeToDocument } from "../../../src/hooks/useLensState";
import { AskPanel } from "../../../src/ai/AskPanel";
import { AskDockField, AskDockPopover, useAskMode } from "../../../src/dock/ai/AskDock";
import { SuggestedApps } from "../../../src/dock/ai/SuggestedApps";
import { DropSparkle, DropToAiMenu } from "../../../src/dock/ai/DropToAi";
import { WindowGroups } from "../../../src/dock/ai/WindowGroups";
import { AiCard } from "../../../src/components/AiCard";
import { emptyModel, recordLaunch } from "../../../src/dock/ai/predict";
import "./gallery.css";

const q = new URLSearchParams(location.search);
const scene = q.get("scene") || "ask-empty";
const cfg = (globalThis as any).__lensConfig();
applyThemeToDocument(cfg, {
  accentHex: "#2D7D9A", accentR: 45, accentG: 125, accentB: 154, appsUseLightTheme: false, systemUsesLightTheme: false,
} as any);

const CTX = {
  selection: "The render step spikes CPU to 95% and the fan gets loud whenever a preview is generated.",
  app_name: "Chrome",
  window_title: "Lens issue #412 — fan noise",
  url: "https://github.com/orionopenwow/LensUI/issues/412",
};

const ICONS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

function DockPill({ mode, answer, value }: { mode: "search" | "ask"; answer?: boolean; value: string }) {
  const m = useAskMode(true, mode);
  const [v, setV] = useState(value);
  const field = 200;
  // Same rule as the Dock: fixed pill width; icons shrink to make room for the field.
  const icon = Math.max(22, Math.min(40, (520 - field - 32 - (ICONS.length - 1) * 6) / ICONS.length));
  return (
    <div className="g-dock-wrap">
      <div className="g-dock" style={{ width: 520 }}>
        <div style={{ width: field, flexShrink: 0 }}>
          <AskDockField
            mode={m.mode}
            value={v}
            onChange={setV}
            onToggleMode={m.toggle}
            onAsk={() => {}}
            onEscape={() => {}}
          />
        </div>
        <div className="g-dock-icons">
          {ICONS.map((c) => (
            <span key={c} className="g-icon" style={{ width: icon, height: icon, background: c }} />
          ))}
        </div>
        <AskDockPopover open={!!answer} prompt={value} onClose={() => {}} />
      </div>
    </div>
  );
}

function predictModel() {
  let m = emptyModel();
  for (let d = 2; d <= 20; d++) {
    const date = new Date(2026, 10, d);
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      m = recordLaunch(m, { key: "figma", name: "Figma", path: "C:\\x\\Figma.exe" }, new Date(2026, 10, d, 9, 10));
      m = recordLaunch(m, { key: "slack", name: "Slack", path: "C:\\x\\slack.exe" }, new Date(2026, 10, d, 9, 30));
    }
  }
  return m;
}

const WINS = [
  { hwnd: 1, title: "dock.rs — LensUI — Visual Studio Code", processName: "Code.exe", isFocused: true },
  { hwnd: 2, title: "Terminal — cargo test", processName: "WindowsTerminal.exe" },
  { hwnd: 3, title: "Lens issue #412 — Chrome", processName: "chrome.exe" },
  { hwnd: 4, title: "Tauri v2 docs — Chrome", processName: "chrome.exe" },
  { hwnd: 5, title: "#lens-dev — Slack", processName: "slack.exe" },
  { hwnd: 6, title: "Midnight City — Spotify", processName: "Spotify.exe" },
];

function Scene() {
  switch (scene) {
    case "ask-empty":
      return <div className="g-panel"><AskPanel initialContext={CTX} onClose={() => {}} onOpenSettings={() => {}} /></div>;
    case "ask-streaming":
    case "ask-done":
    case "ask-tool":
    case "ask-error":
      return (
        <div className="g-panel">
          <AskPanel autoSend initialPrompt="Why is my fan so loud right now?" initialContext={CTX} onClose={() => {}} onOpenSettings={() => {}} />
        </div>
      );
    case "ask-consent":
      return (
        <div className="g-panel">
          <AskPanel autoSend initialPrompt="Summarise this issue and suggest a fix" initialContext={CTX} initialShelfIds={["s1"]} onClose={() => {}} />
        </div>
      );
    case "ask-blocked":
      return <div className="g-panel"><AskPanel autoSend initialPrompt="Summarise this" initialContext={CTX} onOpenSettings={() => {}} /></div>;
    case "ask-mention":
      return <div className="g-panel"><AskPanel initialContext={{ selection: CTX.selection }} initialShelfIds={["s2"]} onClose={() => {}} /></div>;
    case "dock-search":
      return <DockPill mode="search" value="" />;
    case "dock-ask":
      return <DockPill mode="ask" value="what's using my CPU" />;
    case "dock-answer":
      return <DockPill mode="ask" value="Why is my fan so loud right now?" answer />;
    case "dock-drop":
      return (
        <div className="g-row">
          <DropSparkle active />
          <DropToAiMenu paths={["C:\\Users\\u\\Videos\\standup.mp4"]} onClose={() => {}} onAsk={() => {}} />
        </div>
      );
    case "dock-transcribe":
      return <TranscribeScene />;
    case "dock-suggested":
      return (
        <div className="g-dock-wrap">
          <div className="g-dock" style={{ width: "auto", paddingRight: 12 }}>
            <div className="g-dock-icons">
              {ICONS.slice(0, 5).map((c) => <span key={c} className="g-icon" style={{ background: c }} />)}
            </div>
            <SuggestedApps enabled exclude={[]} onLaunch={() => {}} model={predictModel()} now={new Date(2026, 10, 23, 9, 20)} />
          </div>
        </div>
      );
    case "groups":
      return (
        <div className="g-panel g-short">
          <WindowGroups windows={WINS} provider={{ id: "ollama", kind: "local", label: "Ollama", available: true, model: "qwen3:8b", is_local: true, needs_key: false, has_key: false }} privacy="ask_each_time" onFocusWindow={() => {}} onAsk={() => {}} />
        </div>
      );
    case "groups-locked":
      return (
        <div className="g-panel g-short">
          <WindowGroups windows={WINS} provider={{ id: "claude", kind: "claude", label: "Claude", available: true, model: "", is_local: false, needs_key: true, has_key: true }} privacy="ask_each_time" onFocusWindow={() => {}} onAsk={() => {}} />
        </div>
      );
    case "aicard":
    case "aicard-off":
    case "aicard-intro":
      return <div className="g-card"><AiCard onTryIt={() => {}} /></div>;
    default:
      return <div>unknown scene {scene}</div>;
  }
}

function TranscribeScene() {
  // Click "Transcribe" so the progress view is what gets captured.
  React.useEffect(() => {
    setTimeout(() => (document.querySelector(".ai-drop-item") as HTMLButtonElement | null)?.parentElement?.querySelectorAll<HTMLButtonElement>(".ai-drop-item")[1]?.click(), 50);
  }, []);
  return (
    <div className="g-row">
      <DropToAiMenu paths={["C:\\Users\\u\\Videos\\standup.mp4"]} onClose={() => {}} onAsk={() => {}} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Scene />);

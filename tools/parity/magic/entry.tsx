// Magic right-click window scenes on a mock desktop: ?scene=<name>&preset=<pack>
// Scenes: selection link image file window desktop dockItem ask approval confirm flip card
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import { MagicSurface, type MagicInitial } from "../../../src/magic/MagicSurface";
import { MagicCard } from "../../../src/components/MagicCard";
import { previewOpen } from "../../../src/magic/previews";
import { DEFAULT_MAGIC } from "../../../src/magic/contract";
import type { AiRunState } from "../../../src/ai/contract";
import type { LensConfig } from "../../../src/types/lens";

const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "selection";
const light = (p.get("preset") || "").includes("daylight") || (p.get("preset") || "").includes("paper");

const answer = `**In short:** calm technology stays in the periphery and moves to the centre only when it's needed.

- Inform without demanding attention.
- Use the smallest amount of technology that solves the problem.
- Let people get back to what they were doing.`;

const streaming: AiRunState = { id: "q1", status: "running", text: answer.slice(0, 150), steps: [], provider: "Ollama", model: "llama3.2:3b" };
const waiting: AiRunState = {
  id: "q2",
  status: "waiting",
  text: "I can tidy these windows: Word on the left, Chrome on the right.",
  provider: "Ollama",
  model: "llama3.2:3b",
  steps: [
    {
      call_id: "c1",
      tool: "arrange_windows",
      args: { layout: "side-by-side", windows: "Word, Chrome", monitor: "Display 1" },
      summary: "Arrange Word and Chrome side by side?",
      risk: "confirm",
      state: "awaiting",
    },
  ],
};

const scenes: Record<string, MagicInitial> = {
  selection: { open: previewOpen("selection") },
  link: { open: previewOpen("link") },
  image: { open: previewOpen("image") },
  file: { open: previewOpen("file") },
  window: { open: previewOpen("window") },
  desktop: { open: previewOpen("desktop") },
  dockItem: { open: previewOpen("dockItem") },
  ask: { open: previewOpen("link"), mode: "ask", query: "What are the three main ideas?", result: { type: "ai", title: "Ask" }, run: streaming },
  approval: { open: previewOpen("window"), mode: "ask", query: "tidy my windows", result: { type: "ai", title: "Ask" }, run: waiting },
  confirm: {
    open: previewOpen("window"),
    result: { type: "confirm", row: { id: "win:close", label: "Close window…", icon: "x", group: "window", risk: "confirm", windowAction: "close" }, title: "Close WINWORD?", detail: "The app may ask to save first.", verb: "Close" },
  },
  flip: { open: previewOpen("selection", { flippedX: true, flippedY: true }), query: "" },
};

function Desktop({ children, cursor, box }: { children: React.ReactNode; cursor: [number, number]; box: [number, number] }) {
  const bg = light
    ? "linear-gradient(135deg, #d9dee7, #eef1f6 55%, #cfd6e2)"
    : "linear-gradient(135deg, #2b303b, #161a22 60%, #20242e)";
  return (
    <div style={{ position: "fixed", inset: 0, background: bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute", left: 40, top: 40, width: 520, height: 330, borderRadius: 10,
          background: light ? "#ffffff" : "#1e2128", boxShadow: "0 10px 30px rgba(0,0,0,.25)",
          border: light ? "1px solid #d5d9e0" : "1px solid #2c3039", font: "13px system-ui", color: light ? "#222" : "#ddd", padding: 18, boxSizing: "border-box",
        }}
      >
        <b>Q4 planning.docx — Word</b>
        <p style={{ margin: "14px 0 0", lineHeight: "22px" }}>
          Next steps: <span style={{ background: light ? "#b3d4fc" : "#264f78" }}>Ship the magic window behind a setting, then turn it on for the beta channel once parity is green.</span>
        </p>
        <p style={{ margin: "10px 0 0", lineHeight: "22px", color: light ? "#1a5fb4" : "#79b8ff", textDecoration: "underline" }}>Calm technology — principles</p>
      </div>
      <div style={{ position: "absolute", left: box[0], top: box[1], width: 360, height: 440 }}>{children}</div>
      <svg width="18" height="24" viewBox="0 0 18 24" style={{ position: "absolute", left: cursor[0], top: cursor[1], filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))" }} aria-hidden>
        <path d="M1 1 L1 19 L6 14.5 L9.5 22 L12.5 20.7 L9 13.5 L16 13.5 Z" fill="#fff" stroke="#000" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
if (scene === "card") {
  root.render(
    <div style={{ padding: 16, background: "var(--lens-bg-base)", minHeight: "100%" }}>
      <div style={{ width: 640 }}>
        <MagicCard
          config={{} as LensConfig}
          initial={{
            magic: { ...DEFAULT_MAGIC, enabled: true, exclude: ["photoshop.exe", "valorant.exe"] },
            status: { enabled: true, trigger: "ctrl-alt-right", hookActive: true, hotkeyOk: true, reinstalls: 0, lastProblem: "", lastResolveMs: 41, lastOpenMs: 63 },
            conflicts: [{ level: "note", code: "hold-delay", message: "Right-clicks reach apps a moment later, and right-drags start after a small move." }],
          }}
        />
      </div>
    </div>,
  );
} else {
  const s = scenes[scene] ?? scenes.selection;
  const flip = scene === "flip";
  // Opens below-right of the cursor; the flip scene shows the edge case at the bottom-right.
  const cursor: [number, number] = flip ? [936, 596] : [400, 92];
  const box: [number, number] = flip ? [570, 150] : [408, 100];
  root.render(
    <Desktop cursor={cursor} box={box}>
      <MagicSurface initial={{ ...s, preview: true, cfg: { ...DEFAULT_MAGIC, enabled: true } }} />
    </Desktop>,
  );
}

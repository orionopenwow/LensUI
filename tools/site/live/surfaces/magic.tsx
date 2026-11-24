// The real magic right-click window (src/magic/MagicSurface.tsx) for the website, with nothing around
// it: the page supplies what was right-clicked. ?scene=<kind or step>&preset=…, and the page can step
// it with {lens:"scene", scene, label?, text?, url?}.
//   kinds: selection link image file window desktop dockItem   (the app's own sample targets)
//   steps: summary (a finished answer), transcript, shelf (a done note with Undo), ask (streaming),
//          approval (an agent step waiting for the person's OK)
import "./embed";
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../../src/styles/tokens.css";
import "../../../../src/styles/global.css";
import { MagicSurface, type MagicInitial } from "../../../../src/magic/MagicSurface";
import { previewOpen } from "../../../../src/magic/previews";
import type { AiRunState } from "../../../../src/ai/contract";

const q = new URLSearchParams(location.search);
const run = (p: Partial<AiRunState>): AiRunState => ({ id: "site", status: "done", text: "", steps: [], provider: "Ollama", model: "llama3.2:3b", ...p }) as AiRunState;

const summary = `**In short:** calm technology stays in the periphery and moves to the centre only when it's needed.

- Inform without demanding attention.
- Use the smallest amount of technology that solves the problem.
- Let people get back to what they were doing.`;
const transcript = `**Transcript** · 4 min 12 s, made on this PC

00:00  Today: fish and chips at home, start to finish.
00:21  Dry the fish well. It keeps the batter crisp.
00:58  Cold sparkling water in the batter, mixed for ten seconds.
01:40  Oil at 180 °C. Fry for four minutes, turning once.`;

function initialFor(scene: string, over: { label?: string; text?: string; url?: string } = {}): MagicInitial {
  const base = (kind: string) => {
    const o = previewOpen(kind);
    if (over.label || over.text || over.url) o.targets = o.targets.map((t, i) => (i === 0 ? { ...t, label: over.label ?? t.label, text: over.text ?? t.text, url: over.url ?? t.url } : t));
    return o;
  };
  switch (scene) {
    case "summary": return { open: base("link"), mode: "ask", query: "Summarise this page", result: { type: "ai", title: "Summary" }, run: run({ text: summary }) };
    case "transcript": return { open: base("link"), mode: "ask", query: "Transcript of this video", result: { type: "ai", title: "Transcript" }, run: run({ text: transcript, provider: "Whisper", model: "on this PC" }) };
    case "shelf": return { open: base("image"), result: { type: "note", text: "Saved to your Shelf.", ok: true, undo: { label: "Undo", action: "shelf:remove" } } };
    case "ask": return { open: base("selection"), mode: "ask", query: "What are the three main ideas?", result: { type: "ai", title: "Ask" }, run: run({ status: "running", text: summary.slice(0, 150) }) };
    case "approval":
      return {
        open: base("window"), mode: "ask", query: "Send this to Claude and tidy my windows", result: { type: "ai", title: "Ask" }, provider: { label: "Claude", local: false },
        run: run({ status: "waiting", provider: "Claude", model: "your own key", text: "I can put the notes on the left and the browser on the right.", steps: [{ call_id: "c1", tool: "arrange_windows", args: { layout: "side-by-side", windows: "Notes, Lens Browser", monitor: "Display 1" }, summary: "Arrange Notes and Lens Browser side by side?", risk: "confirm", state: "awaiting" }] as any }),
      };
    default: return { open: base(scene) };
  }
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
let n = 0;
const show = (scene: string, over = {}) => root.render(<div key={++n} data-magic-scene={scene} style={{ position: "fixed", inset: 0 }}><MagicSurface initial={initialFor(scene, over)} /></div>);
show(q.get("scene") || "selection", { label: q.get("label") ?? undefined, text: q.get("text") ?? undefined, url: q.get("url") ?? undefined });
addEventListener("message", (e) => {
  if (e.source !== window.parent || e.data?.lens !== "scene") return;
  show(String(e.data.scene), e.data);
});

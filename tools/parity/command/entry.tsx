// Renders Lens Command in a named scene for screenshots: ?scene=compact|thread|shelf|tool|clipboard|slash&preset=…&w=…
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import { CommandSurface, type CommandInitial } from "../../../src/command/CommandSurface";
import type { ContextChip, ThreadItem } from "../../../src/command/thread";

const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "compact";
const t = Date.now();

const chip = (source: ContextChip["source"], label: string, detail: string, o: Partial<ContextChip> = {}): ContextChip => ({
  key: `${source}-${label}`, source, label, detail, chars: 100, tokens: 25, localOnly: false, value: label, ...o,
});

const answer = `Here's the gist of **“Calm technology”**:

- Good tools live mostly in the **periphery** and move to the centre only when needed.
- They inform without demanding attention, so you stay in flow.
- The smallest amount of technology that solves the problem is usually best.

Next step for Lens: keep Command to one input and one thread, and let \`Esc\` always step back one level.`;

const thread: ThreadItem[] = [
  { kind: "bridge", key: "b1", request: { id: "r1", action: "summarise", title: "Calm Technology — Principles", url: "https://calmtech.com/", selection: "Technology should require the smallest possible amount of attention." }, state: "handled", ts: t },
  { kind: "user", key: "u1", text: "/summarise key points", chips: [chip("page", "Calm Technology — Principles", "4.2k tok", { url: "https://calmtech.com/" })], dest: "Local", ts: t },
  { kind: "answer", key: "a1", reqId: "q1", text: answer, status: "done", provider: "Ollama", model: "llama3.2:3b", tokens: { in: 4210, out: 96 }, ts: t },
  { kind: "action", key: "x1", title: "Saved to Shelf", detail: "Summary — Calm Technology", ok: true, ts: t },
];

const toolThread: ThreadItem[] = [
  { kind: "user", key: "u2", text: "make it nord and start a 25 minute focus session", chips: [], dest: "Script", ts: t },
  { kind: "tool", key: "t1", proposal: { id: "q2", call_id: "c1", tool: "set_theme", args: { pack: "Nord Frost", accent: "keep" }, summary: "Switch theme to Nord Frost", risk: "low" }, state: "done", message: "Theme set.", ts: t },
  { kind: "tool", key: "t2", proposal: { id: "q2", call_id: "c2", tool: "focus_start", args: { minutes: 25, dnd: true, hide_dock_badges: true }, summary: "Start Focus for 25 minutes with Do Not Disturb", risk: "confirm" }, state: "pending", ts: t },
];

const scenes: Record<string, CommandInitial> = {
  compact: { mode: "ask", chips: [chip("selection", "Just copied", "108 chars · 27 tok")] },
  slash: { mode: "ask", text: "/" },
  thread: { mode: "ask", thread, chips: [chip("window", "Q4 planning.docx — Word", "WINWORD"), chip("clip", "API_BASE=https://…", "stays on this PC", { localOnly: true })] },
  shelf: { mode: "ask", thread: thread.slice(1, 3), drawer: true, picked: ["s1", "s3"], chips: [chip("shelf", "2 Shelf items", "4.7k tok")] },
  tool: { mode: "ask", thread: toolThread },
  clipboard: { mode: "clipboard" },
};

ReactDOM.createRoot(document.getElementById("root")!).render(<CommandSurface initial={scenes[scene] ?? scenes.compact} />);

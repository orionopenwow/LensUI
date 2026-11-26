// Renders Lens Command in a named scene for screenshots: ?scene=compact|thread|shelf|tool|clipboard|slash&preset=…&w=…
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import { CommandSurface, type CommandInitial } from "../../../src/command/CommandSurface";
import { EdgeShelfSurface } from "../../../src/command/mini/EdgeShelfSurface";
import { SelectionBar } from "../../../src/magic/selection/SelectionBar";
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

const code = { process: "C:\\Users\\u\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", title: "parse.ts — LensUI" };
const sel = chip("selection", "Selection", "Code", { key: "selection-uia", tokens: 212 });
const miniAnswer: ThreadItem[] = [
  { kind: "user", key: "mu", text: "/explain", chips: [sel], dest: "Local", ts: t },
  { kind: "answer", key: "ma", reqId: "m1", status: "done", provider: "Ollama", model: "llama3.2:3b", ts: t,
    text: "`parseMentions` pulls `@source` tokens out of the input and returns the rest.\n\n- It ignores emails like `me@host.com`.\n- Quoted file paths keep their spaces.\n- Duplicates are dropped." },
];
const miniScenes: Record<string, CommandInitial> = {
  "mini-cursor": { layout: "mini", anchor: "cursor", app: code, chips: [sel] },
  "mini-dock": { layout: "mini", anchor: "dock", app: { process: "C:\\Windows\\explorer.exe", title: "Downloads" } },
  "mini-answer": { layout: "mini", anchor: "cursor", app: code, chips: [sel], thread: miniAnswer },
  "mini-dash": { layout: "mini", anchor: "cursor", app: { process: "C:\\x\\WINWORD.EXE" }, miniTab: "dashboard" },
  "expand-1": { layout: "mini", anchor: "cursor", app: code, chips: [sel], expanding: true },
  "expand-2": { layout: "full", app: code, chips: [sel], thread: miniAnswer },
};

function Desktop({ children, side }: { children: React.ReactNode; side: "right" | "center" }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(135deg, #3b4252, #1f2430 60%, #2a2d36)" }}>
      <div style={{ position: "absolute", left: 32, top: 32, width: 300, height: 180, borderRadius: 10, background: "rgba(255,255,255,0.92)", boxShadow: "0 8px 24px rgba(0,0,0,.3)", font: "13px system-ui", color: "#222", padding: 16, boxSizing: "border-box" }}>
        <b>notes.txt — Notepad</b>
        <p style={{ margin: "12px 0 0", lineHeight: "20px" }}>Ship Command behind a setting, then <span style={{ background: "#b3d4fc" }}>turn it on for the beta channel once parity is green</span>.</p>
      </div>
      {side === "right" ? children : <div style={{ position: "absolute", left: 300, top: 124 }}>{children}</div>}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
if (scene.startsWith("edge-")) {
  const phase = scene === "edge-collapsed" ? "collapsed" : scene === "edge-drop" ? "drop" : "open";
  const box = phase === "collapsed" ? { w: 6, h: 96 } : { w: 300, h: 420 };
  root.render(
    <Desktop side="right">
      <div style={{ position: "absolute", right: phase === "collapsed" ? 0 : 8, top: phase === "collapsed" ? 200 : 40, width: box.w, height: box.h }}>
        <EdgeShelfSurface initial={{ phase, dropped: scene === "edge-hover" ? undefined : undefined }} />
      </div>
    </Desktop>
  );
} else if (scene === "bubble") {
  root.render(
    <Desktop side="center">
      <SelectionBar initial={{ show: { seq: 1, chars: 64, app: "C:\\Windows\\notepad.exe", category: "notes", cut: true, copy: true, paste: false, pastePreview: false, editable: true, smart: null } }} />
    </Desktop>
  );
} else if (miniScenes[scene]) {
  const mini = miniScenes[scene].layout === "mini";
  root.render(
    mini ? (
      <Desktop side="right">
        <div style={{ position: "absolute", left: scene === "mini-dock" ? 132 : 252, top: scene === "mini-dock" ? 24 : 120, width: 376, height: 456 }}>
          <CommandSurface initial={miniScenes[scene]} />
        </div>
        {scene === "mini-dock" ? <div style={{ position: "absolute", left: 120, right: 120, bottom: 8, height: 56, borderRadius: 16, background: "rgba(20,20,24,.85)", border: "1px solid rgba(255,255,255,.12)" }} /> : null}
      </Desktop>
    ) : (
      <CommandSurface initial={miniScenes[scene]} />
    )
  );
} else {
  root.render(<CommandSurface initial={scenes[scene] ?? scenes.compact} />);
}

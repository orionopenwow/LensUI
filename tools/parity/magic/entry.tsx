// Magic right-click window scenes on a mock desktop: ?scene=<name>&preset=<pack>
// Scenes: selection link image file window desktop dockItem ask approval confirm flip card
//         lensMenu lensRowFocus lensPanned (the "Lens ›" row in a Lens right-click menu)
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import { MagicSurface, type MagicInitial } from "../../../src/magic/MagicSurface";
import { MagicCard } from "../../../src/components/MagicCard";
import { LensContextMenu } from "../../../src/magic/LensContextMenu";
import { Check, ClipboardCopy, Pin, Trash2 } from "lucide-react";
import { previewOpen } from "../../../src/magic/previews";
import { DEFAULT_MAGIC } from "../../../src/magic/contract";
import type { AiRunState } from "../../../src/ai/contract";
import type { LensConfig } from "../../../src/types/lens";
import { SelectionBar } from "../../../src/magic/selection/SelectionBar";
import { MagicSearch, type MagicSearchInitial } from "../../../src/magic/search/MagicSearch";

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

// ---- Magic selection bar and Magic Search (docs/plans/SELECTION_BAR.md) ----------------------
const barShow = (o: Record<string, unknown> = {}) =>
  ({ seq: 1, chars: 86, app: "C:\\Program Files\\Microsoft Office\\WINWORD.EXE", category: "office", cut: true, copy: true, paste: true, pastePreview: true, editable: true, smart: null, ...o }) as never;
const barScenes: Record<string, React.ComponentProps<typeof SelectionBar>["initial"]> = {
  selbar: { show: barShow() },
  selbarSmart: { show: barShow({ smart: { kind: "quantity", preview: "≈ 7.77 mi", value: "12.5 km in mi", action: "smart:convert" } }), settings: { hotkeys: { translate: "Ctrl+Alt+T" } } },
  selbarAlways: { show: barShow({ cut: false, paste: false, editable: false }), settings: { labels: "always", hotkeys: { translate: "Ctrl+Alt+T" } } },
  selbarMore: { show: barShow(), more: true },
};
const webStub = {
  results: [
    { title: "Calm technology", url: "https://calmtech.com/", snippet: "Technology should require the smallest possible amount of attention, and inform without overburdening.", site: "calmtech.com", favicon: "", sources: ["duckduckgo", "wikipedia"] },
    { title: "Calm technology — Wikipedia", url: "https://en.wikipedia.org/wiki/Calm_technology", snippet: "A type of information technology where the interaction between the technology and its user is designed to occur in the periphery.", site: "en.wikipedia.org", favicon: "", sources: ["wikipedia"] },
    { title: "Designing Calm Technology (Weiser & Brown, 1995)", url: "https://people.csail.mit.edu/rudolph/Teaching/weiser.pdf", snippet: "The most potentially interesting, challenging and profound change implied by ubiquitous computing.", site: "people.csail.mit.edu", favicon: "", sources: ["duckduckgo"] },
    { title: "Principles of Calm Technology", url: "https://www.caseorganic.com/calm", snippet: "Eight principles for technology that respects attention.", site: "caseorganic.com", favicon: "", sources: ["duckduckgo"] },
  ],
  sources: [
    { id: "duckduckgo", label: "DuckDuckGo", host: "html.duckduckgo.com", ok: true, count: 3, error: null },
    { id: "wikipedia", label: "Wikipedia", host: "en.wikipedia.org", ok: true, count: 2, error: null },
  ],
  engineUrl: "https://duckduckgo.com/?q=calm+technology",
  engineName: "DuckDuckGo",
  stub: false,
};
const msOpen = (o: Record<string, unknown> = {}) => ({ seq: 1, query: "calm technology", action: null, app: "C:\\x\\WINWORD.EXE", editable: true, origin: null, above: false, atMs: 0, ...o }) as never;
const msScenes: Record<string, MagicSearchInitial> = {
  msearch: {
    open: msOpen(),
    web: webStub as never,
    provider: "Ollama · llama3.2:3b",
    answer: "Calm technology is design that stays in the periphery of your attention and moves to the centre only when it's needed [1]. The idea comes from Mark Weiser and John Seely Brown at Xerox PARC [3], and is often summed up as technology that informs without demanding attention [2].",
    local: [
      { kind: "shelf", id: "s1", title: "Calm technology — principles", detail: "Saved from calmtech.com" },
      { kind: "file", id: "f1", title: "calm-tech-notes.md", detail: "C:\\Users\\you\\Documents\\calm-tech-notes.md" },
    ],
  },
  msearchAction: { open: msOpen({ query: "Wir sehen uns morgen um zehn im Büro.", action: "translate", editable: true }), provider: "Ollama · llama3.2:3b", answer: "See you tomorrow at ten in the office." },
  msearchSide: { open: msOpen(), web: webStub as never, side: true, provider: "Claude · claude-sonnet", answer: "A short answer [1].", thread: [{ q: "Who coined it?", a: "" }] },
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
const lensScenes = ["lensMenu", "lensRowFocus", "lensPanned"];
if (barScenes[scene]) {
  root.render(
    <Desktop cursor={[272, 112]} box={[252, 136]}>
      <SelectionBar initial={barScenes[scene]} />
    </Desktop>,
  );
} else if (msScenes[scene]) {
  const side = scene === "msearchSide";
  root.render(
    <Desktop cursor={side ? [300, 112] : [700, 590]} box={side ? [560, 0] : [252, 134]}>
      <div className="parity-ms" style={{ width: side ? 440 : 420, height: side ? 640 : 520 }}>
        <MagicSearch initial={msScenes[scene]} />
      </div>
    </Desktop>,
  );
} else if (lensScenes.includes(scene)) {
  const icon = (I: typeof Check) => <I size={14} strokeWidth={2.4} aria-hidden />;
  root.render(
    <Desktop cursor={[400, 92]} box={[408, 100]}>
      <LensContextMenu
        at={{ x: 408, y: 100 }}
        item={{ kind: "shelfItem", id: "s1", label: "Calm technology — principles", path: null }}
        initialPanned={scene === "lensPanned"}
        onClose={() => {}}
        actions={[
          { id: "use", label: "Use as context", icon: icon(Check), onSelect: () => {} },
          { id: "copy", label: "Copy", icon: icon(ClipboardCopy), onSelect: () => {} },
          { id: "pin", label: "Pin", icon: icon(Pin), onSelect: () => {} },
          { id: "remove", label: "Remove", danger: true, icon: icon(Trash2), onSelect: () => {} },
        ]}
      />
    </Desktop>,
  );
  if (scene === "lensRowFocus") setTimeout(() => document.querySelector<HTMLElement>(".lens-pan-row")?.focus(), 50);
} else if (scene === "card") {
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

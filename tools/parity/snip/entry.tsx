// Renders Lens Snip scenes for screenshots:
// ?scene=select|select-window|studio|studio-livetext|studio-crop|studio-claude|studio-translate|studio-openin|studio-frame|pin|record|history|history-undo|history-empty|card&preset=…
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import "../../../src/snip/snip.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { Select } from "../../../src/snip/Select";
import { Studio } from "../../../src/snip/Studio";
import { Pin } from "../../../src/snip/Pin";
import { RecBar, RecBorder } from "../../../src/snip/Record";
import { HistoryView } from "../../../src/snip/HistoryView";
import { SnipCard } from "../../../src/components/SnipCard";
import { empty, reduce, type History } from "../../../src/snip/annotations";
import { DEFAULT_SNIP_SETTINGS, type Analysis, type SessionInfo, type SnipEntry, type SnipInfo } from "../../../src/snip/api";
import type { Suggestion } from "../../../src/types/generated";
import type { AiStatus } from "../../../src/ai/contract";

const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "studio";
const VW = 1280;
const VH = 800;

// ---- a synthetic desktop with text worth hiding ------------------------------------------------
interface Drawn {
  frame: string;
  win1: { x: number; y: number; w: number; h: number };
  win2: { x: number; y: number; w: number; h: number };
  words: { text: string; rect: { x: number; y: number; w: number; h: number } }[][];
}

function paintDesktop(): Drawn {
  const c = document.createElement("canvas");
  c.width = VW;
  c.height = VH;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, VW, VH);
  bg.addColorStop(0, "#1e293b");
  bg.addColorStop(0.55, "#312e81");
  bg.addColorStop(1, "#0f172a");
  g.fillStyle = bg;
  g.fillRect(0, 0, VW, VH);
  // Window 2: dark code editor (behind).
  const win2 = { x: 700, y: 250, w: 520, h: 420 };
  g.fillStyle = "#1e1e2e";
  rr(g, win2.x, win2.y, win2.w, win2.h, 8);
  g.fill();
  g.fillStyle = "#11111b";
  g.fillRect(win2.x, win2.y, win2.w, 32);
  g.font = "13px Consolas, monospace";
  const code = ["fn main() {", "    let key = env::var(\"LENS_KEY\")?;", "    serve(\"10.0.0.12:443\", key)", "}"];
  code.forEach((l, i) => {
    g.fillStyle = ["#cba6f7", "#cdd6f4", "#a6e3a1", "#cba6f7"][i];
    g.fillText(l, win2.x + 24, win2.y + 64 + i * 22);
  });
  // Window 1: a light "web page" with sensitive text.
  const win1 = { x: 60, y: 60, w: 760, h: 480 };
  g.save();
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 32;
  g.fillStyle = "#ffffff";
  rr(g, win1.x, win1.y, win1.w, win1.h, 8);
  g.fill();
  g.restore();
  g.fillStyle = "#f1f5f9";
  g.fillRect(win1.x, win1.y, win1.w, 40);
  g.fillStyle = "#e2e8f0";
  rr(g, win1.x + 120, win1.y + 8, 420, 24, 12);
  g.fill();
  g.fillStyle = "#64748b";
  g.font = "12px Segoe UI, system-ui, sans-serif";
  g.fillText("admin.example.com/settings/api", win1.x + 136, win1.y + 24);
  g.fillStyle = "#0f172a";
  g.font = "600 22px Segoe UI, system-ui, sans-serif";
  g.fillText("Account settings", win1.x + 40, win1.y + 92);
  g.font = "15px Segoe UI, system-ui, sans-serif";
  const lines = [
    ["Owner:", "jane.doe@example.com"],
    ["Phone:", "+1", "415", "555", "0142"],
    ["API", "key:", "sk-proj-9fQ2mZ7pL4vB8nR1tY6wE3sD"],
    ["Webhook", "server:", "10.20.30.40:8080"],
    ["Plan:", "Team", "·", "12", "seats", "·", "renews", "1", "March"],
  ];
  const words: Drawn["words"] = [];
  lines.forEach((ws, li) => {
    let x = win1.x + 40;
    const y = win1.y + 140 + li * 40;
    const line: Drawn["words"][number] = [];
    ws.forEach((w) => {
      g.fillStyle = w.includes("@") || w.startsWith("sk-") ? "#2563eb" : "#334155";
      g.fillText(w, x, y);
      const m = g.measureText(w).width;
      // Rects relative to window 1 (the snip).
      line.push({ text: w, rect: { x: x - win1.x, y: y - 15 - win1.y, w: Math.ceil(m), h: 20 } });
      x += m + 6;
    });
    words.push(line);
  });
  g.fillStyle = "#e2e8f0";
  g.fillRect(win1.x + 40, win1.y + 360, 680, 1);
  g.fillStyle = "#2563eb";
  rr(g, win1.x + 40, win1.y + 390, 140, 36, 8);
  g.fill();
  g.fillStyle = "#fff";
  g.font = "600 14px Segoe UI, system-ui, sans-serif";
  g.fillText("Rotate key", win1.x + 72, win1.y + 413);
  // A dock.
  g.fillStyle = "rgba(15,15,20,0.75)";
  rr(g, VW / 2 - 220, VH - 64, 440, 52, 16);
  g.fill();
  ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6"].forEach((col, i) => {
    g.fillStyle = col;
    rr(g, VW / 2 - 196 + i * 60, VH - 54, 36, 36, 9);
    g.fill();
  });
  return { frame: c.toDataURL("image/png"), win1, win2, words };
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function cropDataUrl(src: string, r: { x: number; y: number; w: number; h: number }): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = r.w;
      c.height = r.h;
      c.getContext("2d")!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      res(c.toDataURL("image/png"));
    };
    img.src = src;
  });
}

const union = (ws: { rect: { x: number; y: number; w: number; h: number } }[]) => {
  const x = Math.min(...ws.map((w) => w.rect.x));
  const y = Math.min(...ws.map((w) => w.rect.y));
  return { x: x - 3, y: y - 3, w: Math.max(...ws.map((w) => w.rect.x + w.rect.w)) - x + 6, h: Math.max(...ws.map((w) => w.rect.y + w.rect.h)) - y + 6 };
};

const Gallery: React.FC = () => {
  useLensState();
  const [d, setD] = useState<Drawn | null>(null);
  const [snip, setSnip] = useState<SnipInfo | null>(null);
  useEffect(() => {
    const drawn = paintDesktop();
    setD(drawn);
    cropDataUrl(drawn.frame, drawn.win1).then((png) =>
      setSnip({ id: "snip-demo", w: drawn.win1.w, h: drawn.win1.h, png, screenRect: drawn.win1, sourceApp: "Msedge", sourceTitle: "Account settings — Microsoft Edge" })
    );
  }, []);
  if (!d || !snip) return null;

  const session: SessionInfo = {
    id: "session-demo",
    mode: scene === "select-window" ? "window" : "region",
    origin: { x: 0, y: 0, w: VW, h: VH },
    monitors: [{ id: "mon-0", rect: { x: 0, y: 0, w: VW, h: VH }, scale: 1, primary: true }],
    windows: [
      { hwnd: 1, rect: d.win1, title: "Account settings — Microsoft Edge", app: "Msedge", exe: "C:\\x\\msedge.exe" },
      { hwnd: 2, rect: d.win2, title: "main.rs — LensUI", app: "Code", exe: "C:\\x\\Code.exe" },
    ],
    frame: d.frame,
    sourceApp: "Msedge",
    lastRegion: null,
  };

  const W = d.words;
  const suggestions: Suggestion[] = [
    { kind: "email", label: "Email address", rect: union([W[0][1]]), confidence: 0.95, preview: "ja•••om" },
    { kind: "phone", label: "Phone number", rect: union(W[1].slice(1)), confidence: 0.8, preview: "+1•••42" },
    { kind: "secret", label: "Key or token", rect: union([W[2][2]]), confidence: 0.95, preview: "sk•••sD" },
    { kind: "ip", label: "IP address", rect: union([W[3][2]]), confidence: 0.7, preview: "10•••80" },
  ];
  const ocrText = W.map((l) => l.map((w) => w.text).join(" ")).join("\n");
  const analysis: Analysis = {
    ocr: { language: "en-US", text: `Account settings\n${ocrText}\nRotate key`, lines: W.map((l) => ({ words: l })) },
    suggestions,
    error: null,
  };
  let hist: History = empty();
  hist = reduce(hist, { type: "redact", rects: [{ rect: suggestions[0].rect, label: "Email address" }, { rect: suggestions[2].rect, label: "Key or token" }] });
  hist = reduce(hist, { type: "add", shape: { id: "a1", kind: "box", rect: { x: 32, y: 368, w: 156, h: 66 }, color: "#ef4444", width: 4 } });
  hist = reduce(hist, { type: "add", shape: { id: "a2", kind: "arrow", x1: 340, y1: 430, x2: 200, y2: 404, color: "#ef4444", width: 4 } });
  hist = reduce(hist, { type: "add", shape: { id: "a3", kind: "step", x: 22, y: 220, n: 0, color: "#3b82f6" } });
  hist = reduce(hist, { type: "add", shape: { id: "a4", kind: "step", x: 210, y: 404, n: 0, color: "#3b82f6" } });
  hist = reduce(hist, { type: "add", shape: { id: "a5", kind: "text", x: 352, y: 418, text: "Rotate this key first", size: 18, color: "#ef4444" } });

  const ai: AiStatus = {
    providers: [
      { id: "local", kind: "local", label: "Ollama · llama3.2", available: true, model: "llama3.2:3b", is_local: true, needs_key: false, has_key: false },
      { id: "claude", kind: "claude", label: "Claude", available: true, model: "claude-sonnet-5-5", is_local: false, needs_key: true, has_key: true },
    ],
    active: "local",
    privacy: "ask_each_time",
  };
  const area = { x: 24, y: 24, w: VW - 48, h: VH - 48 };
  const base = { info: snip, ai, area, analysis, onClose: () => {}, onNew: () => {} };

  const desktop = (children?: React.ReactNode) => (
    <div style={{ position: "fixed", inset: 0, background: `url(${d.frame}) 0 0 / ${VW}px ${VH}px` }}>{children}</div>
  );

  switch (scene) {
    case "select":
      return <Select session={session} initialMode="region" delay={0} onDelay={() => {}} cursor={false} onCursor={() => {}} onDone={() => {}} onCancel={() => {}} demo={{ rect: { x: 92, y: 170, w: 420, h: 196 }, pointer: { x: 236, y: 196 } }} />;
    case "select-window":
      return <Select session={session} initialMode="window" delay={3} onDelay={() => {}} cursor onCursor={() => {}} onDone={() => {}} onCancel={() => {}} demo={{ pointer: { x: 900, y: 420 } }} />;
    case "studio":
      return desktop(<div className="snip-root"><Studio {...base} settings={DEFAULT_SNIP_SETTINGS} demo={{ history: hist, focus: 0 }} /></div>);
    case "studio-livetext": {
      // Live text: two lines selected (the bar follows them), chips for what was found, and the
      // "Copied" notice. One redaction stays on, so its word reads as dots in the text panel.
      let h: History = empty();
      h = reduce(h, { type: "redact", rects: [{ rect: suggestions[2].rect, label: "Key or token" }] });
      return desktop(<div className="snip-root"><Studio {...base} settings={DEFAULT_SNIP_SETTINGS} demo={{ history: h, focus: 1, tool: "livetext", textSel: { anchor: { line: 3, word: 0 }, focus: { line: 4, word: 4 } }, toast: "Copied 8 words" }} /></div>);
    }
    case "studio-crop": {
      // A crop while editing: the whole frame stays, the part cut away is dimmed, and the text
      // panel lists only what is kept.
      let h: History = reduce(hist, { type: "crop", rect: { x: 20, y: 110, w: 520, h: 150 } });
      h = reduce(h, { type: "add", shape: { id: "c1", kind: "highlight", rect: { x: 36, y: 162, w: 150, h: 26 }, color: "#facc15" } });
      return desktop(<div className="snip-root"><Studio {...base} settings={DEFAULT_SNIP_SETTINGS} demo={{ history: h, focus: 0 }} /></div>);
    }
    case "studio-claude":
      return desktop(<div className="snip-root"><Studio {...base} settings={DEFAULT_SNIP_SETTINGS} demo={{ history: hist, popover: "claude", focus: 5 }} /></div>);
    case "studio-translate":
      return desktop(<div className="snip-root"><Studio {...base} settings={DEFAULT_SNIP_SETTINGS} demo={{ history: hist, popover: "translate", focus: 7 }} /></div>);
    case "studio-openin":
      return desktop(<div className="snip-root"><Studio {...base} settings={DEFAULT_SNIP_SETTINGS} demo={{ history: hist, popover: "openIn", focus: 9, toast: "Image copied — paste it in Discord with Ctrl+V, then send it yourself." }} /></div>);
    case "studio-frame":
      return desktop(<div className="snip-root"><Studio {...base} settings={{ ...DEFAULT_SNIP_SETTINGS, beautify: "vivid" }} demo={{ history: hist, focus: 2, toast: "Saved — C:\\Users\\u\\Pictures\\Screenshots\\Lens\\Lens Snip 2026-11-22 at 13.12.04.png" }} /></div>);
    case "pin":
      return desktop(
        <div className="pin-demo" style={{ position: "absolute", left: 760, top: 96, width: 400, height: 253, transform: "translateZ(0)", borderRadius: 8, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,.5)" }}>
          <Pin label="snip-pin-1" demo={{ png: snip.png, w: snip.w, h: snip.h, opacity: 0.92, clickThrough: false, title: snip.sourceTitle }} />
        </div>
      );
    case "record": {
      const r = { x: 80, y: 120, w: 720, h: 440 };
      return desktop(
        <>
          <div style={{ position: "absolute", left: r.x - 4, top: r.y - 4, width: r.w + 8, height: r.h + 8, transform: "translateZ(0)" }}>
            <RecBorder />
          </div>
          <div style={{ position: "absolute", left: r.x + r.w / 2 - 110, top: r.y - 52, width: 220, height: 40, transform: "translateZ(0)" }}>
            <RecBar demo={{ recording: true, elapsedMs: 83_000, path: "C:\\Users\\u\\Videos\\Lens\\Lens Recording.mp4", message: "Recording" }} />
          </div>
          <div style={{ position: "absolute", left: r.x + r.w / 2 - 180, top: r.y + r.h + 24, width: 360, height: 40, transform: "translateZ(0)" }}>
            <RecBar demo={{ recording: false, elapsedMs: 83_000, path: "C:\\Users\\u\\Videos\\Lens\\Lens Recording 2026-11-22 at 13.20.11.mp4", message: "Saved" }} />
          </div>
        </>
      );
    }
    case "history":
    case "history-undo":
    case "history-empty": {
      const entries: SnipEntry[] = [
        ["Account settings — Microsoft Edge", "Msedge", "Owner Phone API key", ["work"], true],
        ["main.rs — LensUI", "Code", "fn main let key env var", ["code", "bug"], false],
        ["Design review — Figma", "Figma", "Lens Snip pre-save studio", [], false],
        ["Inbox — Outlook", "Olk", "Invoice due Friday", ["billing"], false],
        ["#design — Discord", "Discord", "ship it", [], false],
        ["Terminal", "WindowsTerminal", "error[E0599] no method named", ["bug"], false],
      ].map(([t, a, o, tags, pinned], i) => ({
        id: `h${i}`, createdMs: Date.now() - i * 5_400_000, w: 760 - i * 40, h: 480 - i * 20, kind: "image", sourceApp: a as string, windowTitle: t as string,
        ocrText: o as string, tags: tags as string[], pinned: pinned as boolean, file: "", bytes: 0, thumb: i % 2 ? d.frame : snip.png,
      }));
      return desktop(
        <div style={{ position: "absolute", left: 120, top: 80, width: 760, padding: 16, borderRadius: 14, background: "var(--lens-bg-surface)", border: "1px solid var(--lens-border)" }}>
          <div className="cc-label" style={{ marginBottom: 8 }}>Snip history</div>
          <HistoryView demo={scene === "history-empty" ? [] : entries} demoPending={scene === "history-undo" ? ["h1", "h4"] : undefined} />
        </div>
      );
    }
    case "card":
      return (
        <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
          <SnipCard demo={{ settings: { ...DEFAULT_SNIP_SETTINGS, enabled: true, printScreen: true }, ocrLanguages: ["en-US", "de-DE"], canRecord: true, hotkeyOk: true, printScreenOwned: true, message: "", recording: false }} />
        </div>
      );
    default:
      return null;
  }
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Gallery />);

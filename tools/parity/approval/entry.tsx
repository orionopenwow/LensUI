// "Needs your OK" in every preview type: ?scene=look|window|settings|element|compact|hold|done|blocked|pill&preset=…
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import { ApprovalCard } from "../../../src/approval/ApprovalCard";
import { PendingPill } from "../../../src/approval/PendingPill";
import type { ApprovalPreview, ApprovalRequest, TaskItem } from "../../../src/approval/model";
import { lighten, packById } from "../../../src/themes/packs";

const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "look";
const preset = p.get("preset") || "obsidian";

// Paint the page in the chosen theme pack (what useLensState does at runtime).
const root = document.documentElement;
const pack = packById(preset);
root.dataset.preset = preset;
root.dataset.scheme = pack?.scheme ?? "dark";
if (pack?.base) {
  root.style.setProperty("--lens-pack-base", pack.base);
  root.style.setProperty("--lens-pack-elevated", pack.scheme === "light" ? "#FFFFFF" : lighten(pack.base, 0.045));
}
root.style.setProperty("--lens-accent", pack?.accent ?? "#fafafa");
root.style.setProperty("--lens-radius", `${pack?.radius ?? 8}px`);

const tasks = (used: string[], asks: string[] = ["change_look", "arrange_windows", "launch_apps", "close_apps", "use_shelf", "change_settings"]): TaskItem[] =>
  [
    ["read_settings", "Read your Lens settings and open windows", "allowed"],
    ["change_look", "Change the look (theme, dock, borders, wallpaper)", "ask"],
    ["arrange_windows", "Move, snap, minimise and arrange windows", "ask"],
    ["launch_apps", "Open and switch apps", "ask"],
    ["close_apps", "Close apps", "ask"],
    ["use_shelf", "Read and add to your Shelf", "ask"],
    ["change_settings", "Change Lens settings and behaviour", "ask"],
    ["destructive", "Delete files, use passwords or pay", "blocked"],
  ].map(([id, label, level]) => ({ id, label, level: (asks.includes(id) || level !== "ask" ? level : "allowed") as TaskItem["level"], used: used.includes(id) }));

const now = Date.now();
const look: ApprovalPreview = {
  question: "Apply 3 changes to your desktop?",
  reason: "Claude Desktop wants to change 3 settings (Theme pack, Dock style, Dim inactive windows).",
  verb: "Apply",
  kind: "look",
  look: {
    before: { pack: "obsidian", dockStyle: "floating", dim: 0, radius: 8, accentMode: "custom", accent: "#fafafa" },
    after: { pack: "nord-frost", dockStyle: "slim", dim: 20, radius: 10, accentMode: "custom", accent: "#88c0d0" },
  },
  details: [
    { label: "Theme pack", value: "obsidian → nord-frost" },
    { label: "Dock style", value: "floating → slim" },
    { label: "Dim inactive windows", value: "0 → 20" },
  ],
  reversible: true,
  risk: "low",
  capabilities: ["change_look"],
  taskList: tasks(["change_look"]),
};

// A neutral, unbranded form capture for the "element" preview (what the browser agent provides).
const elementSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='520' height='170'><rect width='520' height='170' fill='#fff'/><text x='20' y='34' font-family='Arial' font-size='16' font-weight='700' fill='#111'>Confirm your booking</text><text x='20' y='56' font-family='Arial' font-size='12' fill='#555'>Table for 4 · Fri 8:00 PM</text><rect x='20' y='72' width='150' height='30' rx='4' fill='none' stroke='#ccc'/><text x='28' y='92' font-family='Arial' font-size='12' fill='#333'>Sam W.</text><rect x='180' y='72' width='150' height='30' rx='4' fill='none' stroke='#ccc'/><text x='188' y='92' font-family='Arial' font-size='12' fill='#333'>sam@…</text><rect x='16' y='112' width='170' height='40' rx='8' fill='none' stroke='#e8b04b' stroke-width='3'/><rect x='20' y='116' width='162' height='32' rx='6' fill='#d6404b'/><text x='42' y='137' font-family='Arial' font-size='13' font-weight='700' fill='#fff'>Complete booking</text></svg>`;

const previews: Record<string, { pv: ApprovalPreview; origin?: ApprovalRequest["origin"]; source?: string; site?: string; compact?: boolean; initial?: any }> = {
  look: { pv: look },
  window: {
    pv: {
      question: "Close \"Report.docx — Word\"?",
      reason: "Claude Code wants to close \"Report.docx — Word\".",
      verb: "Close",
      kind: "window",
      window: { hwnd: 101, title: "Report.docx — Word", app: "WINWORD" },
      details: [
        { label: "App", value: "WINWORD" },
        { label: "Window", value: "Report.docx — Word" },
        { label: "Note", value: "The app may ask to save first." },
      ],
      reversible: false,
      risk: "confirm",
      holdToConfirm: true,
      capabilities: ["close_apps"],
      taskList: tasks(["close_apps"]),
    },
    source: "Claude Code",
  },
  settings: {
    pv: {
      question: "Change hot corners to on?",
      reason: "Lens assistant wants to set Hot corners to on.",
      verb: "Apply",
      kind: "settings",
      details: [
        { label: "Hot corners", value: "off → on" },
        { label: "Top-left corner", value: "(none) → overview" },
      ],
      reversible: true,
      risk: "low",
      capabilities: ["change_settings"],
      taskList: tasks(["change_settings"], []),
    },
    origin: "ai",
    source: "Lens assistant",
  },
  element: {
    pv: {
      question: "Book a table for 4 on Friday?",
      reason: "They charge $25 a person if you don't show, so I stopped before booking.",
      verb: "Book table",
      kind: "element",
      element: { image: `data:image/svg+xml;utf8,${encodeURIComponent(elementSvg)}`, label: "Complete booking", capturedAgo: "2s ago" },
      details: [
        { label: "When", value: "Fri · 8:00 PM" },
        { label: "Party", value: "4 · one vegan" },
        { label: "No-show", value: "$25 a person" },
        { label: "Cancel", value: "Free until Thu 8:00 PM" },
      ],
      reversible: false,
      risk: "confirm",
      holdToConfirm: true,
      capabilities: ["type_text"],
      taskList: [
        { id: "fill", label: "Search and fill forms on this site", level: "allowed", used: true },
        { id: "read", label: "Read your calendar and notes", level: "allowed", used: false },
        { id: "pay", label: "Book with a no-show fee", level: "ask", used: true },
      ],
    },
    origin: "browser",
    source: "Lens browser",
    site: "booking.example",
  },
  compact: { pv: { ...look, details: look.details.slice(0, 2) }, compact: true, origin: "voice", source: "Voice" },
  hold: { pv: { ...look, risk: "confirm", holdToConfirm: true, question: "Hide the Windows taskbar?", kind: "settings", look: undefined, details: [{ label: "Hide Windows taskbar", value: "off → on" }], reason: "Claude Desktop wants to hide the Windows taskbar while Lens runs.", capabilities: ["change_settings"], taskList: tasks(["change_settings"]) }, initial: { phase: "holding", progress: 0.62 } },
  done: { pv: look, initial: { phase: "done", message: "Applied 3 changes. Undo id: undo-4.", collapsed: true } },
  blocked: { pv: { ...look, risk: "blocked", question: "Turn on AI access for every app?", reason: "An AI app tried to change its own permissions.", kind: "settings", look: undefined, details: [{ label: "MCP server", value: "Lens never lets an AI change this" }], capabilities: ["destructive"], taskList: tasks([], []) } },
};

const desk = (children: React.ReactNode) => (
  <div style={{ minHeight: "100vh", boxSizing: "border-box", padding: 24, display: "flex", justifyContent: "center", alignItems: "flex-start", background: "linear-gradient(150deg, color-mix(in srgb, var(--lens-pack-base, #08080b) 70%, #3b4252), var(--lens-pack-base, #08080b))" }}>
    {children}
  </div>
);

const app = ReactDOM.createRoot(document.getElementById("root")!);
if (scene === "pill") {
  app.render(
    desk(
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, height: 36, padding: "0 12px", borderRadius: 12, background: "var(--lens-bg-base)", border: "1px solid rgb(var(--lens-ink) / 0.1)", color: "var(--lens-fg)", font: "12px var(--font-sans)" }}>
          <span>Tue 18:02</span>
          <PendingPill count={1} onOpen={() => undefined} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, height: 56, padding: "0 16px", borderRadius: 16, background: "var(--lens-bg-base)", border: "1px solid rgb(var(--lens-ink) / 0.1)" }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ width: 36, height: 36, borderRadius: 10, background: "rgb(var(--lens-ink) / 0.12)" }} />
          ))}
          <PendingPill count={3} onOpen={() => undefined} />
        </div>
      </div>
    )
  );
} else {
  const s = previews[scene] ?? previews.look;
  const req: ApprovalRequest = { id: scene, origin: s.origin ?? "mcp", source: s.source ?? "Claude Desktop", site: s.site, createdMs: now - 4000, preview: s.pv };
  app.render(desk(<ApprovalCard request={req} compact={s.compact} initial={s.initial} onApprove={() => true} onDeny={() => undefined} onAllowSession={() => undefined} onUndo={() => undefined} />));
}

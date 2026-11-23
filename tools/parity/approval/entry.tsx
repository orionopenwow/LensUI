// "Needs your OK" in every preview type: ?scene=look|window|settings|element|compact|hold|done|blocked|pill&preset=…
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import { ApprovalCard } from "../../../src/approval/ApprovalCard";
import { PendingPill } from "../../../src/approval/PendingPill";
import { NoAccessNote } from "../../../src/approval/NoSourceBadge";
import { PermissionsCard } from "../../../src/approval/PermissionsCard";
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

const tasks = (used: string[], asks: string[] = ["change_look", "arrange_windows", "launch_apps", "close_apps", "use_shelf", "change_settings", "delete_to_bin", "send_messages", "type_text"]): TaskItem[] =>
  [
    ["read_settings", "Read your Lens settings and open windows", "allowed"],
    ["change_look", "Change the look (theme, dock, borders, wallpaper)", "ask"],
    ["arrange_windows", "Move, snap, minimise and arrange windows", "ask"],
    ["launch_apps", "Open and switch apps", "ask"],
    ["close_apps", "Close apps", "ask"],
    ["use_shelf", "Read and add to your Shelf", "ask"],
    ["change_settings", "Change Lens settings and behaviour", "ask"],
    ["delete_to_bin", "Delete or clear things (to the Bin)", "ask"],
    ["payments", "Pay with a saved method", "blocked"],
    ["send_messages", "Send messages in your name", "ask"],
    ["type_text", "Fill in forms and click on sites", "ask"],
    ["destructive", "Delete permanently, use passwords or card numbers", "blocked"],
  ].map(([id, label, level]) => ({ id, label, level: (asks.includes(id) || level !== "ask" ? level : "allowed") as TaskItem["level"], used: used.includes(id) }));
const ask = (list: TaskItem[], id: string): TaskItem[] => list.map((t) => (t.id === id ? { ...t, level: "ask" } : t));

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


const formSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='520' height='150'><rect width='520' height='150' fill='#fafafa'/><text x='16' y='28' font-family='Arial' font-size='14' font-weight='700' fill='#111'>Complete your reservation</text><text x='16' y='46' font-family='Arial' font-size='11' fill='#666'>Harbour Kitchen · Fri 3 Oct · 20:00 · 4 people</text><rect x='16' y='58' width='152' height='26' rx='3' fill='#fff' stroke='#d4d4d8'/><text x='24' y='75' font-family='Arial' font-size='11' fill='#333'>Sam W.</text><rect x='176' y='58' width='152' height='26' rx='3' fill='#fff' stroke='#d4d4d8'/><text x='184' y='75' font-family='Arial' font-size='11' fill='#333'>sam@…</text><rect x='336' y='58' width='168' height='26' rx='3' fill='#fff' stroke='#d4d4d8'/><text x='344' y='75' font-family='Arial' font-size='11' fill='#333'>••• ••4821</text><rect x='13' y='95' width='158' height='38' rx='7' fill='none' stroke='#e8b04b' stroke-width='3'/><rect x='17' y='99' width='150' height='30' rx='5' fill='#d6404b'/><text x='32' y='119' font-family='Arial' font-size='11' font-weight='700' fill='#fff'>Complete reservation</text></svg>`;
const formImg = `data:image/svg+xml;utf8,${encodeURIComponent(formSvg)}`;

const variants: typeof previews = {
  delete: {
    pv: {
      question: "Delete 2,315 emails older than 30 days?",
      verb: "Delete",
      kind: "delete",
      bulk: { count: 2315, reviewLabel: "Review all 2,318" },
      details: [
        { label: "Includes", value: "1,904 newsletters & promotions · 411 alerts" },
        { label: "Keeping", value: "3 threads · flight, lease, tax receipt" },
        { label: "Account", value: "Sam W. · sam@…" },
        { label: "Recovery", value: "Goes to Bin · restorable for 30 days" },
      ],
      reversible: true,
      risk: "confirm",
      tone: "danger",
      capabilities: ["delete_to_bin"],
      taskList: tasks(["delete_to_bin"]),
    },
    origin: "browser",
    source: "Lens browser",
    site: "mail.example.com",
  },
  payment: {
    pv: {
      question: "Pay the $84 fare difference?",
      reason: "Flight 1357 was cancelled. Flight 1359 leaves tomorrow at 10:40 and still fits your trip.",
      verb: "Pay",
      kind: "payment",
      payment: { amount: "$84.00", method: "Amex ··1007", note: "charged now", warning: "Non-refundable once ticketed" },
      details: [],
      reversible: false,
      risk: "confirm",
      tone: "trusted",
      capabilities: ["payments"],
      taskList: ask(tasks(["payments"]), "payments"),
    },
    origin: "browser",
    source: "Lens browser",
    site: "flights.example",
  },
  send: {
    pv: {
      question: "Send this to Maya?",
      verb: "Send",
      kind: "send",
      send: { to: "Maya", app: "Messages", message: "We're inside now, rain's coming. Saturday 2:00 at Harbour Kitchen is still on." },
      details: [],
      reversible: false,
      risk: "confirm",
      tone: "trusted",
      holdToConfirm: false,
      capabilities: ["send_messages"],
      taskList: tasks(["send_messages"]),
    },
    origin: "browser",
    source: "Lens browser",
    site: "chat.example",
  },
  click: {
    pv: {
      question: "Book a table for 4 at Harbour Kitchen?",
      verb: "Book",
      kind: "element",
      element: { image: formImg, label: "Complete reservation", capturedAgo: "3s ago", siteLabel: "Reservations" },
      similar: { capability: "type_text", site: "reserve.example", label: "fill fields on reserve.example" },
      details: [
        { label: "Seating", value: "Window (requested)" },
        { label: "Cancellation", value: "Free until 24h before" },
      ],
      reversible: true,
      risk: "low",
      tone: "danger",
      capabilities: ["type_text"],
      taskList: tasks(["type_text"]),
    },
    origin: "browser",
    source: "Lens browser",
    site: "reserve.example",
  },
};
Object.assign(previews, variants);
const PANELS: [string, string, string][] = [
  ["delete", "Deletions go to the Bin", "Before anything is removed, Lens counts it, sets aside what matters and keeps a 30-day undo."],
  ["payment", "Every payment waits", "Lens stops at the amount and the saved card, and pays only when you hold to confirm."],
  ["send", "Nothing sent in your name", "You see the exact words and who gets them before anything is sent."],
  ["click", "Shows you where it'll click", "The form, the button it will press and what it agrees to, captured seconds ago."],
];

const desk = (children: React.ReactNode) => (
  <div style={{ minHeight: "100vh", boxSizing: "border-box", padding: 24, display: "flex", justifyContent: "center", alignItems: "flex-start", background: "linear-gradient(150deg, color-mix(in srgb, var(--lens-pack-base, #08080b) 70%, #3b4252), var(--lens-pack-base, #08080b))" }}>
    {children}
  </div>
);

const app = ReactDOM.createRoot(document.getElementById("root")!);
const cardFor = (key: string, extra: Partial<React.ComponentProps<typeof ApprovalCard>> = {}) => {
  const s = previews[key];
  const req: ApprovalRequest = { id: key, origin: s.origin ?? "mcp", source: s.source ?? "Claude Desktop", site: s.site, createdMs: now - 4000, preview: s.pv };
  return <ApprovalCard request={req} compact={s.compact} initial={s.initial} onApprove={() => true} onDeny={() => undefined} onAllowSession={() => undefined} onUndo={() => undefined} onReview={() => undefined} onShowTab={() => undefined} onApproveSimilar={() => undefined} {...extra} />;
};
if (scene === "noaccess") {
  app.render(desk(<NoAccessNote what="that page" result={{ access: "none", source: null, reason: "Lens doesn't share banking or payment pages with AI apps." }} />));
} else if (scene === "permissions") {
  const caps = tasks(["change_look"]).map((t) => (t.id === "payments" ? { ...t, principle: "Every payment waits" } : t.id === "send_messages" ? { ...t, principle: "Nothing sent in your name" } : t.id === "delete_to_bin" ? { ...t, principle: "Deletions go to the Bin" } : t.id === "type_text" ? { ...t, principle: "Shows you where it'll click" } : t));
  const clients = [["claude-desktop", "Claude Desktop"], ["claude-code", "Claude Code"], ["internal", "Lens assistant"], ["voice", "Voice"], ["other", "Other AI apps"]].map(([client, label]) => ({ client, label, capabilities: caps.map((c) => ({ ...c, used: false })) }));
  app.render(
    desk(
      <div style={{ width: 640, padding: 20, borderRadius: 12, background: "var(--lens-pack-elevated, var(--lens-surface-solid))", border: "1px solid rgb(var(--lens-ink) / 0.1)" }}>
        <PermissionsCard
          initial={{
            clients,
            trusts: [
              { id: "trust-1", client: "claude-desktop", capability: "type_text", site: "reserve.example", label: "fill fields on reserve.example", span: "run", createdMs: now, expiresMs: null },
              { id: "trust-2", client: "claude-code", capability: "browse", site: "", label: "open pages and search", span: "day", createdMs: now, expiresMs: now + 20 * 3_600_000 },
            ],
            memory: { neverRemember: ["health.example", "therapy.example"], excludeBanks: true, excludePrivateSpaces: true, privateSpaces: ["Gifts"] },
          }}
        />
      </div>
    )
  );
} else if (scene === "showcase") {
  app.render(
    <div style={{ minHeight: "100vh", boxSizing: "border-box", padding: 24, background: "var(--lens-pack-base, #08080b)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {PANELS.map(([key, title, caption]) => (
        <section key={key} style={{ border: "1px solid rgb(var(--lens-ink) / 0.08)", borderRadius: 16, padding: 8, display: "flex", flexDirection: "column", gap: 12, background: "rgb(var(--lens-ink) / 0.02)" }}>
          <div className="ap-dither" style={{ minHeight: 420, display: "grid", placeItems: "center", padding: 24 }}>{cardFor(key)}</div>
          <div style={{ padding: "4px 16px 12px", fontFamily: "var(--font-sans)" }}>
            <h3 style={{ margin: 0, fontSize: 17, lineHeight: "24px", color: "var(--lens-fg-strong, var(--lens-fg))" }}>{title}</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: "20px", color: "var(--lens-fg-secondary)" }}>{caption}</p>
          </div>
        </section>
      ))}
    </div>
  );
} else if (scene === "pill") {
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
  const key = previews[scene] ? scene : "look";
  app.render(desk(cardFor(key, { tasksOpen: p.get("tasks") === "1" || key === "look" })));
}

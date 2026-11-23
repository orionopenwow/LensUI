// Right-click card / packs / toast scenes: out/index.html?scene=<name>&preset=<pack>
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import { applyThemeToDocument } from "../../../src/hooks/useLensState";
import { ContextMenuCard } from "../../../src/context/ContextMenuCard";
import { PackEditor } from "../../../src/context/PackEditor";
import { MicroSaveToastView } from "../../../src/context/MicroSaveToast";
import { addCustom, DEFAULT_PREFS, togglePin, toggleHidden } from "../../../src/context/actions";
import type { PackView } from "../../../src/context/contract";
import { ClipperCard } from "../../../src/context/templates/ClipperCard";
import { BUILTIN_TEMPLATES } from "../../../src/context/templates/templates";

const q = new URLSearchParams(location.search);
const scene = q.get("scene") || "card";
const cfg = (globalThis as any).__lensConfig();
applyThemeToDocument(cfg, { accentHex: "#2D7D9A", accentR: 45, accentG: 125, accentB: 154, appsUseLightTheme: false, systemUsesLightTheme: false } as any);

const css = document.createElement("style");
css.textContent = `html,body{margin:0;background:color-mix(in srgb,var(--lens-pack-base,#08080b) 82%,#777 18%)}
#root{padding:24px;box-sizing:border-box;min-height:100vh;font-family:var(--lens-font,system-ui)}
.g-card{width:720px;font-size:13px;color:var(--lens-fg);background:var(--lens-bg-surface);padding:16px;border-radius:14px}
.g-page{position:relative;width:720px;height:200px;border-radius:14px;background:var(--lens-bg-surface);color:var(--lens-fg);padding:20px;box-sizing:border-box;font-size:14px;line-height:22px}
.g-page mark{background:#b3d4fc;color:#111}`;
document.head.append(css);

let prefs = togglePin(DEFAULT_PREFS, "micro_save");
prefs = toggleHidden(prefs, "compare");
prefs = addCustom(prefs, { label: "Explain like a lawyer", prompt: "Explain {selection} precisely, citing terms.", contexts: ["selection", "page"], provider: "local" });
prefs = addCustom(prefs, { label: "Draft a reply", prompt: "Draft a short reply to {selection}.", contexts: ["selection", "notification"], provider: "claude" });

const now = Date.now();
const pack: PackView = {
  pack: { id: "p1", name: "Calm tech research", item_ids: ["s1", "s2", "s3", "s4"], budget_tokens: 16000, auto_trim: true, created_ms: now, updated_ms: now },
  items: [
    { id: "s1", title: "Calm Technology — Principles", kind: "page", url: "https://calmtech.com/", approx_tokens: 4200, local_only: false, missing: false },
    { id: "s2", title: "“Tools should live in the periphery…” (3 quotes)", kind: "selection", url: "https://www.youtube.com/watch?v=abcDEF12345", approx_tokens: 180, local_only: false, missing: false },
    { id: "s3", title: "Designing Calm Technology — transcript", kind: "transcript", url: "https://www.youtube.com/watch?v=abcDEF12345", approx_tokens: 14800, local_only: false, missing: false },
    { id: "s4", title: "notes-q4.md", kind: "file", path: "C:\\Users\\u\\Documents\\notes-q4.md", approx_tokens: 900, local_only: false, missing: false },
  ],
  total_tokens: 20080, over_budget: true, active: true, local_only: false,
  trim_plan: [{ id: "s3", from_tokens: 14800, to_tokens: 10720 }],
};
const packs = [
  { id: "p1", name: "Calm tech research", item_count: 4, total_tokens: 20080, budget_tokens: 16000, active: true },
  { id: "p2", name: "Q4 planning", item_count: 7, total_tokens: 6100, budget_tokens: 24000, active: false },
];
const shelf: any[] = [{ id: "s9", title: "Rust 2024 edition guide", approx_tokens: 4500 }, { id: "s8", title: "Design review — 14 Nov.mp4", approx_tokens: 10500 }];

const root = ReactDOM.createRoot(document.getElementById("root")!);
const toast = (s: any, noteOpen = false) => (
  <div style={{ position: "relative", width: 720 }}>
    <div className="g-page">
      <b>Calm Technology — Principles</b>
      <p style={{ margin: "8px 0 0" }}>The right amount of technology is the minimum needed to solve the problem. <mark>Technology should require the smallest possible amount of attention.</mark></p>
    </div>
    <div style={{ display: "flex", justifyContent: "center", marginTop: -64 }}>
      <MicroSaveToastView saved={s} noteOpen={noteOpen} />
    </div>
  </div>
);
const base = { id: "s2", shelf: "default", title: "Calm Technology — Principles", approx_tokens: 38, quotes: 1, merged: false, duplicate: false };
const scenes: Record<string, React.ReactNode> = {
  card: <div className="g-card"><ContextMenuCard initialPrefs={prefs} initialPlace="selection" /></div>,
  "card-youtube": <div className="g-card"><ContextMenuCard initialPrefs={prefs} initialPlace="youtube" /></div>,
  "card-files": <div className="g-card"><ContextMenuCard initialPrefs={prefs} initialPlace="video" /></div>,
  "card-desktop": <div className="g-card"><ContextMenuCard initialPrefs={DEFAULT_PREFS} initialPlace="desktop" /></div>,
  pack: <div className="g-card"><PackEditor demo={{ packs, view: pack, shelf }} /></div>,
  "pack-fits": <div className="g-card"><PackEditor demo={{ packs, view: { ...pack, pack: { ...pack.pack, budget_tokens: 32000 }, over_budget: false, trim_plan: [] }, shelf }} /></div>,
  clipper: <div className="g-card"><ClipperCard initial={{ folders: ["C:\\Users\\you\\Documents\\Obsidian Vault"], templates: BUILTIN_TEMPLATES.map((t, i) => (i === 0 ? { ...t, folder: "C:\\Users\\you\\Documents\\Obsidian Vault" } : t)) }} /></div>,
  "clipper-approve": <div className="g-card"><ClipperCard initial={{ folders: [], templates: BUILTIN_TEMPLATES, selected: "highlights", pending: { folder: "D:\\Notes\\Research", message: "Let Lens save clipped notes as new .md files in D:\\Notes\\Research? It never changes or deletes files that are already there." } }} /></div>,
  "toast-saved": toast(base),
  "toast-merged": toast({ ...base, merged: true, quotes: 3, approx_tokens: 112 }),
  "toast-duplicate": toast({ ...base, duplicate: true }),
  "toast-note": toast(base, true),
};
root.render(<>{scenes[scene] ?? scenes.card}</>);

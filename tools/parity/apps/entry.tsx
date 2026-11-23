// Renders Lens Apps for screenshots: ?scene=…&preset=…
//   home · hover · popover-winget · popover-release · run · installing · setup · detail · detail-suite ·
//   search · category · settings
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { LensApps, type LensAppsProps } from "../../../src/apps/LensApps";
import { AppsCard } from "../../../src/components/AppsCard";
import type { Catalog } from "../../../src/apps/types";
import type { QueueState } from "../../../src/apps/queue";
import catalogJson from "../../../catalog/apps/catalog.json";
import { SHOW, RECIPE, RELEASE } from "./mockCore";

const catalog = catalogJson as unknown as Catalog;
const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "home";
const installed = { ollama: { version: "0.40.10", available: "0.40.16" }, krita: { version: "5.3.4.1", available: null }, "obs-studio": { version: "33.0.0", available: null } };

const busyQueue: QueueState = {
  items: [
    { appId: "blender", op: "install", status: "running", jobId: "j1" },
    { appId: "concat", op: "install", status: "verified", token: "rel-1" },
    { appId: "libreoffice", op: "install", status: "queued" },
    { appId: "krita", op: "install", status: "done", setupPending: true },
  ],
};
const busyJobs = { blender: { jobId: "j1", appId: "blender", op: "install", stage: "downloading" as const, overall: 46, message: "62 MB of 118 MB", finished: false, ok: false } };
const kritaRecipe = [
  { index: 0, kind: "addToDock" as const, description: "Pin Krita to the Dock" },
  { index: 1, kind: "openWith" as const, description: 'Show "Open in Krita" for .kra, .psd, .png in Lens menus (Windows defaults unchanged)' },
  { index: 2, kind: "voiceVerbs" as const, description: 'Voice: "Lens, open krita"' },
];

function props(): LensAppsProps {
  const base = { catalog, installed };
  switch (scene) {
    case "hover":
      return { demo: { ...base, hover: "degenview" } };
    case "popover-winget":
      return { demo: { ...base, shows: { "obs-studio": { ...SHOW, id: "OBSProject.OBSStudio", name: "OBS Studio", version: "33.0.0", publisher: "OBS Project", license: "GPL-2.0", installerUrl: "https://github.com/obsproject/obs-studio/releases/download/33.0.0/OBS-Studio-33.0.0-Windows-x64-Installer.exe", installerSize: 157_286_400, agreements: [] }, ollama: SHOW }, popover: { appId: "ollama", mode: "update" }, category: "ai" } };
    case "popover-release":
      return { demo: { ...base, popover: { appId: "concat", mode: "get" } } };
    case "run":
      return { demo: { ...base, queue: { items: [{ appId: "concat", op: "install", status: "verified", token: "rel-1" }] }, prepared: { concat: RELEASE as any }, popover: { appId: "concat", mode: "run" } } };
    case "installing":
      return { demo: { ...base, queue: busyQueue, jobs: busyJobs, recipes: { krita: kritaRecipe } } };
    case "setup":
      return { demo: { ...base, queue: { items: [{ appId: "krita", op: "install", status: "done", setupPending: true }] }, recipes: { krita: kritaRecipe } } };
    case "detail":
      return { demo: base, initialApp: "concat" };
    case "detail-suite":
      return { demo: base, initialApp: "wordcraft" };
    case "search":
      return { demo: base, initialQuery: "slides" };
    case "category":
      return { demo: { ...base, category: "markets" } };
    default:
      return { demo: base };
  }
}

function App() {
  useLensState();
  if (scene === "settings")
    return (
      <div className="lens-glass cc-content" style={{ minHeight: "100%", boxSizing: "border-box", borderRadius: 0 }}>
        <AppsCard />
      </div>
    );
  return (
    <div className="lens-glass cc-content" style={{ minHeight: "100%", boxSizing: "border-box", borderRadius: 0, position: "relative" }}>
      <div className="cc-card" style={{ position: "relative" }}>
        <LensApps {...props()} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

// Renders Lens Apps for screenshots: ?scene=home|search|detail|confirm|installing|release|recipe|voice|settings&preset=…
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { LensApps } from "../../../src/apps/LensApps";
import { AppsCard } from "../../../src/components/AppsCard";
import { parseAppsIntent } from "../../../src/apps/intents";
import type { Catalog } from "../../../src/apps/types";
import catalogJson from "../../../catalog/apps/catalog.json";
import { SHOW, RECIPE, RELEASE } from "./mockCore";

const catalog = catalogJson as unknown as Catalog;
const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "home";
const installed = { ollama: { version: "0.40.10", available: "0.40.16" }, krita: { version: "5.3.4.1", available: null }, "obs-studio": { version: "33.0.0", available: null } };

function Voice() {
  const intent = parseAppsIntent("Lens, install ArtCraft", catalog);
  const app = intent && "app" in intent ? intent.app : null;
  return (
    <>
      <div className="la-voice-heard">
        <span className="la-mono la-muted">Heard</span> “Lens, install ArtCraft”
        <span className="la-chip">Install · {app?.name}</span>
        <span className="la-mono la-muted">needs your OK</span>
      </div>
      <LensApps demo={{ catalog, installed, sheet: { appId: app!.id, op: "install", phase: "confirm" } }} />
    </>
  );
}

function App() {
  useLensState();
  let body: React.ReactNode;
  switch (scene) {
    case "search":
      body = <LensApps demo={{ catalog, installed }} initialQuery="slides" />;
      break;
    case "detail":
      body = <LensApps demo={{ catalog, installed }} initialApp="concat" />;
      break;
    case "confirm":
      body = <LensApps demo={{ catalog, installed: {}, sheet: { appId: "ollama", op: "install", phase: "confirm", data: { show: SHOW } } }} />;
      break;
    case "installing":
      body = (
        <LensApps
          demo={{
            catalog,
            installed: {},
            jobs: { ollama: { jobId: "j1", appId: "ollama", op: "install", stage: "downloading", overall: 41, message: "563 MB of 1.10 GB", finished: false, ok: false } },
            sheet: { appId: "ollama", op: "install", phase: "progress", data: { show: SHOW } },
          }}
        />
      );
      break;
    case "release":
      body = <LensApps demo={{ catalog, installed: {}, sheet: { appId: "concat", op: "install", phase: "releaseConfirm", data: { release: RELEASE } } }} />;
      break;
    case "recipe":
      body = <LensApps demo={{ catalog, installed: { concat: { version: "0.2.8", available: null } }, sheet: { appId: "concat", op: "install", phase: "recipe", data: { recipe: RECIPE } } }} />;
      break;
    case "voice":
      body = <Voice />;
      break;
    case "settings":
      body = <AppsCard />;
      break;
    default:
      body = <LensApps demo={{ catalog, installed }} />;
  }
  return (
    <div className="lens-glass cc-content" style={{ minHeight: "100%", boxSizing: "border-box", borderRadius: 0, position: "relative" }}>
      {scene === "settings" ? body : <div className="cc-card" style={{ position: "relative" }}>{body}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

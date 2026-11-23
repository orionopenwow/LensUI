// Entry for every core app window: index.html?surface=coreapp&app=<id>[&view=…] and the desktop
// stickies (&app=sticky&note=<id>). Each app is loaded on demand.
import React, { Suspense, lazy } from "react";
import { useLensState } from "../hooks/useLensState";
import { AppErrorBoundary } from "./shell/ui";
import { coreApp, type CoreAppId } from "./registry";
import "./shell/shell.css";
import "./apps/apps.css";

const APPS: Record<CoreAppId, React.LazyExoticComponent<React.ComponentType<any>>> = {
  monitor: lazy(() => import("./apps/Monitor").then((m) => ({ default: m.Monitor }))),
  startup: lazy(() => import("./apps/StartupUninstall").then((m) => ({ default: m.StartupUninstall }))),
  timer: lazy(() => import("./apps/Timer").then((m) => ({ default: m.Timer }))),
  calculator: lazy(() => import("./apps/Calculator").then((m) => ({ default: m.Calculator }))),
  color: lazy(() => import("./apps/Color").then((m) => ({ default: m.Color }))),
  notes: lazy(() => import("./apps/Notes").then((m) => ({ default: m.Notes }))),
  power: lazy(() => import("./apps/Power").then((m) => ({ default: m.Power }))),
  network: lazy(() => import("./apps/Network").then((m) => ({ default: m.Network }))),
  clipboard: lazy(() => import("./apps/Clipboard").then((m) => ({ default: m.Clipboard }))),
};
const Sticky = lazy(() => import("./apps/Notes").then((m) => ({ default: m.Sticky })));

export const CoreAppSurface: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("app") ?? "";
  const view = params.get("view") ?? undefined;
  const { config, updateConfig } = useLensState();
  if (id === "sticky") {
    return (
      <Suspense fallback={null}>
        <Sticky noteId={params.get("note") ?? ""} />
      </Suspense>
    );
  }
  const info = coreApp(id);
  if (!info) return <div className="ca-root ca-unknown">There's no Lens app called “{id}”.</div>;
  const App = APPS[info.id];
  return (
    <AppErrorBoundary label={info.title}>
      <Suspense fallback={<div className="ca-root" aria-busy="true" />}>
        <App config={config} updateConfig={updateConfig} initialView={view} />
      </Suspense>
    </AppErrorBoundary>
  );
};

export default CoreAppSurface;

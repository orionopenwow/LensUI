// Standalone Lens Apps window (`?surface=apps`, optional `&app=<id>`, `&q=<query>` or
// `&view=library`). Same
// component as Settings › Apps; voice "Lens, install …" and Command "/apps" open this.
// Route + window config: docs/LENS_APPS.md §2.
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLensState } from "../hooks/useLensState";
import { ToastHost } from "../ui/Toast";
import { lensAppsWindowLeft } from "./desktopIcon";
import { LensApps } from "./LensApps";
import { viewParam } from "./libraryModel";

export function AppsSurface() {
  useLensState();
  const p = new URLSearchParams(window.location.search);
  // After the first setup this window opened by itself; once it's closed or hidden, the next
  // first-run welcome may go (FIRST_RUN_DONE in ./desktopIcon). Only after it has been seen.
  useEffect(() => {
    let seen = document.visibilityState === "visible";
    const onVis = () => {
      if (document.visibilityState === "visible") seen = true;
      else if (seen) lensAppsWindowLeft();
    };
    document.addEventListener("visibilitychange", onVis);
    const un = getCurrentWindow()
      .onCloseRequested(() => lensAppsWindowLeft())
      .catch(() => undefined);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      un.then((f) => f?.()).catch(() => {});
    };
  }, []);
  return (
    <div className="lens-glass" style={{ width: "100%", height: "100%", overflow: "auto", padding: 16, boxSizing: "border-box", position: "relative" }}>
      <LensApps initialApp={p.get("app") ?? undefined} initialQuery={p.get("q") ?? ""} initialView={viewParam(p.get("view"))} />
      {/* Failures of things you asked for show here (Settings has its own host). */}
      <ToastHost />
    </div>
  );
}

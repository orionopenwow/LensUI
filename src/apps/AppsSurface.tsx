// Standalone Lens Apps window (`?surface=apps`, optional `&app=<id>` or `&q=<query>`). Same
// component as Settings › Apps; voice "Lens, install …" and Command "/apps" open this.
// Route + window config: docs/LENS_APPS.md §2.
import { useLensState } from "../hooks/useLensState";
import { LensApps } from "./LensApps";

export function AppsSurface() {
  useLensState();
  const p = new URLSearchParams(window.location.search);
  return (
    <div className="lens-glass" style={{ width: "100%", height: "100%", overflow: "auto", padding: 16, boxSizing: "border-box", position: "relative" }}>
      <LensApps initialApp={p.get("app") ?? undefined} initialQuery={p.get("q") ?? ""} />
    </div>
  );
}

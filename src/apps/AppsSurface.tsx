// Standalone Lens Apps window (`?surface=apps`, optional `&app=<id>`, `&q=<query>` or
// `&view=library`). Same
// component as Settings › Apps; voice "Lens, install …" and Command "/apps" open this.
// Route + window config: docs/LENS_APPS.md §2.
import { useLensState } from "../hooks/useLensState";
import { ToastHost } from "../ui/Toast";
import { LensApps, type AppsView } from "./LensApps";

/** `&view=library` (also "updates") opens on the Library; anything else is Discover. */
export function viewParam(v: string | null): AppsView | undefined {
  return v === "library" || v === "updates" ? "library" : undefined;
}

export function AppsSurface() {
  useLensState();
  const p = new URLSearchParams(window.location.search);
  return (
    <div className="lens-glass" style={{ width: "100%", height: "100%", overflow: "auto", padding: 16, boxSizing: "border-box", position: "relative" }}>
      <LensApps initialApp={p.get("app") ?? undefined} initialQuery={p.get("q") ?? ""} initialView={viewParam(p.get("view"))} />
      {/* Failures of things you asked for show here (Settings has its own host). */}
      <ToastHost />
    </div>
  );
}

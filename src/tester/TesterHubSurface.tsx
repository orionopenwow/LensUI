// Standalone Tester Hub window (`?surface=testerhub`). Same component as the Settings card,
// with the window's theme applied. Route + window config: docs/TESTER_HUB.md.
import { useLensState } from "../hooks/useLensState";
import { TesterHub, type TesterTab } from "./TesterHub";

export function TesterHubSurface() {
  useLensState();
  const tab = (new URLSearchParams(window.location.search).get("tab") as TesterTab | null) ?? "new";
  return (
    <div className="lens-glass" style={{ width: "100%", height: "100%", overflow: "auto", padding: 16, boxSizing: "border-box" }}>
      <TesterHub initialTab={tab} />
    </div>
  );
}

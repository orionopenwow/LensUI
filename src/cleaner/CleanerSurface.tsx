// Standalone Lens Cleaner window (`?surface=cleaner`). Opened from Settings › Storage, the Dock /
// Launcher, Command "/clean", voice ("free up space"), the low-space pill and Explorer's drive menu.
import { useLensState } from "../hooks/useLensState";
import { CleanerApp } from "./CleanerApp";

export function CleanerSurface() {
  useLensState();
  return <CleanerApp />;
}

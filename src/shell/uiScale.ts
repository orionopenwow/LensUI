import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/**
 * UI scale (Control Center > Theme & Look, 80–130 %).
 *
 * The backend multiplies every window size it sets by the same factor and this sets the matching
 * webview zoom, so each surface keeps exactly the CSS viewport it was designed for — it is just
 * drawn larger or smaller. Nothing can clip that didn't clip at 100 %.
 *
 * The zoom is only applied once the backend reports that it scales windows too
 * (`get_ui_scale_support_cmd`); with an older backend the setting stays a no-op instead of
 * zooming content inside windows that didn't grow.
 */

export function uiScaleFactor(percent: number | undefined): number {
  const p = !percent || !Number.isFinite(percent) ? 100 : percent;
  return Math.min(130, Math.max(80, Math.round(p))) / 100;
}

let backendSupport: Promise<boolean> | null = null;
let applied = 1;

function backendScalesWindows(): Promise<boolean> {
  if (!backendSupport) {
    backendSupport = invoke<boolean>("get_ui_scale_support_cmd")
      .then((v) => v === true)
      .catch(() => false);
  }
  return backendSupport;
}

/** Sets --lens-ui-scale and, when supported, the webview zoom. Safe to call on every config change. */
export function applyUiScale(percent: number | undefined): void {
  const factor = uiScaleFactor(percent);
  document.documentElement.style.setProperty("--lens-ui-scale", String(factor));
  if (factor === applied) return;
  void backendScalesWindows().then((ok) => {
    if (!ok || factor === applied) return;
    applied = factor;
    getCurrentWebview()
      .setZoom(factor)
      .catch(() => {
        applied = 1;
      });
  });
}

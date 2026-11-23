import { invoke } from "@tauri-apps/api/core";
import type {
  CursorPreview,
  CursorRoleName,
  CursorState,
  CursorStyle,
  CursorSuiteStatus,
  FxSettings,
  FxStatus,
  PointerSettings,
} from "./types";

// Thin wrappers over the Tauri commands registered in lib.rs (see docs/CURSORS.md).
export const cursorApi = {
  status: () => invoke<CursorSuiteStatus>("cursor_suite_status_cmd"),
  previews: (style: CursorStyle, size: number, roles: CursorRoleName[]) =>
    invoke<CursorPreview[]>("cursor_previews_cmd", { style, size, roles }),
  apply: (style: CursorStyle, size: number) => invoke<CursorState>("cursor_apply_cmd", { style, size }),
  restore: () => invoke<boolean>("cursor_restore_cmd"),
  followTheme: (follow: boolean) => invoke<CursorState>("cursor_follow_theme_cmd", { follow }),
  setPointer: (settings: PointerSettings) => invoke<PointerSettings>("pointer_set_cmd", { settings }),
  resetPointer: () => invoke<boolean>("pointer_reset_cmd"),
  fxGet: () => invoke<FxStatus>("cursor_fx_get_cmd"),
  fxSet: (settings: FxSettings) => invoke<FxStatus>("cursor_fx_set_cmd", { settings }),
};

/** The live theme accent as #rrggbb (from the --lens-accent token). */
export function currentAccentHex(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--lens-accent").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) return ("#" + raw.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  const m = raw.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (m) return "#" + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("");
  return "#fafafa";
}

/** Lens' own reduced-motion switch, or the OS one when Lens follows Windows. */
export function prefersReducedMotion(): boolean {
  const m = document.documentElement.dataset.motion;
  if (m === "reduce") return true;
  if (m === "full") return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

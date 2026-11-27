// The accent tokens for a subtree that paints its own accent or scheme (src/themes/accentTokens.ts,
// scopedAccentVariables): Lens Browser's own look and Lens Music's artwork tint. Re-computed when the
// look changes or the theme's strength / High contrast does, so the subtree never shows tokens that
// were computed for another accent or another surface.
import { useMemo, useSyncExternalStore } from "react";
import { accentVersion, onAccentChange, scopedAccentVariables, type PlainInk, type ScopedLook } from "./accentTokens";

/** Style properties for the subtree's root, or an empty object when `look` is null (inherit the window's). */
export function useScopedAccent(look: ScopedLook | null, plain?: PlainInk): Record<string, string> {
  const v = useSyncExternalStore(onAccentChange, accentVersion, accentVersion);
  const key = look ? `${look.accent}|${look.surface}|${look.card}|${look.scheme}|${look.fg ?? ""}|${look.secondary ?? ""}` : "";
  const plainKey = plain ? `${plain.ui}|${plain.onUi}` : "";
  return useMemo(
    () => (look ? scopedAccentVariables(look, plain) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, plainKey, v]
  );
}

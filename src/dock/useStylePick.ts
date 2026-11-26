// One Dock style change per settle. Clicking quickly through the style cards used to restyle the
// live Dock (and move Settings, which sits on it) on every click, so the Dock flickered between
// shapes. The picked card lights up at once; the Dock changes once the clicks stop.
import { useEffect, useRef, useState } from "react";
import type { LensConfig } from "../types/lens";
import { DOCK_STYLES, dockStyleOf, withDock } from "./styles";

/** How long the picks must stop before the Dock is restyled. */
export const STYLE_SETTLE_MS = 220;

/** The config a style pick produces: the style and its recommended icon size, nothing else. */
export function configForStyle(config: LensConfig, id: string): LensConfig {
  const d = DOCK_STYLES.find((s) => s.id === id);
  if (!d) return config;
  return withDock({ ...config, dock: { ...config.dock, iconSize: d.recommendedIconSize } }, { style: d.id });
}

/** Returns the style to show as picked and a `pick` that applies it once picks settle. */
export function useStylePick(config: LensConfig, apply: (next: LensConfig) => void): [string, (id: string) => void] {
  const [pending, setPending] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ config, apply });
  latest.current = { config, apply };

  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Once the config shows the picked style, the local pick is no longer needed.
  const current = dockStyleOf(config);
  useEffect(() => {
    if (pending && pending === current) setPending(null);
  }, [pending, current]);

  const pick = (id: string) => {
    setPending(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const { config: c, apply: a } = latest.current;
      if (dockStyleOf(c) !== id) a(configForStyle(c, id));
    }, STYLE_SETTLE_MS);
  };

  return [pending ?? current, pick];
}

import React, { lazy } from "react";
import type { PageId } from "../registry";
import type { PageProps } from "./common";

// Pages load on first visit, so opening Settings doesn't parse every page (and the AI, Apps and
// Music cards behind them) up front. ControlCenterSurface wraps them in <Suspense>.
const loaders: Array<() => Promise<unknown>> = [];
const page = (load: () => Promise<Record<string, unknown>>, name: string) => {
  loaders.push(load);
  return lazy(() => load().then((m) => ({ default: m[name] as React.FC<PageProps> })));
};

/** Warms every page chunk in idle time after Settings opens, one at a time, so switching pages
 *  never flashes a loading skeleton and the content doesn't jump in a moment later. */
export function preloadSettingsPages(): () => void {
  let cancelled = false;
  type IdleWin = { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const idle = (cb: () => void) => {
    const w = window as unknown as IdleWin;
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb, { timeout: 1200 });
    else window.setTimeout(cb, 120);
  };
  const queue = [...loaders];
  const next = () => {
    if (cancelled) return;
    const load = queue.shift();
    if (!load) return;
    load().catch(() => {}).finally(() => idle(next));
  };
  window.setTimeout(() => idle(next), 400);
  return () => {
    cancelled = true;
  };
}

/** Pages that live in their own file. The rest (Appearance, Dock & Bar, Desktop, Windows & Keys,
 *  System & Tasks, Notifications) are still rendered by ControlCenterSurface. */
export const PAGE_COMPONENTS: Partial<Record<PageId, React.FC<PageProps>>> = {
  display: page(() => import("./DisplayPage"), "DisplayPage") as unknown as React.FC<PageProps>,
  sound: page(() => import("./SoundPage"), "SoundPage") as unknown as React.FC<PageProps>,
  network: page(() => import("./NetworkPage"), "NetworkPage") as unknown as React.FC<PageProps>,
  power: page(() => import("./PowerPage"), "PowerPage") as unknown as React.FC<PageProps>,
  apps: page(() => import("./AppsPage"), "AppsPage") as unknown as React.FC<PageProps>,
  storage: page(() => import("./StoragePage"), "StoragePage") as unknown as React.FC<PageProps>,
  focus: page(() => import("./FocusPage"), "FocusPage") as unknown as React.FC<PageProps>,
  privacy: page(() => import("./PrivacyPage"), "PrivacyPage") as unknown as React.FC<PageProps>,
  update: page(() => import("./UpdatePage"), "UpdatePage") as unknown as React.FC<PageProps>,
  time: page(() => import("./TimePage"), "TimePage") as unknown as React.FC<PageProps>,
  accessibility: page(() => import("./AccessibilityPage"), "AccessibilityPage") as unknown as React.FC<PageProps>,
  gaming: page(() => import("./GamingPage"), "GamingPage") as unknown as React.FC<PageProps>,
  ai: page(() => import("./AiCommandPage"), "AiCommandPage") as unknown as React.FC<PageProps>,
  about: page(() => import("./AboutPage"), "AboutPage") as unknown as React.FC<PageProps>,
  store: page(() => import("./LensAppsPage"), "LensAppsPage") as unknown as React.FC<PageProps>,
  music: page(() => import("./MusicPage"), "MusicPage") as unknown as React.FC<PageProps>,
};

// The shared window frame for every Lens core app: logo badge and title, Lens-at-work status,
// the Guide "?" anchor, Pin to Dock, a keyboard map, and a sticky bottom action bar.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { announce, done as presenceDone } from "../../presence/api";
import { openGuide } from "../../guide/coach";
import type { LensConfig } from "../../types/generated";
import { iconUrl, pinEntry, PIN_PREFIX, type CoreAppInfo } from "../registry";
import { cx } from "./ui";
import "./shell.css";
import { oops, quiet } from "../../ui/oops";
import { ToastHost } from "../../ui/Toast";

export interface KeyBinding {
  /** Shown in the keyboard map, e.g. "Ctrl+F". */
  keys: string;
  label: string;
  /** Matches a KeyboardEvent. Omit for documentation-only rows. */
  match?: (e: KeyboardEvent) => boolean;
  run?: () => void;
}

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};

export const isKey = (e: KeyboardEvent, key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  e.key.toLowerCase() === key.toLowerCase() && !!mods.ctrl === (e.ctrlKey || e.metaKey) && !!mods.shift === e.shiftKey && !!mods.alt === e.altKey;

/**
 * Wraps an action the user asked for in "Lens at work": the presence orb shows the step on the
 * button, and Stop cancels before anything happens.
 */
export function usePresence() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(label: string, target: Element | null, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label);
    try {
      const r = await announce("apps", { kind: "click", label }, target);
      if (r.stopped) return undefined;
      const out = await fn();
      presenceDone("apps", label);
      return out;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, run };
}

export const AppShell: React.FC<{
  app: CoreAppInfo;
  config: LensConfig | null;
  updateConfig?: (c: LensConfig) => Promise<void>;
  /** Tabs or filters under the title. */
  toolbar?: React.ReactNode;
  /** The sticky bottom bar: metadata on the left, actions on the right. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  keys?: KeyBinding[];
  /** Shown in the title bar while Lens is doing something for the user. */
  working?: string | null;
  children: React.ReactNode;
}> = ({ app, config, updateConfig, toolbar, meta, actions, keys = [], working, children }) => {
  const [showKeys, setShowKeys] = useState(false);
  const keysRef = useRef<KeyBinding[]>(keys);
  keysRef.current = keys;
  const pinned = !!config?.dock?.pinnedApps?.some((p) => p.path === `${PIN_PREFIX}${app.id}`);

  useEffect(() => {
    document.title = app.title;
    // The window is built hidden and shown once its page is ready; a refusal means it is already up.
    getCurrentWindow().show().catch(quiet);
  }, [app.title]);

  const togglePin = useCallback(() => {
    if (!config || !updateConfig) return;
    const path = `${PIN_PREFIX}${app.id}`;
    const list = config.dock.pinnedApps ?? [];
    const next = pinned ? list.filter((p) => p.path !== path) : [...list, pinEntry(app)];
    updateConfig({ ...config, dock: { ...config.dock, pinnedApps: next } }).catch(oops(pinned ? `unpin ${app.title} from the Dock` : `pin ${app.title} to the Dock`));
  }, [config, updateConfig, app, pinned]);

  const openSettings = useCallback(() => {
    if (!app.settingsTab) return;
    invoke("open_surface", { label: "settings" })
      .then(() => emit("lens://settings-tab", app.settingsTab))
      .catch(oops("open Settings"));
  }, [app.settingsTab]);

  const guide = useCallback(() => openGuide({ query: app.short }), [app.short]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape" && showKeys) {
        setShowKeys(false);
        return;
      }
      if (isKey(e, "w", { ctrl: true })) {
        e.preventDefault();
        getCurrentWindow().close().catch(oops("close this window"));
        return;
      }
      if (e.key === "F1") {
        e.preventDefault();
        guide();
        return;
      }
      if (!typing(e) && e.key === "?") {
        e.preventDefault();
        setShowKeys((v) => !v);
        return;
      }
      // Space and Enter belong to the focused button, link or switch.
      const t = e.target as HTMLElement | null;
      if ((e.key === " " || e.key === "Enter") && t?.closest?.("button, a, [role=switch], [role=tab], select")) return;
      for (const k of keysRef.current) {
        if (k.match && k.run && k.match(e) && (!typing(e) || e.ctrlKey || e.altKey || e.key === "Escape")) {
          e.preventDefault();
          k.run();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showKeys, guide]);

  const allKeys: KeyBinding[] = [
    ...keys,
    { keys: "?", label: "Show or hide this list" },
    { keys: "F1", label: `Ask the Guide about ${app.short}` },
    { keys: "Ctrl+W", label: "Close the window" },
  ];

  return (
    <div className={cx("ca-root", `ca-app-${app.id}`)} data-app={app.id}>
      <header className="ca-titlebar" data-tauri-drag-region>
        <img className="ca-logo" src={iconUrl(app)} alt="" draggable={false} data-tauri-drag-region />
        <h1 className="ca-title" data-tauri-drag-region>
          <span className="ca-title-lens">Lens</span> {app.short}
        </h1>
        <div className="ca-titlebar-space" data-tauri-drag-region />
        {working && (
          <span className="ca-working" role="status" aria-live="polite">
            <span className="ca-working-dot" aria-hidden />
            {working}
          </span>
        )}
        <button data-weight="medium" type="button" className={cx("ca-icon-btn", pinned && "on")} aria-pressed={pinned} aria-label={pinned ? "Unpin from Dock" : "Pin to Dock"} onClick={togglePin} disabled={!updateConfig || !config}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
            <path d="M9 3h6l-1 6 4 3v2h-5v7l-1 1-1-1v-7H6v-2l4-3z" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </button>
        {app.settingsTab && (
          <button data-weight="medium" type="button" className="ca-icon-btn" aria-label="Open in Lens Settings" onClick={openSettings}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
              <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <button data-weight="medium" type="button" className="ca-icon-btn" aria-label="Keyboard shortcuts" aria-expanded={showKeys} onClick={() => setShowKeys((v) => !v)}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
            <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M7 10h1M11 10h1M15 10h2M7 14h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button data-weight="medium" type="button" className="ca-icon-btn ca-guide" aria-label={`Guide: help with ${app.short}`} data-guide-id={`coreapp.${app.id}.guide`} onClick={guide}>
          ?
        </button>
        <span className="ca-sep" aria-hidden />
        <button data-weight="medium" type="button" className="ca-icon-btn" aria-label="Minimise" onClick={() => getCurrentWindow().minimize().catch(oops("minimise this window"))}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button data-weight="medium" type="button" className="ca-icon-btn ca-close" aria-label="Close" onClick={() => getCurrentWindow().close().catch(oops("close this window"))}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {toolbar && <div className="ca-toolbar">{toolbar}</div>}
      <main className="ca-body">{children}</main>
      {(meta || actions) && (
        <footer className="ca-actionbar">
          <div className="ca-actionbar-meta ca-mono">{meta}</div>
          <div className="ca-actionbar-actions">{actions}</div>
        </footer>
      )}
      {/* Failures of things you asked for (pin, open Settings, close) show here. */}
      <ToastHost />
      {showKeys && (
        <div className="ca-scrim" onMouseDown={(e) => e.target === e.currentTarget && setShowKeys(false)}>
          <div className="ca-dialog ca-keys" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <h3>Keyboard</h3>
            <dl>
              {allKeys.map((k) => (
                <React.Fragment key={k.keys + k.label}>
                  <dt>
                    {k.keys.split("+").map((p, i) => (
                      <kbd key={i}>{p}</kbd>
                    ))}
                  </dt>
                  <dd>{k.label}</dd>
                </React.Fragment>
              ))}
            </dl>
            <div className="ca-dialog-actions">
              <button data-weight="heavy" type="button" className="ca-btn ca-btn-primary" autoFocus onClick={() => setShowKeys(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

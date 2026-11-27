// The Magic Start window (surface "magicstart"; wave M4, docs/MAGIC.md "Magic Start").
// Opened by a Windows-key tap while magicWaves.startButton is on (src-tauri/src/commands/magic_start.rs)
// or by the Taskbar-style Dock's start button. Every open answers the key hook's watchdog: if this
// page doesn't acknowledge within 300 ms, Windows Start opens instead.
// Reads only local data: installed apps, recent files, the Dock's pins and the Shelf.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLensState } from "../../hooks/useLensState";
import { ackKeyhook } from "../../shell/keyhookResponder";
import { magicFlags } from "../../magicwaves/flags";
import { magicOpen } from "../contract";
import { snipStart } from "../../snip/api";
import { shelfList } from "../../shelf/contract";
import type { InstalledApp, RecentFileItem } from "../../types/generated";
import { MagicStartPanel } from "./MagicStart";
import { failLine, logFail, quiet, retryOnce } from "../../failsafe/calls";
import {
  magicActions, moveSelection, navOrder, pinnedEntries, recentEntries, searchApps,
  type ShelfLike, type StartEntry,
} from "./model";

export const OPEN_EVENT = "lens://magicstart-open";

// A refused hide would leave Magic Start over the desktop: tried once more, then logged.
const hide = (reason: string) => retryOnce(() => invoke("magic_start_hide", { reason }), "Magic Start", "close");

/** Runs an entry. Everything here stays on this PC; apps open through Lens's own launcher command. */
export async function runEntry(e: StartEntry): Promise<string | null> {
  try {
    switch (e.kind) {
      case "app":
      case "file":
        await hide("launched");
        await invoke("launch_app_cmd", { path: e.path });
        return null;
      case "shelf":
        await hide("opened the Shelf");
        await invoke("open_surface", { label: "command" });
        return null;
      case "action":
        await hide(e.action);
        switch (e.action) {
          case "magic":
            await magicOpen();
            break;
          case "snip":
            await snipStart();
            break;
          case "dashboard":
            await invoke("toggle_dashboard");
            break;
          case "shelf":
          case "shelfNote":
            await invoke("open_surface", { label: "command" });
            break;
          case "windowsStart":
            await invoke("open_windows_start");
            break;
        }
        return null;
    }
  } catch (err) {
    return `Couldn't open ${e.label}: ${String(err)}`;
  }
}

export const MagicStartWindow: React.FC = () => {
  const { config } = useLensState();
  const flags = magicFlags(config);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [files, setFiles] = useState<RecentFileItem[]>([]);
  const [shelf, setShelf] = useState<ShelfLike[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState("");
  const [openSeq, setOpenSeq] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    invoke<InstalledApp[]>("scan_installed_apps_cmd")
      .then((l) => setApps(l ?? []))
      .catch((e) => setStatus(failLine("Magic Start", "list your apps", e)));
    invoke<{ recentFiles: RecentFileItem[] }>("get_launcher_home_cmd")
      .then((h) => setFiles(h?.recentFiles ?? []))
      .catch(logFail("Magic Start", "read recent files"));
    shelfList()
      .then((l) => setShelf(l ?? []))
      .catch((e) => (setShelf([]), logFail("Magic Start", "read the Shelf")(e)));
  }, []);

  useEffect(() => {
    const un = listen<{ seq?: number }>(OPEN_EVENT, (e) => {
      // Answer the key hook first: this is what stops Windows Start from opening.
      const seq = e.payload?.seq;
      if (typeof seq === "number" && seq > 0) ackKeyhook(seq);
      setQuery("");
      setSelected(0);
      setStatus("");
      setOpenSeq((n) => n + 1);
      refresh();
      window.requestAnimationFrame(() => inputRef.current?.focus());
    });
    refresh();
    return () => {
      un.then((fn) => fn()).catch(quiet);
    };
  }, [refresh]);

  const pinned = useMemo(() => pinnedEntries(config?.dock?.pinnedApps ?? []), [config?.dock?.pinnedApps]);
  const actions = useMemo(() => magicActions(flags), [flags.dashboard, flags.shelfNotes]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => recentEntries(files, shelf), [files, shelf]);
  const results = useMemo<StartEntry[]>(
    () => searchApps(apps, query).map((a) => ({ kind: "app", key: `app:${a.path.toLowerCase()}`, label: a.name, path: a.path })),
    [apps, query]
  );
  const order = navOrder(query, results, pinned, actions, recent);

  useEffect(() => {
    setSelected((s) => moveSelection(s, 0, order.length));
  }, [order.length]);

  // The keyboard's row stays in view when the list is longer than the panel.
  useEffect(() => {
    document.querySelector(`#mstart-list [data-idx="${selected}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selected, query]);

  const run = useCallback(async (e: StartEntry) => {
    const err = await runEntry(e);
    if (err) setStatus(err);
  }, []);

  // Esc is handled on the window, not on the panel: right after Magic Start opens, keyboard focus
  // may not be inside the panel yet, and Esc must still clear the search or close it.
  const queryRef = useRef(query);
  queryRef.current = query;
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      if (queryRef.current) setQuery("");
      else void hide("escape");
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    // Left/Right move the caret while typing; only Up/Down walk the results.
    if (step && !(query && (e.key === "ArrowLeft" || e.key === "ArrowRight"))) {
      e.preventDefault();
      setSelected((s) => moveSelection(s, step, order.length));
      return;
    }
    if (e.key === "Enter" && order[selected]) {
      e.preventDefault();
      void run(order[selected]);
    }
  };

  return (
    <div className="mstart-window" key={openSeq}>
      <MagicStartPanel
        query={query}
        onQuery={(q) => {
          setQuery(q);
          setSelected(0);
        }}
        pinned={pinned}
        actions={actions}
        recent={recent}
        results={results}
        selected={selected}
        onRun={(e) => void run(e)}
        onLock={() => {
          void hide("lock");
          invoke("power_action_cmd", { action: "lock" }).catch((err) => setStatus(`Couldn't lock: ${String(err)}`));
        }}
        onWindowsStart={() => void invoke("open_windows_start").catch((err) => setStatus(failLine("Magic Start", "open Windows Start", err)))}
        onKeyDown={onKeyDown}
        inputRef={inputRef}
        status={status}
      />
    </div>
  );
};

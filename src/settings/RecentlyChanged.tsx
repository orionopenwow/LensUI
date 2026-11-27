// Settings › Quick settings › Recently changed: the last few settings changes, yours or an agent's,
// each with Undo. The settings writer keeps the list (src-tauri/src/settings_history.rs, a small
// local file that never leaves the PC); Undo puts the old values back through the normal save.
// Shows nothing until something has changed.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RotateCcw } from "lucide-react";
import type { SettingsHistoryEntry } from "../types/generated";
import { staggerIn } from "../ui/motion";
import { oops, quiet } from "../ui/oops";
import { pressProps } from "../ui/press";
import { SHOWN, agoText, entryText } from "./history";

export const RecentlyChanged: React.FC = () => {
  const [list, setList] = useState<SettingsHistoryEntry[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const seen = useRef<Set<number>>(new Set());

  const refresh = useCallback(() => {
    invoke<SettingsHistoryEntry[]>("settings_history_cmd")
      .then((l) => setList(Array.isArray(l) ? l : []))
      .catch(quiet); // the next settings change refreshes it again
  }, []);

  useEffect(() => {
    refresh();
    // Every save (here, in another window, or by an agent) may have added an entry.
    let t = 0;
    const un = listen("lens://config-updated", () => {
      window.clearTimeout(t);
      t = window.setTimeout(refresh, 250);
    });
    return () => {
      window.clearTimeout(t);
      un.then((f) => f()).catch(quiet);
    };
  }, [refresh]);

  const shown = list.slice(0, SHOWN);

  // New rows arrive in order (DESIGN §5.3); rows already on screen stay still.
  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const fresh = Array.from(root.querySelectorAll<HTMLElement>("[data-entry]")).filter((el) => !seen.current.has(Number(el.dataset.entry)));
    if (fresh.length && seen.current.size) staggerIn(fresh);
    shown.forEach((e) => seen.current.add(e.id));
  });

  const undo = (entry: SettingsHistoryEntry) => {
    const { name } = entryText(entry);
    setBusy(entry.id);
    invoke<SettingsHistoryEntry[]>("settings_undo_cmd", { id: entry.id })
      .then((l) => {
        setList(Array.isArray(l) ? l : []);
        setSaid(`${name} is back to how it was.`);
      })
      .catch((e) => {
        refresh();
        oops("undo that change")(e);
      })
      .finally(() => setBusy(null));
  };

  if (shown.length === 0) {
    return (
      <div className="sh-recent-live" aria-live="polite">
        {said}
      </div>
    );
  }

  const now = Date.now();
  return (
    <section className="cc-card sh-recent" aria-labelledby="sh-recent-title" data-guide-id="settings.recently-changed">
      <div className="sh-recent-head">
        <h2 id="sh-recent-title" className="sh-recent-title">
          Recently changed
        </h2>
        <span className="sh-recent-note">Kept on this PC only</span>
      </div>
      <ul ref={listRef} className="sh-recent-list">
        {shown.map((entry) => {
          const t = entryText(entry);
          return (
            <li key={entry.id} className="sh-recent-row" data-entry={entry.id}>
              <span className="sh-recent-name">{t.name}</span>
              {t.detail && <span className="sh-recent-detail">{t.detail}</span>}
              <span className="sh-recent-ago">{agoText(entry.atMs, now)}</span>
              <button
                type="button"
                {...pressProps({ weight: "medium", pending: busy === entry.id })}
                className="cc-btn sh-recent-undo"
                aria-label={t.undoLabel}
                disabled={busy !== null && busy !== entry.id}
                onClick={() => busy === null && undo(entry)}
              >
                <RotateCcw size={12} strokeWidth={2.4} aria-hidden />
                <span>Undo</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sh-recent-live" aria-live="polite">
        {said}
      </div>
    </section>
  );
};

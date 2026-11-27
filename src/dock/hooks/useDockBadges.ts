// Badges on Dock icons: unread notification counts per app (Windows toasts and Lens history,
// counted once per id) and text badges from Lens core apps ("12:04" on Lens Timer).
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { quiet } from "../../failsafe/calls";
import { countNotifications, type NotificationLite } from "../model";

export function useDockBadges() {
  // Unread notification counts per app (normalised name -> count).
  const [notifCounts, setNotifCounts] = useState<Record<string, number>>({});
  // Text badges for pinned Lens core apps, keyed by pin path.
  const [coreBadges, setCoreBadges] = useState<Record<string, string>>({});

  useEffect(() => {
    const un = listen<{ path: string; text: string | null }>("lens://coreapp-badge", (e) =>
      setCoreBadges((b) => {
        const next = { ...b };
        if (e.payload.text) next[e.payload.path] = e.payload.text;
        else delete next[e.payload.path];
        return next;
      })
    );
    return () => {
      un.then((f) => f()).catch(quiet);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      invoke<{ items?: NotificationLite[]; windows?: { items?: NotificationLite[] } } | null>(
        "get_notification_center_cmd"
      )
        .then((state) => {
          if (!alive || !state) return;
          setNotifCounts(countNotifications([state.windows?.items ?? [], state.items ?? []]));
        })
        .catch(quiet);
    };
    load();
    const unlisten = listen("lens://notifications-changed", load);
    const timer = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      unlisten.then((fn) => fn());
    };
  }, []);

  return { notifCounts, coreBadges };
}

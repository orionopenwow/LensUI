// The Magic Dashboard window (surface "dashboard"; docs/plans/MAGIC_WAVES.md §4, wave M1).
// Opened by the Top Bar button or Command, only while magicWaves.dashboard is on. Each open reads
// Lens's own data once (Messages, Feeds, the calendar, the Shelf, now playing) and builds the
// lanes and the context strip; nothing is read in between and nothing goes over the network.
// Closes on ×, Esc, a second press of the button, or when another app takes the focus.
import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLensState } from "../hooks/useLensState";
import { magicFlags } from "../magicwaves/flags";
import { DashboardSurface } from "./DashboardSurface";
import { contextStrip, type Card, type LaneId, type LayoutId } from "./store";
import { loadSnapshot, stripItems, type CalEventLike, type CardAction, type DashCard, type Readers } from "./sources";
import { clearOpens, readLayout, readOpens, writeLayout, writeOpens } from "./memory";
import { openCoreApp } from "../coreapps/registry";

export const OPEN_EVENT = "lens://dashboard-open";
const CALENDAR_KEY = "lens_calendar_events_v1";

/** The real readers: local Lens commands and the calendar's own storage. */
export const lensReaders: Readers = {
  inbox: () => invoke("messages_inbox"),
  feeds: () => invoke<{ items: never[] }>("feeds_timeline", { filter: "all", limit: 30 }).then((t) => t?.items ?? []),
  calendar: () => {
    try {
      const raw = localStorage.getItem(CALENDAR_KEY);
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? (v as CalEventLike[]) : [];
    } catch {
      return [];
    }
  },
  shelf: () => invoke("shelf_list", {}),
  nowPlaying: () => invoke("get_media_now_playing_cmd"),
};

const hide = () => invoke("dashboard_hide").catch(() => {});

/** What opening a card does. Every action stays inside Lens. */
export function runCardAction(a: CardAction): void {
  switch (a.kind) {
    case "app":
      void openCoreApp(a.app).catch(() => {});
      return hideSoon();
    case "url":
      void invoke("browser_open", { url: a.url }).catch(() => {});
      return hideSoon();
    case "shelf":
      void invoke("open_surface", { label: "command" }).catch(() => {});
      return hideSoon();
    case "media":
      void invoke("media_control_cmd", { action: "play_pause" }).catch(() => {});
      return;
    case "none":
      return;
  }
}

const hideSoon = () => void setTimeout(() => void hide(), 60);

/** The empty lanes' buttons. Lanes without one keep a disabled button. */
const EMPTY_ACTIONS: Partial<Record<LaneId, () => void>> = {
  inbox: () => void invoke("open_dock_popout_tab_cmd", { tab: "messages#messages" }).catch(() => {}),
  feeds: () => void openCoreApp("feeds").catch(() => {}),
};

export const DashboardWindow: React.FC = () => {
  const { config } = useLensState();
  const flags = magicFlags(config);
  const [cards, setCards] = useState<Card[]>([]);
  const [strip, setStrip] = useState<string[] | undefined>(undefined);
  const [layout, setLayout] = useState<LayoutId>(() => readLayout());
  const [opens, setOpens] = useState<Record<string, number>>(() => (flags.learn ? readOpens() : {}));
  const [seq, setSeq] = useState(0);

  const refresh = useCallback(async () => {
    const now = new Date();
    const snap = await loadSnapshot(lensReaders, now);
    setCards(snap.cards);
    setStrip(stripItems(contextStrip({ now, unread: snap.unread, nextEvent: snap.next, shelfCount: snap.shelfCount }), snap));
    setSeq((n) => n + 1);
  }, []);

  // Rebuild on every open (and once on first load).
  useEffect(() => {
    void refresh();
    const un = listen(OPEN_EVENT, () => void refresh());
    return () => void un.then((f) => f());
  }, [refresh]);

  // Turning the flag off closes the window; turning learning off forgets what it learned.
  useEffect(() => {
    if (config && !flags.dashboard) void hide();
  }, [config, flags.dashboard]);
  useEffect(() => {
    if (!flags.learn) {
      clearOpens();
      setOpens({});
    }
  }, [flags.learn]);

  // Esc closes; focus moving to another app closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void hide();
      }
    };
    window.addEventListener("keydown", onKey);
    let un: (() => void) | null = null;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) void hide();
      })
      .then((f) => (un = f))
      .catch(() => {});
    return () => {
      window.removeEventListener("keydown", onKey);
      un?.();
    };
  }, []);

  return (
    <div className="mdb-window" data-seq={seq}>
      <DashboardSurface
        flags={{ widgets: flags.widgets, learn: flags.learn }}
        layout={layout}
        cards={cards}
        strip={strip}
        opens={opens}
        onOpensChange={(o) => {
          if (!flags.learn) return;
          setOpens(o);
          writeOpens(o);
        }}
        onLayoutChange={(l) => {
          setLayout(l);
          writeLayout(l);
        }}
        onCardOpen={(c) => runCardAction((c as DashCard).action ?? { kind: "none" })}
        onEmptyAction={(lane) => EMPTY_ACTIONS[lane]?.()}
        onClose={() => void hide()}
      />
    </div>
  );
};

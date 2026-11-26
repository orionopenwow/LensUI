// The Magic Dashboard window (surface "dashboard"; docs/plans/MAGIC_WAVES.md §4, wave M1).
// Opened by the Top Bar button or Command, only while magicWaves.dashboard is on. Each open reads
// Lens's own data once (Messages, Feeds, the calendar, the Shelf, now playing) and builds the
// lanes and the context strip; nothing is read in between and nothing goes over the network.
// Closes on ×, Esc, a second press of the button, or when another app takes the focus.
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { blurCloses, OPEN_GRACE_MS } from "./focus";
import { WidgetsLane } from "../widgets/WidgetsLane";
import { XLane } from "../widgets/XLane";
import { EMPTY_STORE, WIDGETS_CHANGED, widgetsApi, type WidgetStore } from "../widgets/api";
import { askText } from "./ask";

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

const hide = (reason: string) => invoke("dashboard_hide", { reason }).catch(() => {});


/** What opening a card does. Every action stays inside Lens. */
export function runCardAction(a: CardAction): void {
  switch (a.kind) {
    case "app":
      void openCoreApp(a.app).catch(() => {});
      return hideSoon("opened an app");
    case "url":
      void invoke("browser_open", { url: a.url }).catch(() => {});
      return hideSoon("opened a link");
    case "shelf":
      void invoke("open_surface", { label: "command" }).catch(() => {});
      return hideSoon("opened the Shelf");
    case "media":
      void invoke("media_control_cmd", { action: "play_pause" }).catch(() => {});
      return;
    case "none":
      return;
  }
}

const hideSoon = (reason: string) => void setTimeout(() => void hide(reason), 60);

/** The empty lanes' buttons. Lanes without one keep a disabled button. */
const EMPTY_ACTIONS: Partial<Record<LaneId, () => void>> = {
  inbox: () => void invoke("open_dock_popout_tab_cmd", { tab: "messages#messages" }).catch(() => {}),
  feeds: () => void openCoreApp("feeds").catch(() => {}),
  today: () => void invoke("open_quicksettings_tab_cmd", { tab: "calendar", section: "calendar" }).catch(() => {}),
};

/** Widget changes from Lens (another Dashboard open, the kill switch from Settings). */
const listenWidgets = (cb: (s: WidgetStore) => void) => {
  const un = listen<WidgetStore>(WIDGETS_CHANGED, (e) => cb(e.payload));
  return () => void un.then((f) => f()).catch(() => {});
};

export const DashboardWindow: React.FC = () => {
  const { config } = useLensState();
  const flags = magicFlags(config);
  const [cards, setCards] = useState<Card[]>([]);
  const [strip, setStrip] = useState<string[] | undefined>(undefined);
  const [layout, setLayout] = useState<LayoutId>(() => readLayout());
  const [opens, setOpens] = useState<Record<string, number>>(() => (flags.learn ? readOpens() : {}));
  const [seq, setSeq] = useState(0);
  const [widgets, setWidgets] = useState<WidgetStore>(EMPTY_STORE);
  useEffect(() => {
    if (!flags.widgets) return;
    void widgetsApi.state().then(setWidgets);
    return listenWidgets(setWidgets);
  }, [flags.widgets]);

  const refresh = useCallback(async () => {
    const now = new Date();
    const snap = await loadSnapshot(lensReaders, now);
    setCards(snap.cards);
    setStrip(stripItems(contextStrip({ now, unread: snap.unread, nextEvent: snap.next, shelfCount: snap.shelfCount }), snap));
    setSeq((n) => n + 1);
  }, []);

  // When it last opened, whether the page has painted since, and the last focus state Windows
  // reported. A focus loss inside the grace is decided when the grace ends: if the focus didn't
  // come back by then, it really moved away.
  const openedAt = useRef(Date.now());
  const painted = useRef(false);
  const focused = useRef(true);
  const graceTimer = useRef<number | null>(null);
  const markOpened = useCallback(() => {
    openedAt.current = Date.now();
    painted.current = false;
    focused.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => (painted.current = true)));
    if (graceTimer.current) window.clearTimeout(graceTimer.current);
    graceTimer.current = window.setTimeout(() => {
      graceTimer.current = null;
      if (!focused.current) void hide("focus moved to another window while it was opening");
    }, OPEN_GRACE_MS);
    document.documentElement.dataset.dashboardOpened = String(openedAt.current);
  }, []);

  // Rebuild on every open (and once on first load).
  useEffect(() => {
    markOpened();
    void refresh();
    const un = listen(OPEN_EVENT, () => {
      // Warm open (budget < 150 ms, docs/DASHBOARD.md): from Lens's "open" to the refreshed lanes
      // on screen. Recorded on the page for the perf scenario and the E2E.
      const t0 = performance.now();
      markOpened();
      void refresh().then(() =>
        requestAnimationFrame(() => requestAnimationFrame(() => (document.documentElement.dataset.dashboardWarmMs = String(Math.round(performance.now() - t0))))),
      );
    });
    return () => void un.then((f) => f());
  }, [refresh, markOpened]);

  // Turning the flag off closes the window; turning learning off forgets what it learned.
  useEffect(() => {
    if (config && !flags.dashboard) void hide("the Magic Dashboard was turned off");
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
        void hide("Esc");
      }
    };
    window.addEventListener("keydown", onKey);
    let un: (() => void) | null = null;
    getCurrentWindow()
      .onFocusChanged(({ payload }) => {
        focused.current = payload;
        if (!payload && blurCloses(Date.now(), openedAt.current, painted.current)) void hide("focus moved to another window");
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
        onCardAsk={(c) => {
          // Only this card's text goes to Ask, and Ask shows it first: nothing is sent until Enter.
          void invoke("show_command_cmd", { payload: { layout: "full", mode: "ask", text: askText(c) } }).catch(() => {});
          hideSoon("Ask about this");
        }}
        renderLane={(lane) =>
          lane === "widgets" ? <WidgetsLane listen={listenWidgets} /> : lane === "x" ? <XLane fetchOff={widgets.fetchOff} /> : null
        }
        onClose={() => void hide("×")}
      />
    </div>
  );
};

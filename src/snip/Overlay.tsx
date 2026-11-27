// The Lens Snip window: selection → studio, plus scrolling capture and recording hand-offs.
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Analysis, SessionInfo, SnipInfo, SnipSettings } from "./api";
import {
  DEFAULT_SNIP_SETTINGS, EVT, on, snipAnalyze, snipClose, snipCommit, snipRecordStart, snipScrollCapture, snipSession, snipSetSettings, snipStart,
  snipStatus, snipTakePending,
} from "./api";
import { Select, type SelectMode, type Selection } from "./Select";
import { Studio } from "./Studio";
import { physicalToCss, type Rect } from "./geom";
import { aiStatus } from "../ai/client";
import type { AiStatus } from "../ai/contract";
import { failLine, logFail, quiet, retryOnce } from "../failsafe/calls";

type Phase =
  | { kind: "idle" }
  | { kind: "select"; session: SessionInfo }
  | { kind: "busy"; message: string }
  | { kind: "studio"; info: SnipInfo; area: Rect; mask: { x: number; y: number }[] | null }
  | { kind: "error"; message: string };

export const Overlay: React.FC = () => {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [settings, setSettings] = useState<SnipSettings>(DEFAULT_SNIP_SETTINGS);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const lastSession = useRef<SessionInfo | null>(null);

  const close = useCallback(() => {
    setPhase({ kind: "idle" });
    setAnalysis(null);
    // A refused close would leave the overlay window over the whole screen: try once more.
    void retryOnce(() => snipClose(), "Snip", "close the snip window");
  }, []);

  const studioArea = useCallback((screen: Rect | null, session: SessionInfo | null): Rect => {
    // Centre the studio on the monitor that holds most of the snip.
    const dpr = window.devicePixelRatio || 1;
    const origin = session ? { x: session.origin.x, y: session.origin.y } : { x: 0, y: 0 };
    const mons = session?.monitors ?? [];
    const mon = screen ? mons.find((m) => screen.x + screen.w / 2 >= m.rect.x && screen.x + screen.w / 2 < m.rect.x + m.rect.w && screen.y + screen.h / 2 >= m.rect.y && screen.y + screen.h / 2 < m.rect.y + m.rect.h) : mons.find((m) => m.primary);
    if (!mon) return { x: 24, y: 24, w: window.innerWidth - 48, h: window.innerHeight - 48 };
    const c = physicalToCss(mon.rect, origin, dpr);
    return { x: c.x + 32, y: c.y + 32, w: c.w - 64, h: c.h - 64 };
  }, []);

  const openStudio = useCallback(
    (info: SnipInfo, session: SessionInfo | null, mask: { x: number; y: number }[] | null = null) => {
      setAnalysis(null);
      setPhase({ kind: "studio", info, area: studioArea(info.screenRect, session), mask });
      snipAnalyze(info.id).then(setAnalysis).catch((e) => setAnalysis({ ocr: null, suggestions: [], error: String(e) }));
    },
    [studioArea]
  );

  const begin = useCallback(async () => {
    const [s, st] = await Promise.all([snipSession(), snipStatus().catch(() => null)]); // settings fall back to the last ones
    if (st) setSettings(st.settings);
    aiStatus().then(setAi).catch(() => setAi(null));
    if (s) {
      lastSession.current = s;
      setPhase({ kind: "select", session: s });
    }
  }, []);

  useEffect(() => {
    // The page may load after the backend emitted; ask for anything we missed.
    snipTakePending()
      .then((p) => {
        if (p) openStudio(p, null);
        else void begin().catch(logFail("Snip", "start the snip"));
      })
      .catch(() => void begin().catch(logFail("Snip", "start the snip")));
    const uns = [
      on(EVT.begin, () => void begin().catch(logFail("Snip", "start the snip"))),
      on<SnipInfo>(EVT.studio, (info) => {
        void snipTakePending().catch(quiet); // only clears the backend's "pending" slot
        snipStatus().then((s) => setSettings(s.settings)).catch(quiet); // keeps the last settings
        aiStatus().then(setAi).catch(() => setAi(null));
        openStudio(info, lastSession.current);
      }),
      on<string>(EVT.error, (m) => setPhase({ kind: "error", message: m })),
      on<{ step: number }>(EVT.scroll, (p) => setPhase({ kind: "busy", message: `Scrolling… ${p.step} step${p.step === 1 ? "" : "s"}` })),
    ];
    return () => {
      uns.forEach((u) => u.then((f) => f()).catch(quiet));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelected = async (sel: Selection, mode: SelectMode) => {
    if (phase.kind !== "select") return;
    const session = phase.session;
    try {
      if (mode === "record") {
        await snipRecordStart(sel.rect);
        setPhase({ kind: "idle" });
        return;
      }
      if (mode === "scroll" && sel.hwnd !== undefined) {
        setPhase({ kind: "busy", message: "Scrolling the window… keep your hands off the mouse" });
        await snipScrollCapture(sel.hwnd);
        return;
      }
      const info = await snipCommit({ kind: sel.kind === "freeform" ? "region" : sel.kind, rect: sel.rect, hwnd: sel.hwnd ?? null });
      const mask = sel.points ? sel.points.map((p) => ({ x: p.x - sel.rect.x, y: p.y - sel.rect.y })) : null;
      openStudio(info, session, mask);
    } catch (e) {
      setPhase({ kind: "error", message: String(e) });
    }
  };

  useEffect(() => {
    if (phase.kind === "error") {
      const t = window.setTimeout(close, 4000);
      return () => window.clearTimeout(t);
    }
  }, [phase, close]);

  const saveQuick = (patch: Partial<SnipSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void snipSetSettings(next).catch((e) => setPhase({ kind: "error", message: failLine("Snip", "save that setting", e) }));
  };

  if (phase.kind === "select") {
    return (
      <Select
        session={phase.session}
        initialMode={(phase.session.mode as SelectMode) || "region"}
        delay={settings.delaySeconds}
        onDelay={(d) => {
          saveQuick({ delaySeconds: d });
          if (d > 0) {
            // A delay needs a fresh capture after it runs: start over with the delay.
            void snipClose().then(() => snipStart(phase.session.mode, d)).catch((e) => setPhase({ kind: "error", message: failLine("Snip", "start the delayed snip", e) }));
          }
        }}
        cursor={settings.includeCursor}
        onCursor={(c) => saveQuick({ includeCursor: c })}
        onDone={onSelected}
        onCancel={close}
      />
    );
  }
  if (phase.kind === "studio") {
    return (
      <div className="snip-root">
        <Studio
          info={phase.info}
          settings={settings}
          ai={ai}
          area={phase.area}
          analysis={analysis}
          mask={phase.mask}
          onClose={close}
          onNew={() => {
            void snipClose().then(() => snipStart()).catch((e) => setPhase({ kind: "error", message: failLine("Snip", "start a new snip", e) }));
          }}
        />
      </div>
    );
  }
  if (phase.kind === "busy" || phase.kind === "error") {
    return (
      <div className="snip-root">
        <div className="snip-toast" role="status" style={{ bottom: "50%" }}>
          {phase.message}
        </div>
      </div>
    );
  }
  return null;
};

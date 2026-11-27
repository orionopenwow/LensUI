// Drives conversation mode: voice events (heard, ask, state, levels, speech progress) and the
// AI answer stream, then speaks the answer with word progress. Esc closes; talking over Lens
// stops it (barge-in is handled by the backend, which then reports `interrupted`).

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { aiAsk, aiCancel, listenAiEvents } from "../ai/client";
import {
  VOICE_EVENTS,
  voiceConverse,
  voiceMute,
  voiceSay,
  voiceStopSpeaking,
  type VoiceApplyEvent,
  type VoiceHeardEvent,
  type VoiceResultEvent,
  type VoiceSpeechEvent,
  type VoiceStateEvent,
} from "./contract";
import { INITIAL_CONV, captionFrom, estimateWordMs, reduceConv, words } from "./convoState";
import { LEVEL_BARS } from "./hudState";
import { logFail, quiet } from "../failsafe/calls";

export function prefersReducedMotion(): boolean {
  const root = typeof document !== "undefined" ? document.documentElement.dataset.motion : "";
  if (root === "reduce") return true;
  if (root === "full") return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** How long to wait for Windows speech to report a word before revealing by estimate. */
export const SPEECH_WAIT_MS = 1500;

/** The conversation clock ticks only while a conversation is open. */
export const shouldTick = (open: boolean) => open;

export function useConversation(onHide?: () => void) {
  const [state, dispatch] = useReducer(reduceConv, INITIAL_CONV);
  const [levels, setLevels] = useState<number[]>(Array(LEVEL_BARS).fill(0));
  const [view, setView] = useState<"panel" | "fullscreen">("panel");
  const [now, setNow] = useState(Date.now());
  const st = useRef(state);
  st.current = state;
  const estimateTimer = useRef<number | undefined>(undefined);
  // The answer and request id as they stream (state lags a render behind the events).
  const answerBuf = useRef("");
  const reqId = useRef<string | null>(null);
  // Set by the one speech listener below when Windows reports a spoken word. `speak` used to add
  // a listener of its own each time and only removed it 1.5 s later, so every interruption inside
  // that window left one behind for good (B-120).
  const gotProgress = useRef(false);

  const speak = useCallback(async (text: string) => {
    window.clearTimeout(estimateTimer.current);
    if (!text.trim()) return;
    dispatch({ kind: "speaking" });
    gotProgress.current = false;
    voiceSay(text).catch(logFail("Voice", "speak the answer"));
    // If Windows speech doesn't report words within 1.5 s (speech off, another OS), reveal by
    // an estimate so the answer still reads naturally.
    const list = words(text);
    let i = 0;
    const step = () => {
      if (gotProgress.current || st.current.status !== "speaking") return;
      dispatch({ kind: "word", word: i, synced: false });
      i += 1;
      if (i >= list.length) {
        dispatch({ kind: "spoken", interrupted: false });
        return;
      }
      estimateTimer.current = window.setTimeout(step, estimateWordMs(list[i - 1].text));
    };
    estimateTimer.current = window.setTimeout(() => {
      if (!gotProgress.current) step();
    }, SPEECH_WAIT_MS);
  }, []);

  const ask = useCallback(async (text: string, source?: string) => {
    answerBuf.current = "";
    reqId.current = null;
    dispatch({ kind: "question", text });
    if (source) dispatch({ kind: "caption", text: captionFrom({ source }) });
    try {
      const id = await aiAsk({ prompt: text, context: {}, allow_tools: true });
      reqId.current = id;
      dispatch({ kind: "request", id });
    } catch (e) {
      dispatch({ kind: "say", text: String(e) });
    }
  }, []);

  const close = useCallback(() => {
    window.clearTimeout(estimateTimer.current);
    if (st.current.aiRequest) aiCancel(st.current.aiRequest).catch(logFail("Voice", "stop the answer"));
    voiceStopSpeaking().catch(logFail("Voice", "stop speaking"));
    voiceConverse(false).catch(logFail("Voice", "end the conversation"));
    dispatch({ kind: "close" });
    onHide?.();
  }, [onHide]);

  const stop = useCallback(() => {
    window.clearTimeout(estimateTimer.current);
    if (st.current.aiRequest && st.current.status === "thinking") aiCancel(st.current.aiRequest).catch(logFail("Voice", "stop the answer"));
    voiceStopSpeaking().catch(logFail("Voice", "stop speaking"));
    dispatch({ kind: "spoken", interrupted: true });
  }, []);

  const toggleMute = useCallback(() => {
    const m = !st.current.muted;
    dispatch({ kind: "muted", muted: m });
    voiceMute(m).catch((e) => {
      dispatch({ kind: "muted", muted: !m });
      logFail("Voice", m ? "mute the microphone" : "unmute the microphone")(e);
    });
  }, []);

  useEffect(() => {
    const uns = [
      listen<VoiceStateEvent>(VOICE_EVENTS.state, (e) => {
        const p = e.payload;
        if (p.conversation_view === "fullscreen" || p.conversation_view === "panel") setView(p.conversation_view);
        if (p.conversation && !st.current.open) dispatch({ kind: "open", at: Date.now() });
        if (p.muted !== st.current.muted) dispatch({ kind: "muted", muted: p.muted });
        if (p.phase === "listening" && !p.by_ptt) dispatch({ kind: "listening" });
        if (p.phase === "listening" && p.by_ptt) dispatch({ kind: "listening" });
      }),
      listen<{ level: number }>(VOICE_EVENTS.level, (e) => setLevels((l) => [...l.slice(1), Math.max(0, Math.min(1, e.payload.level || 0))])),
      listen<VoiceHeardEvent>(VOICE_EVENTS.heard, (e) => {
        if (st.current.open && !e.payload.partial && e.payload.text.trim()) dispatch({ kind: "question", text: e.payload.text.trim() });
      }),
      listen<VoiceApplyEvent>(VOICE_EVENTS.apply, (e) => {
        const a = e.payload;
        if (a.action === "conversation") {
          if (a.args.open) dispatch({ kind: "open", at: Date.now() });
          else close();
        } else if (a.action === "ask" && a.args.conversation && a.args.text) {
          if (!st.current.open) dispatch({ kind: "open", at: Date.now() });
          ask(a.args.text);
        }
      }),
      listen<VoiceResultEvent>(VOICE_EVENTS.result, (e) => {
        // In a conversation, command results are spoken back briefly ("Minimised Chrome.").
        const r = e.payload;
        if (!st.current.open || r.command === "ask" || r.command === "converse") return;
        if (r.status === "done" || r.status === "refused" || r.status === "failed" || r.status === "confirm") {
          const line = r.status === "confirm" ? `${r.label} Say yes or no.` : r.message || r.label;
          dispatch({ kind: "say", text: line });
          speak(line);
        }
      }),
      listen<VoiceSpeechEvent>(VOICE_EVENTS.speech, (e) => {
        gotProgress.current = true;
        if (!st.current.open) return;
        if (e.payload.done) dispatch({ kind: "spoken", interrupted: e.payload.interrupted });
        else dispatch({ kind: "word", word: e.payload.word, synced: true });
      }),
    ];
    let unAi: (() => void) | undefined;
    listenAiEvents((ev) => {
      if (ev.kind === "delta") {
        if (ev.payload.id === reqId.current) answerBuf.current += ev.payload.text;
        dispatch({ kind: "delta", id: ev.payload.id, text: ev.payload.text });
      }
      else if (ev.kind === "tool-proposal" || ev.kind === "tool-result") {
        if (ev.payload.id === reqId.current) dispatch({ kind: "caption", text: captionFrom({ summary: "summary" in ev.payload ? ev.payload.summary : ev.payload.message }) });
      } else if (ev.kind === "done" && ev.payload.id === reqId.current) {
        if (!st.current.caption) dispatch({ kind: "caption", text: captionFrom({ provider: ev.payload.provider, model: ev.payload.model }) });
        dispatch({ kind: "answered", id: ev.payload.id, error: ev.payload.error });
        speak(answerBuf.current || ev.payload.error || "");
      }
    })
      .then((u) => (unAi = u))
      .catch(logFail("Voice", "listen for answers"));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && st.current.open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      uns.forEach((u) => u.then((f) => f()).catch(quiet));
      unAi?.();
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(estimateTimer.current);
    };
  }, [ask, close, speak]);

  // The elapsed-time clock runs only while a conversation is open; a closed (hidden) window
  // does not re-render once a second.
  useEffect(() => {
    if (!shouldTick(state.open)) return;
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [state.open]);

  return { state, levels, view, elapsedMs: state.open ? now - state.startedAt : 0, reducedMotion: prefersReducedMotion(), toggleMute, stop, close };
}

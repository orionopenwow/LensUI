// Voice parity gallery: every HUD state, the mic indicator and button, and the Voice settings
// card, rendered with the real components and theme tokens.
//   ?scene=sheet|card|<state>&preset=<pack>
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import "./gallery.css";
import { applyThemeToDocument } from "../../../src/hooks/useLensState";
import { VoiceHud, MicIndicator, MicButton } from "../../../src/voice/VoiceHud";
import { VoiceCard } from "../../../src/components/VoiceCard";
import { INITIAL_HUD, reduceHud, type HudAction, type HudState } from "../../../src/voice/hudState";
import type { VoiceResultEvent, VoiceStateEvent } from "../../../src/voice/contract";
import { COMMANDS } from "./mockCore";
import { Conversation } from "../../../src/voice/Conversation";
import { INITIAL_CONV, type ConvState } from "../../../src/voice/convoState";
import { invoke } from "./mockCore";

const params = new URLSearchParams(location.search);
const scene = params.get("scene") || "sheet";

const st = (phase: VoiceStateEvent["phase"], extra: Partial<VoiceStateEvent> = {}): HudAction => ({
  kind: "state",
  payload: { phase, enabled: true, muted: false, listening: phase === "listening", by_ptt: true, activation: "both", paused_reason: null, hud_position: "dock", sounds: true, ...extra },
});
const res = (status: VoiceResultEvent["status"], extra: Partial<VoiceResultEvent>): HudAction => ({
  kind: "result",
  payload: { status, heard: "", command: null, label: "", message: "", confidence: 1, undo: null, suggestion: null, ...extra },
});
const wave = (n: number): HudAction[] => Array.from({ length: n }, (_, i) => ({ kind: "level", level: 0.15 + 0.75 * Math.abs(Math.sin(i * 0.55)) * (0.6 + 0.4 * Math.sin(i * 1.7)) }));
const make = (a: HudAction[]): HudState => a.reduce(reduceHud, INITIAL_HUD);

export const STATES: Record<string, { title: string; state: HudState }> = {
  idle: { title: "Idle (hidden; mic indicator only)", state: make([st("idle")]) },
  listening: { title: "Listening", state: make([st("idle"), st("listening"), ...wave(24)]) },
  partial: { title: "Listening · live words", state: make([st("listening"), ...wave(24), { kind: "heard", payload: { text: "move this window to work", partial: true } }]) },
  thinking: { title: "Recognising", state: make([st("listening"), st("thinking"), { kind: "heard", payload: { text: "Minimize Chrome.", partial: false } }]) },
  recognised: {
    title: "Recognised",
    state: make([st("thinking"), res("done", { command: "set_theme_pack", label: "Apply the Tokyo Night theme", message: "Applied Tokyo Night.", heard: "Theme Tokyo Night." }), st("done")]),
  },
  undo: {
    title: "Done · undo",
    state: make([st("thinking"), res("done", { command: "window_action", label: "Minimise Google Chrome", message: "Minimise Google Chrome.", undo: "Restore the window", heard: "Minimize Chrome." }), st("done")]),
  },
  confirm: {
    title: "Confirm (asks first)",
    state: make([st("thinking"), res("confirm", { command: "close_app", label: "Close Notepad?", message: "Close Notepad? Say yes or no.", heard: "close notepad" }), st("confirming")]),
  },
  suggest: {
    title: "Did you mean…",
    state: make([st("thinking"), res("suggest", { label: "Did you mean “show desktop”?", message: "Did you mean “show desktop”?", heard: "shoe desk top", suggestion: "show desktop" }), st("confirming")]),
  },
  error: {
    title: "Didn't catch that",
    state: make([st("thinking"), res("failed", { label: "Didn't catch that", message: "I didn't understand that. Say “Lens, help” to see what you can say.", heard: "banana bread" }), st("error")]),
  },
  refused: {
    title: "Refused (password field)",
    state: make([st("thinking"), res("refused", { command: "dictate", label: "Type · “hunter2”", message: "Lens never types into password fields.", heard: "type hunter2" }), st("error")]),
  },
  muted: {
    title: "Muted",
    state: make([st("muted", { muted: true, listening: false }), res("hint", { label: "Voice is muted", message: "Voice is muted. Press Ctrl+Alt+Shift+V to unmute." })]),
  },
  help: { title: "Help sheet", state: make([st("idle"), res("done", { command: "help", label: "Voice commands", message: "Here's what you can say." }), st("done")]) },
};

function Theme({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    invoke<any>("get_config").then((cfg) => {
      applyThemeToDocument(cfg, { accentHex: "#2D7D9A", accentR: 45, accentG: 125, accentB: 154, isDarkMode: true } as any);
      setReady(true);
    });
  }, []);
  return ready ? <>{children}</> : null;
}

function Tile({ name }: { name: string }) {
  const s = STATES[name];
  return (
    <figure className="vg-tile" data-state={name}>
      <figcaption>{s.title}</figcaption>
      <div className={`vg-stage ${name === "help" ? "tall" : ""}`}>
        <div className="vg-desk" />
        {name === "idle" ? (
          <div className="vg-idle">
            <MicIndicator state={{ enabled: true, listening: false, muted: false, pausedReason: null }} />
            <span>Ready · hold Ctrl + Alt + V</span>
          </div>
        ) : (
          <VoiceHud state={s.state} commands={COMMANDS as any} onButton={() => {}} onCloseHelp={() => {}} />
        )}
      </div>
    </figure>
  );
}

function Sheet() {
  return (
    <div className="vg-sheet">
      <h1>Voice HUD · {params.get("preset") || "obsidian"}</h1>
      <div className="vg-grid">
        {Object.keys(STATES).map((k) => (
          <Tile key={k} name={k} />
        ))}
        <figure className="vg-tile">
          <figcaption>Mic indicator and hold-to-talk button</figcaption>
          <div className="vg-stage vg-row">
            <MicIndicator state={{ enabled: true, listening: false, muted: false, pausedReason: null }} />
            <MicIndicator state={{ enabled: true, listening: true, muted: false, pausedReason: null }} />
            <MicIndicator state={{ enabled: true, listening: false, muted: true, pausedReason: null }} />
            <MicIndicator state={{ enabled: true, listening: false, muted: false, pausedReason: "In a call" }} />
            <MicButton onPress={() => {}} onRelease={() => {}} />
            <MicButton live onPress={() => {}} onRelease={() => {}} />
          </div>
        </figure>
      </div>
    </div>
  );
}

const ANSWER = "The XM6. RTINGS measured it noticeably quieter in the low end, which is where engine drone sits.";
const QUESTION = "Which one's quieter on a plane for twelve hours?";
const CONV: Record<string, ConvState> = {
  speaking: { ...INITIAL_CONV, open: true, status: "speaking", question: QUESTION, answer: ANSWER, spokenWord: 11, synced: true, caption: "Reading the RTINGS review on this PC…" },
  listening: { ...INITIAL_CONV, open: true, status: "listening" },
  thinking: { ...INITIAL_CONV, open: true, status: "thinking", question: QUESTION, caption: "Searching your Shelf for “headphones”…" },
  done: { ...INITIAL_CONV, open: true, status: "idle", question: QUESTION, answer: ANSWER, spokenWord: Number.POSITIVE_INFINITY, caption: "Answered on this PC · llama3.2" },
  muted: { ...INITIAL_CONV, open: true, status: "listening", muted: true },
};
const micLevels = Array.from({ length: 24 }, (_, i) => 0.2 + 0.7 * Math.abs(Math.sin(i * 0.6)));

function ConvScene({ name }: { name: string }) {
  // conv-<panel|full>-<state>[-reduced]
  const [, view, which, reduced] = name.split("-");
  return (
    <div className="vg-conv">
      {view === "panel" && <div className="vg-desk" />}
      <Conversation
        state={CONV[which] ?? CONV.speaking}
        view={view === "full" ? "fullscreen" : "panel"}
        levels={micLevels}
        elapsedMs={61_000}
        reducedMotion={reduced === "reduced"}
        frozenT={1.35}
        onMute={() => {}}
        onStop={() => {}}
        onClose={() => {}}
      />
    </div>
  );
}

function App() {
  if (scene.startsWith("conv-")) return <ConvScene name={scene} />;
  if (scene === "sheet") return <Sheet />;
  if (scene === "card")
    return (
      <div className="vg-card-page">
        <VoiceCard />
      </div>
    );
  return (
    <div className="vg-single">
      <Tile name={scene} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Theme>
    <App />
  </Theme>
);

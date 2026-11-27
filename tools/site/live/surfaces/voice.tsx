// The voice HUD for the website: the real VoiceHud (src/voice) on a transparent page, laid over a real
// desk by the host page. It plays one spoken command: the words arrive as Lens hears them, with the
// live waveform, then "Working on it…". The page starts it with ?say=… or {lens:"say", text}, and
// clears it with {lens:"clear"}. Reduced motion: the whole sentence, heard, still.
import "./embed";
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../../src/styles/tokens.css";
import "../../../../src/styles/global.css";
import { useLensState } from "../../../../src/hooks/useLensState";
import { VoiceHud } from "../../../../src/voice/VoiceHud";
import { INITIAL_HUD, LEVEL_BARS, type HudState } from "../../../../src/voice/hudState";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const base: HudState = { ...INITIAL_HUD, enabled: true, listening: true, byPtt: true, position: "dock", phase: "listening" };

function Voice() {
  useLensState();
  const [text, setText] = React.useState<string | null>(new URLSearchParams(location.search).get("say"));
  const [s, setS] = React.useState<HudState>(base);
  React.useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      if (e.data?.lens === "say") setText(String(e.data.text ?? ""));
      else if (e.data?.lens === "clear") setText(null);
    };
    addEventListener("message", on);
    return () => removeEventListener("message", on);
  }, []);
  React.useEffect(() => {
    if (!text) return;
    const words = text.split(" ");
    if (still) { setS({ ...base, heard: text, partial: false, levels: Array.from({ length: LEVEL_BARS }, (_, i) => 0.25 + 0.2 * Math.sin(i)) }); return; }
    let i = 0, t = 0;
    const levels = Array(LEVEL_BARS).fill(0);
    setS({ ...base, heard: "", levels: [...levels] });
    const wave = setInterval(() => { t++; levels.shift(); levels.push(i < words.length ? 0.25 + Math.abs(Math.sin(t * 1.7)) * 0.7 : 0.05); setS((x) => ({ ...x, levels: [...levels] })); }, 70);
    const word = setInterval(() => {
      i++;
      setS((x) => ({ ...x, heard: words.slice(0, i).join(" "), partial: i < words.length }));
      if (i >= words.length) {
        clearInterval(word);
        setTimeout(() => { clearInterval(wave); setS((x) => ({ ...x, phase: "thinking", listening: false, partial: false })); }, 700);
      }
    }, 260);
    return () => { clearInterval(wave); clearInterval(word); };
  }, [text]);
  if (!text) return null;
  return <VoiceHud state={s} onButton={() => {}} />;
}
ReactDOM.createRoot(document.getElementById("root")!).render(<div data-voice style={{ position: "fixed", inset: 0, pointerEvents: "none" }}><Voice /></div>);

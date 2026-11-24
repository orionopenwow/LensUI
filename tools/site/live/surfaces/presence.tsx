// "Lens at work" for the website: the real PresenceView (src/presence) on a transparent page, laid
// over a real surface by the host page. The page says where to go:
//   {lens:"go", from:[x,y], target:{x,y,w,h}, kind:"click"|"type"|"setting", label, text?, actor?}
// and the orb travels there along the app's own curve, at the app's own speed, and shows the step.
import "./embed";
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../../src/styles/tokens.css";
import "../../../../src/styles/global.css";
import { useLensState } from "../../../../src/hooks/useLensState";
import { PresenceView } from "../../../../src/presence/PresenceView";
import { caption, ease, sceneFor, travelMs, type Pt } from "../../../../src/presence/model";
import type { LRect, PresenceEvent } from "../../../../src/presence/types";

interface Go { from: [number, number]; target: LRect; kind?: PresenceEvent["kind"]; label?: string; text?: string; actor?: string; index?: number; total?: number }
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

function Presence() {
  useLensState();
  const [go, setGo] = React.useState<Go | null>(null);
  const [p, setP] = React.useState(0);
  React.useEffect(() => {
    const on = (e: MessageEvent) => { if (e.source === window.parent && e.data?.lens === "go") { setP(0); setGo(e.data as Go); } else if (e.source === window.parent && e.data?.lens === "clear") setGo(null); };
    addEventListener("message", on);
    return () => removeEventListener("message", on);
  }, []);
  React.useEffect(() => {
    if (!go) return;
    if (still) { setP(1); return; }
    const from: Pt = { x: go.from[0], y: go.from[1] };
    const d = travelMs(Math.hypot(go.target.x + go.target.w / 2 - from.x, go.target.y + go.target.h / 2 - from.y));
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => { const t = Math.min(1, (now - t0) / d); setP(ease(t)); if (t < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go]);
  if (!go) return null;
  const actor = go.actor ?? "Claude";
  const ev: PresenceEvent = {
    run: 1, seq: 2, actor: { kind: "external", label: actor }, external: true, visual: "full", travel: true, catchUp: false,
    kind: go.kind ?? "click", target: go.target, dest: null, monitor: null, caption: caption(actor, go.label ?? "", go.index ?? 1, go.total ?? null), text: go.text ?? null,
    index: go.index ?? 1, total: go.total ?? null, settings: go.kind === "setting" && go.text ? [go.text] : [], durationMs: 400, captions: true,
  } as PresenceEvent;
  return <PresenceView scene={sceneFor(ev, { x: go.from[0], y: go.from[1] })} progress={p} still={still} />;
}
ReactDOM.createRoot(document.getElementById("root")!).render(<div data-presence style={{ position: "fixed", inset: 0, pointerEvents: "none" }}><Presence /></div>);

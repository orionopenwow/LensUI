// Tiny earcons for voice (WebAudio, no files): a rising blip when listening starts, a falling
// one when it stops, a soft low tone on errors. Off when the user turns sounds off.

let ctx: AudioContext | null = null;

function tone(freqs: number[], ms: number, gain = 0.05) {
  try {
    const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    const c = ctx;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freqs[0], t0);
    if (freqs[1]) osc.frequency.exponentialRampToValueAtTime(freqs[1], t0 + ms / 1000);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + ms / 1000 + 0.02);
  } catch {
    /* audio unavailable: stay silent */
  }
}

export type Earcon = "start" | "stop" | "error" | "ok";

export function playEarcon(kind: Earcon) {
  if (kind === "start") tone([660, 990], 90);
  else if (kind === "stop") tone([880, 590], 90);
  else if (kind === "error") tone([300, 220], 160, 0.04);
  else tone([990, 1320], 70, 0.035);
}

/** Which earcon (if any) a phase change should play. Pure, for tests. */
export function earconFor(prev: string, next: string): Earcon | null {
  if (next === "listening" && prev !== "listening") return "start";
  if (prev === "listening" && next === "thinking") return "stop";
  if (next === "error" && prev !== "error") return "error";
  return null;
}

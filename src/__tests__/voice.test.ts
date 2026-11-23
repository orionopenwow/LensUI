// Voice control: HUD state machine and view, helpers for settings, earcons.
import { describe, expect, test } from "bun:test";
import { DEFAULT_VOICE_CONFIG, VOICE_EVENTS, prettyKeys, validHotkey, type VoiceResultEvent, type VoiceStateEvent } from "../voice/contract";
import { INITIAL_HUD, LEVEL_BARS, filterCommands, hudView, reduceHud, waveHeights, type HudAction, type HudState } from "../voice/hudState";
import { earconFor } from "../voice/sounds";

const st = (phase: VoiceStateEvent["phase"], extra: Partial<VoiceStateEvent> = {}): HudAction => ({
  kind: "state",
  payload: { phase, enabled: true, muted: false, listening: phase === "listening", by_ptt: true, activation: "ptt", paused_reason: null, hud_position: "dock", sounds: true, ...extra },
});
const res = (status: VoiceResultEvent["status"], extra: Partial<VoiceResultEvent> = {}): HudAction => ({
  kind: "result",
  payload: { status, heard: "", command: null, label: "", message: "", confidence: 1, undo: null, suggestion: null, ...extra },
});
const run = (actions: HudAction[], start: HudState = INITIAL_HUD) => actions.reduce(reduceHud, start);

describe("voice HUD", () => {
  test("hidden while off or idle", () => {
    expect(hudView(INITIAL_HUD).visible).toBe(false);
    expect(hudView(run([st("idle")])).visible).toBe(false);
  });

  test("listening shows the waveform and live words", () => {
    let s = run([st("idle"), st("listening"), { kind: "level", level: 0.8 }, { kind: "heard", payload: { text: "minimise th", partial: true } }]);
    const v = hudView(s);
    expect(v.visible).toBe(true);
    expect(v.tone).toBe("listening");
    expect(v.showWave).toBe(true);
    expect(v.detail).toContain("minimise th");
    expect(v.buttons).toEqual(["cancel"]);
    expect(s.levels.length).toBe(LEVEL_BARS);
    expect(s.levels[LEVEL_BARS - 1]).toBe(0.8);
    // Junk levels are clamped.
    s = reduceHud(s, { kind: "level", level: Number.NaN });
    expect(s.levels[LEVEL_BARS - 1]).toBe(0);
  });

  test("recognised command shows a chip and undo", () => {
    const s = run([st("listening"), st("thinking"), { kind: "heard", payload: { text: "Minimize this.", partial: false } }, res("done", { command: "window_action", label: "Minimise the window", message: "Minimise the window.", undo: "Restore the window", heard: "Minimize this." }), st("done")]);
    const v = hudView(s);
    expect(v.tone).toBe("ok");
    expect(v.chip).toBe("Minimise the window");
    expect(v.buttons).toEqual(["undo"]);
    expect(v.hint).toContain("undo");
    // After the HUD goes idle the undo stays reachable until dismissed.
    expect(hudView(reduceHud(s, st("idle"))).visible).toBe(true);
    expect(hudView(reduceHud(reduceHud(s, st("idle")), { kind: "dismiss" })).visible).toBe(false);
  });

  test("confirmation asks yes or no, by voice or click", () => {
    const s = run([st("thinking"), res("confirm", { label: "Close Notepad?", heard: "close notepad", command: "close_app" }), st("confirming")]);
    const v = hudView(s);
    expect(v.tone).toBe("ask");
    expect(v.buttons).toEqual(["yes", "no"]);
    expect(v.hint).toBe("Say yes or no");
    // While the spoken answer is captured, the question stays on screen.
    const l = hudView(reduceHud(s, st("listening")));
    expect(l.title).toBe("Close Notepad?");
    expect(l.buttons).toEqual(["yes", "no"]);
  });

  test("errors point to help; refusals explain", () => {
    const e = hudView(run([st("thinking"), res("failed", { label: "Didn't catch that", message: "Say \"Lens, help\"." }), st("error")]));
    expect(e.tone).toBe("error");
    expect(e.buttons).toEqual(["help"]);
    const r = hudView(run([st("thinking"), res("refused", { label: "Type", message: "Lens never types into password fields." }), st("error")]));
    expect(r.tone).toBe("warn");
    expect(r.detail).toContain("password");
  });

  test("muted hint offers unmute; help opens the sheet", () => {
    const m = hudView(run([st("muted", { muted: true }), res("hint", { label: "Voice is muted", message: "Press Ctrl+Alt+Shift+V." })]));
    expect(m.buttons).toEqual(["unmute"]);
    const h = run([st("idle"), res("done", { command: "help", label: "Voice commands" })]);
    expect(h.help).toBe(true);
  });

  test("a late partial never replaces the final words", () => {
    const s = run([st("listening"), st("thinking"), { kind: "heard", payload: { text: "dark mode", partial: false } }, { kind: "heard", payload: { text: "dar", partial: true } }]);
    expect(s.heard).toBe("dark mode");
  });

  test("new utterance clears the previous result unless a question is open", () => {
    const done = run([res("done", { label: "x" }), st("listening")]);
    expect(done.result).toBeNull();
    const asking = run([res("confirm", { label: "Lock the PC?" }), st("listening")]);
    expect(asking.result?.status).toBe("confirm");
  });

  test("waveform heights", () => {
    expect(waveHeights([0, 1, 0.5])).toEqual([3, 22, 15]);
    expect(waveHeights([-1, 2])).toEqual([3, 22]);
  });
});

describe("voice settings helpers", () => {
  test("defaults are off, push-to-talk and local", () => {
    expect(DEFAULT_VOICE_CONFIG.enabled).toBe(false);
    expect(DEFAULT_VOICE_CONFIG.activation).toBe("ptt");
    expect(DEFAULT_VOICE_CONFIG.cloud_speech).toBe(false);
    expect(VOICE_EVENTS.state).toBe("lens://voice/state");
  });

  test("hotkeys", () => {
    expect(validHotkey("Ctrl+Alt+V")).toBe(true);
    expect(validHotkey("ctrl + shift + F9")).toBe(true);
    expect(validHotkey("Alt+Space")).toBe(true);
    expect(validHotkey("V")).toBe(false);
    expect(validHotkey("Ctrl+Alt")).toBe(false);
    expect(validHotkey("Ctrl+Banana")).toBe(false);
    expect(prettyKeys("Ctrl+Alt+V")).toBe("Ctrl + Alt + V");
  });

  test("command search", () => {
    const list = [
      { id: "a", group: "Windows", title: "Minimise, restore", examples: ["minimise this"] },
      { id: "b", group: "Look", title: "Dark or light mode", examples: ["dark mode"] },
    ];
    expect(filterCommands(list, "").length).toBe(2);
    expect(filterCommands(list, "MINIM").map((c) => c.id)).toEqual(["a"]);
    expect(filterCommands(list, "look").map((c) => c.id)).toEqual(["b"]);
    expect(filterCommands(list, "zzz")).toEqual([]);
  });

  test("earcons", () => {
    expect(earconFor("idle", "listening")).toBe("start");
    expect(earconFor("listening", "thinking")).toBe("stop");
    expect(earconFor("thinking", "error")).toBe("error");
    expect(earconFor("thinking", "done")).toBeNull();
  });
});

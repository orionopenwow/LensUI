/**
 * Backdrop Lab local storage: My presets, the history strip and the current look.
 * Shared by the Studio window and the Settings embed (same origin). Everything stays on this PC.
 */
import { decodeState, encodeState, type BackdropState } from "./engine";

const K_MINE = "lens.backdrop.mine";
const K_HISTORY = "lens.backdrop.history";
const K_CURRENT = "lens.backdrop.current";
const K_COACH = "lens.backdrop.coach";
const K_PROMPT = "lens.backdrop.pendingPrompt";

export interface MyPreset {
  id: string;
  name: string;
  code: string;
  at: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: the Lab still works for this session */
  }
}

export function loadMine(): MyPreset[] {
  const list = read<MyPreset[]>(K_MINE, []);
  return Array.isArray(list) ? list.filter((p) => p && typeof p.code === "string" && decodeState(p.code)) : [];
}

export function saveMine(name: string, s: BackdropState): MyPreset[] {
  const list = loadMine();
  const item: MyPreset = { id: `mine-${Date.now().toString(36)}`, name: name.slice(0, 48) || "My backdrop", code: encodeState({ ...s, name }), at: Date.now() };
  const next = [item, ...list].slice(0, 100);
  write(K_MINE, next);
  return next;
}

export function removeMine(id: string): MyPreset[] {
  const next = loadMine().filter((p) => p.id !== id);
  write(K_MINE, next);
  return next;
}

/** Last 30 distinct looks you landed on (newest first). */
export function loadHistory(): string[] {
  const h = read<string[]>(K_HISTORY, []);
  return Array.isArray(h) ? h.filter((c) => typeof c === "string").slice(0, 30) : [];
}

export function pushHistory(s: BackdropState): string[] {
  const code = encodeState(s);
  const next = [code, ...loadHistory().filter((c) => c !== code)].slice(0, 30);
  write(K_HISTORY, next);
  return next;
}

export function loadCurrent(): BackdropState | null {
  const c = read<string | null>(K_CURRENT, null);
  return c ? decodeState(c) : null;
}

export function saveCurrent(s: BackdropState): void {
  write(K_CURRENT, encodeState(s));
}

export function coachSeen(): boolean {
  return read<boolean>(K_COACH, false);
}

export function setCoachSeen(): void {
  write(K_COACH, true);
}

/** A prompt handed over by Lens Command / voice before the Studio window existed. */
export function takePendingPrompt(): string | null {
  const p = read<string | null>(K_PROMPT, null);
  try {
    localStorage.removeItem(K_PROMPT);
  } catch {
    /* ignore */
  }
  return typeof p === "string" && p.trim() ? p.slice(0, 300) : null;
}

export function setPendingPrompt(text: string): void {
  write(K_PROMPT, text.slice(0, 300));
}

/** Undo / redo over states (50 steps). */
export class History {
  private past: string[] = [];
  private future: string[] = [];
  push(prev: BackdropState): void {
    const c = encodeState(prev);
    if (this.past[this.past.length - 1] === c) return;
    this.past.push(c);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
  }
  undo(cur: BackdropState): BackdropState | null {
    const c = this.past.pop();
    if (!c) return null;
    this.future.push(encodeState(cur));
    return decodeState(c);
  }
  redo(cur: BackdropState): BackdropState | null {
    const c = this.future.pop();
    if (!c) return null;
    this.past.push(encodeState(cur));
    return decodeState(c);
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
}

// Pure behaviour behind FillSlider: keys, wheel, drag and when a value is committed.
// The bar moves instantly; Windows is only told once the hand stops (release, or a short pause
// after keys/wheel), so a drag sends one call instead of hundreds.

export interface FillOpts {
  min?: number;
  max?: number;
  /** Debounce for keys/wheel commits, ms. */
  delay?: number;
}

export const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(v)));

/** Arrow keys move 1, PageUp/PageDown 10, Home/End jump to the ends. Returns null for other keys. */
export function keyStep(key: string, value: number, min = 0, max = 100): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clamp(value + 1, min, max);
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(value - 1, min, max);
    case "PageUp":
      return clamp(value + 10, min, max);
    case "PageDown":
      return clamp(value - 10, min, max);
    case "Home":
      return min;
    case "End":
      return max;
    default:
      return null;
  }
}

/** Wheel up = louder. One notch (≈100 px) = 2%. */
export function wheelStep(deltaY: number, value: number, min = 0, max = 100): number {
  if (!deltaY) return value;
  const notches = Math.max(1, Math.round(Math.abs(deltaY) / 100));
  return clamp(value + (deltaY < 0 ? 2 : -2) * notches, min, max);
}

/** Pointer x inside the bar → value. */
export function valueAt(x: number, left: number, width: number, min = 0, max = 100): number {
  const r = width > 0 ? (x - left) / width : 0;
  return clamp(min + Math.min(1, Math.max(0, r)) * (max - min), min, max);
}

type Timer = (fn: () => void, ms: number) => unknown;
type Clear = (t: unknown) => void;

/**
 * State machine for one bar. `show` gets every visual change; `commit` gets only settled values,
 * never the same value twice in a row.
 */
export function createFillController(
  initial: number,
  show: (v: number) => void,
  commit: (v: number) => void,
  opts: FillOpts & { setTimer?: Timer; clearTimer?: Clear } = {}
) {
  const { min = 0, max = 100, delay = 160 } = opts;
  const setT: Timer = opts.setTimer ?? ((f, ms) => setTimeout(f, ms));
  const clearT: Clear = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let value = clamp(initial, min, max);
  let committed = value;
  let dragging = false;
  let timer: unknown = null;

  const set = (v: number) => {
    value = clamp(v, min, max);
    show(value);
  };
  const flush = () => {
    if (timer !== null) clearT(timer);
    timer = null;
    if (value !== committed) {
      committed = value;
      commit(value);
    }
  };
  const later = () => {
    if (timer !== null) clearT(timer);
    timer = setT(flush, delay);
  };

  return {
    get value() {
      return value;
    },
    get dragging() {
      return dragging;
    },
    /** Outside updates (Windows changed it) are ignored mid-drag so the bar never jumps under the hand. */
    sync(v: number) {
      if (dragging || timer !== null) return;
      value = committed = clamp(v, min, max);
      show(value);
    },
    press(v: number) {
      dragging = true;
      set(v);
    },
    move(v: number) {
      if (dragging) set(v);
    },
    release() {
      if (!dragging) return;
      dragging = false;
      flush();
    },
    cancel() {
      dragging = false;
      if (timer !== null) clearT(timer);
      timer = null;
      set(committed);
    },
    key(k: string): boolean {
      const next = keyStep(k, value, min, max);
      if (next === null) return false;
      set(next);
      later();
      return true;
    },
    wheel(deltaY: number) {
      set(wheelStep(deltaY, value, min, max));
      later();
    },
    dispose() {
      if (timer !== null) clearT(timer);
      timer = null;
    },
  };
}

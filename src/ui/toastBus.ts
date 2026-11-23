// Framework-free toast queue (unit-tested in src/__tests__/ui.test.ts).

export type ToastKind = "info" | "success" | "error";
export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

/** Errors stay longer: people need time to read what went wrong and reach "Try again". */
export const TOAST_MS: Record<ToastKind, number> = { info: 2600, success: 2200, error: 5200 };

type Listener = (items: ToastItem[]) => void;

export function createToastBus() {
  let items: ToastItem[] = [];
  let seq = 0;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l(items));
  return {
    show(text: string, opts: Partial<Omit<ToastItem, "id" | "text">> = {}): number {
      // The same message twice in a row replaces the old one instead of stacking.
      const last = items[items.length - 1];
      if (last && last.text === text && last.kind === (opts.kind ?? "info")) items = items.slice(0, -1);
      const id = ++seq;
      items = [...items, { id, text, kind: opts.kind ?? "info", durationMs: opts.durationMs, action: opts.action }].slice(-5);
      emit();
      return id;
    },
    dismiss(id: number) {
      const next = items.filter((t) => t.id !== id);
      if (next.length !== items.length) {
        items = next;
        emit();
      }
    },
    clear() {
      items = [];
      emit();
    },
    get items() {
      return items;
    },
    subscribe(l: Listener): () => void {
      listeners.add(l);
      l(items);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export const toastBus = createToastBus();

/** toast("Saved"), toast.error("Couldn't reach Ollama", { action: { label: "Try again", onClick } }) */
export const toast = Object.assign((text: string, opts?: Partial<Omit<ToastItem, "id" | "text">>) => toastBus.show(text, opts), {
  success: (text: string, opts?: Partial<Omit<ToastItem, "id" | "text" | "kind">>) => toastBus.show(text, { ...opts, kind: "success" }),
  error: (text: string, opts?: Partial<Omit<ToastItem, "id" | "text" | "kind">>) => toastBus.show(text, { ...opts, kind: "error" }),
});

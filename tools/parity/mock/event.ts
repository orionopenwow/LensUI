type Cb = (e: { payload: any; event: string; id: number }) => void;
const subs: Record<string, Set<Cb>> = {};
export function emitLocal(event: string, payload: any) {
  (subs[event] ?? new Set()).forEach((cb) => cb({ payload, event, id: 0 }));
}
(globalThis as any).__lensEmit = emitLocal;
export async function listen<T = any>(event: string, cb: (e: { payload: T }) => void) {
  (subs[event] ??= new Set()).add(cb as Cb);
  return () => subs[event].delete(cb as Cb);
}
export async function emit(event: string, payload?: any) { emitLocal(event, payload); }

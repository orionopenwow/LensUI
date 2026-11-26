// Lens Remote's state in words (pure; tested).
import type { RemoteInfo } from "../types/generated";

/** The remote's state in words, for the indicator and Settings (pure; tested). */
export function remoteLine(r: RemoteInfo | null): string {
  if (!r || !r.on) return r?.note ?? "Off";
  const phones = r.phones === 0 ? "no phone paired yet" : r.phones === 1 ? "1 phone paired" : `${r.phones} phones paired`;
  return `On at ${r.address} · ${phones} · stops after ${r.idleMin} min without use`;
}

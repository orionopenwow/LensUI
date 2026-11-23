// Pure helpers behind the live Quick Settings rows (tested in src/__tests__/qsLive.test.ts).
import type { BluetoothState, MonitorBrightness, WifiState } from "../types/generated";

export interface TileState {
  sub: string;
  active: boolean;
  disabled: boolean;
}

/** Wi-Fi tile text from the real radio state: the network name, Off, or why it's unavailable. */
export function wifiTile(w: WifiState | null): TileState {
  if (!w) return { sub: "Checking…", active: false, disabled: true };
  if (!w.available) return { sub: w.reason || "Unavailable", active: false, disabled: true };
  if (w.radioOn === false) return { sub: "Off", active: false, disabled: false };
  if (w.radioOn == null) return { sub: w.connectedSsid ?? "Unknown", active: !!w.connectedSsid, disabled: false };
  return { sub: w.connectedSsid ?? "Not connected", active: true, disabled: false };
}

/** Bluetooth tile text: Off, or how many devices are connected. */
export function bluetoothTile(b: BluetoothState | null): TileState {
  if (!b) return { sub: "Checking…", active: false, disabled: true };
  if (!b.available) return { sub: b.reason || "Unavailable", active: false, disabled: true };
  if (b.radioOn === false) return { sub: "Off", active: false, disabled: false };
  const n = b.devices.filter((d) => d.connected).length;
  return { sub: n === 0 ? "On · nothing connected" : `${n} connected`, active: true, disabled: false };
}

/** Sound tile text from the real level and mute. */
export function soundTile(volume: number | null, muted: boolean): TileState {
  if (volume == null) return { sub: "Checking…", active: false, disabled: true };
  return { sub: muted ? "Muted" : `${Math.round(volume)}%`, active: !muted, disabled: false };
}

/** Display tile text: how many screens, and how many accept brightness. */
export function displayTile(screens: MonitorBrightness[] | null): TileState {
  if (!screens) return { sub: "Checking…", active: false, disabled: true };
  const ok = screens.filter((s) => s.supported).length;
  if (screens.length === 0) return { sub: "No brightness control", active: false, disabled: false };
  const n = screens.length === 1 ? "1 screen" : `${screens.length} screens`;
  return { sub: ok === screens.length ? n : `${n} · ${ok} adjustable`, active: ok > 0, disabled: false };
}

/**
 * Coalesces rapid slider calls: at most one in flight, and the latest value always wins.
 * Without it a drag fires dozens of overlapping Windows calls that land out of order.
 */
export function latestOnly<T>(send: (v: T) => Promise<unknown>, onError?: (e: unknown) => void) {
  let busy = false;
  let pending: { v: T } | null = null;
  const pump = () => {
    if (!pending) return;
    const { v } = pending;
    pending = null;
    busy = true;
    send(v)
      .catch((e) => onError?.(e))
      .finally(() => {
        busy = false;
        pump();
      });
  };
  return (v: T) => {
    pending = { v };
    if (!busy) pump();
  };
}

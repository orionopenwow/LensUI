import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./SystemModules.css";
import type * as Gen from "../types/generated";

// ---- Types mirroring src-tauri/src/win_system_modules.rs ----
export interface BatteryStatus {
  hasBattery: boolean;
  percent: number | null;
  charging: boolean;
  pluggedIn: boolean;
  secondsLeft: number | null;
  batterySaver: boolean;
  powerMode: "efficiency" | "balanced" | "performance" | "unknown" | string;
  powerModeSupported: boolean;
}

export type WifiNetwork = Gen.WifiNetwork;

export type WifiState = Gen.WifiState;

export interface BluetoothDevice {
  name: string;
  address: string;
  connected: boolean;
  kind: "audio" | "input" | "phone" | "computer" | "other" | string;
}

export type BluetoothState = Gen.BluetoothState;

export type KeyboardLayout = Gen.KeyboardLayout;

export type KeyboardState = Gen.KeyboardState;

export type AccountInfo = Gen.AccountInfo;

export type AudioDevice = Gen.AudioDevice;

export interface AudioDeviceList {
  flow: "render" | "capture" | string;
  devices: AudioDevice[];
  canSwitch: boolean;
}

/**
 * Polls a backend command while the window is visible. Returns [data, refresh, error].
 * `intervalMs` of 0 means "load once" (plus refresh on window focus).
 */
export function usePolled<T>(cmd: string, args: Record<string, unknown> | undefined, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const argsKey = JSON.stringify(args ?? {});
  const argsRef = useRef(args);
  argsRef.current = args;

  const refresh = useCallback(() => {
    return invoke<T>(cmd, argsRef.current ?? {})
      .then((v) => {
        setData(v);
        setError(null);
        return v;
      })
      .catch((e) => {
        setError(String(e));
        return null;
      });
  }, [cmd, argsKey]);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const t =
      intervalMs > 0
        ? window.setInterval(() => {
            if (!document.hidden) refresh();
          }, intervalMs)
        : 0;
    return () => {
      window.removeEventListener("focus", onFocus);
      if (t) window.clearInterval(t);
    };
  }, [refresh, intervalMs]);

  return [data, refresh, error, setData] as const;
}

/** Two-click confirm for actions that end a session (sign out, switch user). */
export function useArmed(timeoutMs = 3000) {
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), timeoutMs);
    return () => window.clearTimeout(t);
  }, [armed, timeoutMs]);
  return [armed, setArmed] as const;
}

export function openSetting(uri: string) {
  invoke("open_windows_setting_cmd", { uri }).catch(() => {});
}

/** Plain on/off switch matching the Quick Settings toggle (38×21 capsule). */
export function SysSwitch({
  on,
  label,
  disabled,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`sysmod-switch ${on ? "on" : ""}`}
      onClick={onToggle}
    >
      <span className="sysmod-switch-knob" />
    </button>
  );
}

export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h <= 0) return `${m} min`;
  return `${h} h ${m} min`;
}

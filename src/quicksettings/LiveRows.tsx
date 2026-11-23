// Live Quick Settings rows: real per-screen brightness, an expanding Night light with a schedule,
// connection tiles that show real state, and thumbnails of open windows. Styles: live.css.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bluetooth, ChevronRight, Monitor, Moon, Sun, Volume2, VolumeX, Wifi } from "lucide-react";
import { PillFillBar } from "../components/PillFillBar";
import type { BluetoothState, MonitorBrightness, NightLightSchedule, RunningWindow, WifiState } from "../types/generated";
import { bluetoothTile, displayTile, latestOnly, soundTile, wifiTile } from "./live";
import "./live.css";

const visible = () => document.visibilityState === "visible";

/** Polls a command while the window is visible. */
function usePoll<T>(cmd: string, ms: number, initial: T | null = null): [T | null, () => void] {
  const [v, setV] = useState<T | null>(initial);
  const load = useMemo(() => () => invoke<T>(cmd).then(setV).catch(() => {}), [cmd]);
  useEffect(() => {
    load();
    const t = window.setInterval(() => visible() && load(), ms);
    return () => window.clearInterval(t);
  }, [load, ms]);
  return [v, load];
}

/** One slider per screen; a screen that can't be dimmed says so instead of showing a dead slider. */
export const BrightnessRows: React.FC = () => {
  const [screens, reload] = usePoll<MonitorBrightness[]>("list_brightness_cmd", 15000);
  const [err, setErr] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, number>>({});
  const senders = useRef(new Map<string, (v: number) => void>());
  const sendFor = (id: string) => {
    let f = senders.current.get(id);
    if (!f) {
      f = latestOnly(
        (v: number) => invoke("set_monitor_brightness_cmd", { id, level: v }),
        (e) => {
          setErr(String(e));
          reload();
        },
      );
      senders.current.set(id, f);
    }
    return f;
  };
  if (!screens) return <div className="qsl-note">Reading your screens…</div>;
  if (screens.length === 0) return <div className="qsl-note">No screen here accepts brightness changes from Windows.</div>;
  return (
    <>
      {screens.map((m) =>
        m.supported ? (
          <PillFillBar
            key={m.id}
            label={screens.length > 1 ? m.name : "Brightness"}
            value={local[m.id] ?? m.brightness ?? 0}
            fillColor="#FBBF24"
            icon={<Sun size={15} />}
            onChange={(v) => {
              setErr(null);
              setLocal((p) => ({ ...p, [m.id]: v }));
              sendFor(m.id)(v);
            }}
          />
        ) : (
          <div key={m.id} className="qsl-unsupported">
            <Monitor size={14} />
            <span className="qsl-unsupported-name">{m.name}</span>
            <span className="qsl-unsupported-note">Not supported by this monitor</span>
          </div>
        ),
      )}
      {err && <div className="qsl-error">{err}</div>}
    </>
  );
};

/** Night light: a switch that expands into warmth and a schedule. */
export const NightLightPanel: React.FC<{ enabled: boolean; warmth: number; onToggle: () => void; onWarmth: (v: number) => void }> = ({
  enabled,
  warmth,
  onToggle,
  onWarmth,
}) => {
  const [open, setOpen] = useState(enabled);
  const [sched, setSched] = useState<NightLightSchedule | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    invoke<NightLightSchedule>("get_night_light_schedule_cmd").then(setSched).catch(() => {});
  }, []);
  const save = (next: NightLightSchedule) => {
    setSched(next);
    setErr(null);
    invoke("set_night_light_schedule_cmd", { schedule: next }).catch((e) => setErr(String(e)));
  };
  return (
    <div className={`qsl-night ${open ? "is-open" : ""}`}>
      <div className="qsl-night-head">
        <button type="button" className="qsl-night-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Moon size={15} />
          <span>Night light</span>
          <span className="qsl-night-state">{enabled ? `On · ${warmth}%` : sched?.mode === "custom" ? `Scheduled ${sched.from}–${sched.to}` : "Off"}</span>
          <ChevronRight size={14} className="qsl-chev" />
        </button>
        <button type="button" aria-label="Turn Night light on or off" className={`qs-switch amber ${enabled ? "on" : ""}`} onClick={onToggle}>
          <span className="qs-switch-knob" />
        </button>
      </div>
      <div className="qsl-night-body" aria-hidden={!open}>
        <div className="qsl-night-inner">
          <PillFillBar label="Warmth" value={warmth} fillColor="#FB923C" icon={<Moon size={15} />} onChange={onWarmth} />
          <div className="qsl-seg" role="radiogroup" aria-label="Night light schedule">
            {(["off", "custom"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={(sched?.mode ?? "off") === m}
                className={(sched?.mode ?? "off") === m ? "is-on" : ""}
                onClick={() => sched && save({ ...sched, mode: m })}
              >
                {m === "off" ? "No schedule" : "On a schedule"}
              </button>
            ))}
          </div>
          {sched?.mode === "custom" && (
            <div className="qsl-times">
              <label>
                From <input type="time" value={sched.from} onChange={(e) => save({ ...sched, from: e.target.value })} />
              </label>
              <label>
                To <input type="time" value={sched.to} onChange={(e) => save({ ...sched, to: e.target.value })} />
              </label>
            </div>
          )}
          {err && <div className="qsl-error">{err}</div>}
        </div>
      </div>
    </div>
  );
};

/** Coalesced master volume sender with an honest error line. */
export function useVolumeSender(onError: (msg: string) => void) {
  return useMemo(() => latestOnly((v: number) => invoke("set_volume_cmd", { level: v }), (e) => onError(String(e))), [onError]);
}

/** Wi-Fi, Bluetooth, Display and Sound tiles that show the real state. Tap toggles; › opens Windows Settings. */
export const ConnectionTiles: React.FC<{ volume: number | null; muted: boolean; onMute: () => void }> = ({ volume, muted, onMute }) => {
  const [wifi, loadWifi] = usePoll<WifiState>("get_wifi_cmd", 6000);
  const [bt, loadBt] = usePoll<BluetoothState>("get_bluetooth_cmd", 6000);
  const [screens] = usePoll<MonitorBrightness[]>("list_brightness_cmd", 20000);
  const [err, setErr] = useState<string | null>(null);
  const open = (uri: string) => invoke("open_windows_setting_cmd", { uri }).catch(() => {});
  const radio = (kind: "wifi" | "bluetooth", on: boolean, reload: () => void) =>
    invoke("set_radio_cmd", { kind, on })
      .then(() => {
        setErr(null);
        reload();
      })
      .catch((e) => setErr(`Couldn't turn ${kind === "wifi" ? "Wi-Fi" : "Bluetooth"} ${on ? "on" : "off"}: ${String(e)}`));
  const w = wifiTile(wifi);
  const b = bluetoothTile(bt);
  const d = displayTile(screens);
  const s = soundTile(volume, muted);
  const tile = (key: string, icon: React.ReactNode, label: string, t: typeof w, onTap: () => void, uri: string) => (
    <div key={key} className={`qsl-tile ${t.active ? "is-on" : ""} ${t.disabled ? "is-disabled" : ""}`}>
      <button type="button" className="qsl-tile-main" disabled={t.disabled} onClick={onTap} aria-pressed={t.active}>
        {icon}
        <span className="qsl-tile-text">
          <span className="qsl-tile-label">{label}</span>
          <span className="qsl-tile-sub">{t.sub}</span>
        </span>
      </button>
      <button type="button" className="qsl-tile-more" aria-label={`${label} settings`} onClick={() => open(uri)}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
  return (
    <>
      <div className="qsl-tiles">
        {tile("wifi", <Wifi size={16} />, "Wi-Fi", w, () => radio("wifi", wifi?.radioOn === false, loadWifi), "ms-settings:network-wifi")}
        {tile("bt", <Bluetooth size={16} />, "Bluetooth", b, () => radio("bluetooth", bt?.radioOn === false, loadBt), "ms-settings:bluetooth")}
        {tile("display", <Monitor size={16} />, "Display", d, () => open("ms-settings:display"), "ms-settings:display")}
        {tile("sound", muted ? <VolumeX size={16} /> : <Volume2 size={16} />, "Sound", s, onMute, "ms-settings:sound")}
      </div>
      {err && <div className="qsl-error">{err}</div>}
    </>
  );
};

/** Live thumbnails of open windows (DWM, drawn by Windows over these boxes). Click focuses. */
export const WindowThumbs: React.FC = () => {
  const [wins] = usePoll<RunningWindow[]>("get_running_windows", 4000);
  const shown = (wins ?? []).filter((w) => !w.isMinimized).slice(0, 6);
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const key = shown.map((w) => w.hwnd).join(",");
  useEffect(() => {
    if (!shown.length) return;
    const t = window.setTimeout(() => {
      const tiles = shown
        .map((w) => {
          const el = refs.current.get(w.hwnd)?.querySelector(".qsl-thumb-shot");
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { hwnd: w.hwnd, x: r.left, y: r.top, w: r.width, h: r.height };
        })
        .filter(Boolean);
      const background = getComputedStyle(document.documentElement).getPropertyValue("--lens-pack-base").trim() || "#141418";
      invoke("dock_preview_show_cmd", { tiles, background, surface: "quicksettings" }).catch(() => {});
    }, 260); // after the flyout's entrance glide, so the boxes are where they'll stay
    const hide = () => document.visibilityState !== "visible" && invoke("dock_preview_hide_cmd").catch(() => {});
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", hide);
      invoke("dock_preview_hide_cmd").catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!wins) return null;
  if (!shown.length) return <div className="qsl-note">No open windows.</div>;
  return (
    <div className="qsl-thumbs" aria-label="Open windows">
      {shown.map((w) => (
        <button
          key={w.hwnd}
          type="button"
          className={`qsl-thumb ${w.isFocused ? "is-focused" : ""}`}
          ref={(el) => {
            if (el) refs.current.set(w.hwnd, el);
            else refs.current.delete(w.hwnd);
          }}
          onClick={() => invoke("focus_window_cmd", { hwnd: w.hwnd }).catch(() => {})}
        >
          <span className="qsl-thumb-shot" />
          <span className="qsl-thumb-title">
            {w.iconDataUrl && <img src={w.iconDataUrl} alt="" />}
            {w.title || w.processName}
          </span>
        </button>
      ))}
    </div>
  );
};

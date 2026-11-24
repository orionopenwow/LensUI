import React, { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Bluetooth,
  Columns2,
  Columns3,
  Grid2x2,
  LayoutGrid,
  Minimize2,
  Moon,
  Pin,
  Power,
  Rocket,
  Sparkles,
  Sun,
  Wifi,
  BellOff,
  Gauge,
  PanelBottom,
  SlidersHorizontal,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";
import type { BatteryStatus, BluetoothState, QuickSettingsState, RunningWindow, WifiState, WindowStylingState } from "../../types/generated";
import { applyThemePack, packById, packSwatch, recommendedPacks } from "../../themes/packs";
import { FillSlider } from "../ui/FillSlider";
import { HeroTile, Section } from "../ui/primitives";
import type { PageProps } from "./common";

/** Every tile the Quick page can show. Order and visibility are the person's (saved per PC). */
export const QUICK_TILES = ["wifi", "bluetooth", "dark", "night", "focus", "power", "autohide", "startup"] as const;
export type QuickTileId = (typeof QUICK_TILES)[number];

const STORE_KEY = "lens.settings.quick.tiles.v1";

interface TileLayout {
  order: QuickTileId[];
  hidden: QuickTileId[];
}

export function loadLayout(raw: string | null): TileLayout {
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<TileLayout>) : {};
    const known = new Set<string>(QUICK_TILES);
    const order = (parsed.order ?? []).filter((t): t is QuickTileId => known.has(t));
    for (const t of QUICK_TILES) if (!order.includes(t)) order.push(t);
    const hidden = (parsed.hidden ?? []).filter((t): t is QuickTileId => known.has(t));
    return { order, hidden };
  } catch {
    return { order: [...QUICK_TILES], hidden: [] };
  }
}

export function moveTile(order: QuickTileId[], id: QuickTileId, by: -1 | 1): QuickTileId[] {
  const i = order.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Sets a swatch colour as a CSS variable (keeps colour data out of inline style objects). */
const paint = (bg: string) => (el: HTMLElement | null) => {
  el?.style.setProperty("--sh-swatch", bg);
};

const isLightPreset = (id: string) => packById(id)?.scheme === "light";
const ACCENTS = ["#A78BFA", "#60A5FA", "#38BDF8", "#34D399", "#FBBF24", "#FB923C", "#F472B6", "#FAFAFA"];

export const QuickPage: React.FC<PageProps> = ({ config, updateConfig }) => {
  const [qs, setQs] = useState<QuickSettingsState | null>(null);
  const [wifi, setWifi] = useState<WifiState | null>(null);
  const [bt, setBt] = useState<BluetoothState | null>(null);
  const [dnd, setDnd] = useState<boolean | null>(null);
  const [battery, setBattery] = useState<BatteryStatus | null>(null);
  const [styling, setStyling] = useState<WindowStylingState | null>(null);
  const [layout, setLayout] = useState<TileLayout>(() => {
    try {
      return loadLayout(localStorage.getItem(STORE_KEY));
    } catch {
      return loadLayout(null);
    }
  });
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    invoke<QuickSettingsState>("get_quick_state_cmd").then(setQs).catch(() => {});
    invoke<WifiState>("get_wifi_cmd").then(setWifi).catch(() => {});
    invoke<BluetoothState>("get_bluetooth_cmd").then(setBt).catch(() => {});
    invoke<boolean>("get_dnd_cmd").then(setDnd).catch(() => {});
    invoke<BatteryStatus>("get_battery_cmd").then(setBattery).catch(() => {});
    invoke<WindowStylingState>("get_window_styling_cmd").then(setStyling).catch(() => {});
  }, []);
  useEffect(() => {
    // First paint first: read the live state just after the page shows, then every 8 s while visible.
    const first = window.setTimeout(refresh, 60);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 8000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [refresh]);

  const saveLayout = (next: TileLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: the layout still applies for this session */
    }
  };

  const flash = (msg: string) => {
    setNote(msg);
    window.setTimeout(() => setNote((n) => (n === msg ? null : n)), 2600);
  };

  const light = isLightPreset(config.theme.preset);
  const autoHideOn = config.dock.autoHide !== "never";
  const powerMode = battery?.powerMode ?? "unknown";
  const nextPower = powerMode === "efficiency" ? "balanced" : powerMode === "balanced" ? "performance" : "efficiency";

  const tiles: Record<QuickTileId, React.ReactNode> = {
    wifi: (
      <HeroTile
        icon={<Wifi size={15} />}
        label="Wi-Fi"
        sub={wifi?.radioOn ? wifi.connectedSsid ?? "Not connected" : wifi?.available === false ? "Unavailable" : "Off"}
        active={!!wifi?.radioOn}
        disabled={wifi?.available === false}
        onClick={() => invoke("set_radio_cmd", { kind: "wifi", on: !wifi?.radioOn }).then(refresh).catch(() => flash("Couldn't change Wi-Fi."))}
      />
    ),
    bluetooth: (
      <HeroTile
        icon={<Bluetooth size={15} />}
        label="Bluetooth"
        sub={bt?.available === false ? "Unavailable" : bt?.radioOn ? `${bt.devices.filter((d) => d.connected).length} connected` : "Off"}
        active={!!bt?.radioOn}
        disabled={bt?.available === false}
        onClick={() => invoke("set_radio_cmd", { kind: "bluetooth", on: !bt?.radioOn }).then(refresh).catch(() => flash("Couldn't change Bluetooth."))}
      />
    ),
    dark: (
      <HeroTile
        icon={light ? <Sun size={15} /> : <Moon size={15} />}
        label={light ? "Light mode" : "Dark mode"}
        sub="Switch the theme"
        active={!light}
        onClick={() => updateConfig(applyThemePack(config, light ? "obsidian" : "alabaster-daylight"))}
      />
    ),
    night: (
      <HeroTile
        icon={<Sparkles size={15} />}
        label="Night light"
        sub={qs?.nightLightEnabled ? "On" : "Off"}
        active={!!qs?.nightLightEnabled}
        onClick={() =>
          invoke("set_night_light_cmd", { enabled: !qs?.nightLightEnabled, warmth: qs?.nightLightWarmth ?? 50 })
            .then(refresh)
            .catch(() => flash("Couldn't change Night light."))
        }
      />
    ),
    focus: (
      <HeroTile
        icon={<BellOff size={15} />}
        label="Do not disturb"
        sub={dnd ? "On" : "Off"}
        active={!!dnd}
        onClick={() => invoke("set_dnd_cmd", { enabled: !dnd }).then(refresh).catch(() => flash("Couldn't change Do not disturb."))}
      />
    ),
    power: (
      <HeroTile
        icon={<Gauge size={15} />}
        label="Power mode"
        sub={powerMode === "unknown" ? "Not available" : powerMode[0].toUpperCase() + powerMode.slice(1)}
        disabled={powerMode === "unknown"}
        onClick={() =>
          invoke<BatteryStatus>("set_power_mode_cmd", { mode: nextPower })
            .then(setBattery)
            .catch(() => flash("Windows didn't allow a power mode change."))
        }
      />
    ),
    autohide: (
      <HeroTile
        icon={<PanelBottom size={15} />}
        label="Dock auto-hide"
        sub={autoHideOn ? (config.dock.autoHide === "always" ? "Always" : "When windows overlap") : "Off"}
        active={autoHideOn}
        onClick={() => updateConfig({ ...config, dock: { ...config.dock, autoHide: autoHideOn ? "never" : "overlap" } })}
      />
    ),
    startup: (
      <HeroTile
        icon={<Rocket size={15} />}
        label="Start with Windows"
        sub={config.func.runOnStartup ? "On" : "Off"}
        active={config.func.runOnStartup}
        onClick={() => updateConfig({ ...config, func: { ...config.func, runOnStartup: !config.func.runOnStartup } })}
      />
    ),
  };

  const visible = layout.order.filter((t) => editing || !layout.hidden.includes(t));
  const packs = useMemo(() => recommendedPacks().slice(0, 8), []);

  // "Quick window": acts on the app windows behind Settings (never on Settings itself).
  const appWindows = async () =>
    (await invoke<RunningWindow[]>("get_running_windows").catch(() => [] as RunningWindow[])).filter(
      (w) => !/^lens[-_]ui/i.test(w.processName)
    );
  const tile = (layoutId: string) =>
    invoke<string>("tile_windows_cmd", { layout: layoutId })
      .then((m) => flash(m))
      .catch((e) => flash(String(e)));
  const minimizeAll = async () => {
    const wins = (await appWindows()).filter((w) => !w.isMinimized);
    await Promise.all(wins.map((w) => invoke("window_action_cmd", { hwnd: w.hwnd, action: "minimize" }).catch(() => {})));
    flash(wins.length ? `Minimised ${wins.length} window${wins.length === 1 ? "" : "s"}.` : "No open windows.");
  };
  const pinLast = async () => {
    const w = (await appWindows()).find((x) => !x.isMinimized);
    if (!w) return flash("No open window to pin.");
    await invoke("window_action_cmd", { hwnd: w.hwnd, action: "toggle_topmost" }).catch(() => {});
    flash(`Toggled always on top for ${w.title || w.processName}.`);
  };
  const dimOn = (styling?.settings.dimInactive ?? 0) > 0;
  const borderOn = (styling?.settings.activeBorder.mode ?? "off") !== "off";
  const setStylingField = (patch: Partial<WindowStylingState["settings"]>) => {
    if (!styling) return;
    const settings = { ...styling.settings, ...patch };
    invoke("set_window_styling_cmd", { settings })
      .then(() => setStyling({ ...styling, settings }))
      .catch(() => flash("Couldn't change window styling."));
  };

  return (
    <>
      <Section
        id="quick"
        title="Quick settings"
        summary="The settings you change most"
        actions={
          <button type="button" className="cc-chip" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
            <SlidersHorizontal size={13} aria-hidden /> {editing ? "Done" : "Edit"}
          </button>
        }
      >
        <div className="sh-quick-grid">
          {visible.map((id) => (
            <div key={id} className={`sh-quick-cell ${layout.hidden.includes(id) ? "is-hidden" : ""}`}>
              {tiles[id]}
              {editing && (
                <div className="sh-quick-edit" role="group" aria-label={`Arrange ${id}`}>
                  <button type="button" className="cc-chip" aria-label="Move earlier" onClick={() => saveLayout({ ...layout, order: moveTile(layout.order, id, -1) })}>
                    <ArrowLeft size={12} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="cc-chip"
                    aria-label={layout.hidden.includes(id) ? "Show" : "Hide"}
                    onClick={() =>
                      saveLayout({
                        ...layout,
                        hidden: layout.hidden.includes(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id],
                      })
                    }
                  >
                    {layout.hidden.includes(id) ? <Eye size={12} aria-hidden /> : <EyeOff size={12} aria-hidden />}
                  </button>
                  <button type="button" className="cc-chip" aria-label="Move later" onClick={() => saveLayout({ ...layout, order: moveTile(layout.order, id, 1) })}>
                    <ArrowRight size={12} aria-hidden />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="sh-quick-sliders">
          <FillSlider
            label="Volume"
            value={qs?.volume ?? 0}
            unit="%"
            muted={qs?.muted}
            disabled={!qs}
            onCommit={(v) => invoke("set_volume_cmd", { level: v }).then(refresh).catch(() => {})}
          />
          <FillSlider
            label="Brightness"
            value={qs?.brightness ?? 0}
            unit="%"
            disabled={!qs}
            onCommit={(v) => invoke("set_brightness_cmd", { level: v }).then(refresh).catch(() => {})}
          />
        </div>
      </Section>

      <Section id="look" title="Theme" summary={packById(config.theme.preset)?.label ?? config.theme.preset}>
        <div className="sh-quick-packs" role="radiogroup" aria-label="Theme pack">
          {packs.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={config.theme.preset === p.id}
              className={`sh-quick-pack ${config.theme.preset === p.id ? "is-on" : ""}`}
              onClick={() => updateConfig(applyThemePack(config, p.id))}
            >
              <span className="sh-quick-swatch" ref={paint(packSwatch(p))} aria-hidden />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <div className="sh-quick-accents" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((hex) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-label={`Accent ${hex}`}
              aria-checked={config.theme.accentMode === "custom" && config.theme.customAccent.toUpperCase() === hex}
              className="sh-quick-accent"
              ref={paint(hex)}
              onClick={() => updateConfig({ ...config, theme: { ...config.theme, accentMode: "custom", customAccent: hex } })}
            />
          ))}
        </div>
      </Section>

      <Section id="window" title="Quick window" summary="Arrange the windows behind Settings">
        <div className="sh-quick-grid">
          <HeroTile icon={<Columns2 size={15} />} label="Side by side" sub="Two windows" onClick={() => tile("split")} />
          <HeroTile icon={<Columns3 size={15} />} label="Thirds" sub="Three columns" onClick={() => tile("thirds")} />
          <HeroTile icon={<Grid2x2 size={15} />} label="Grid" sub="Four corners" onClick={() => tile("grid")} />
          <HeroTile icon={<LayoutGrid size={15} />} label="Organise" sub="Group by app" onClick={() => tile("smart-group")} />
          <HeroTile icon={<Minimize2 size={15} />} label="Minimise all" sub="Show the desktop" onClick={() => void minimizeAll()} />
          <HeroTile icon={<Pin size={15} />} label="Keep on top" sub="The last app you used" onClick={() => void pinLast()} />
          <HeroTile icon={<Power size={15} />} label="Overview" sub="Every window" onClick={() => invoke("open_surface", { label: "overview" }).catch(() => {})} />
          <HeroTile
            icon={<Sparkles size={15} />}
            label="Dim others"
            sub={dimOn ? `${styling?.settings.dimInactive}%` : "Off"}
            active={dimOn}
            disabled={!styling}
            onClick={() => setStylingField({ dimInactive: dimOn ? 0 : 20 })}
          />
          <HeroTile
            icon={<Sparkles size={15} />}
            label="Active border"
            sub={borderOn ? "On" : "Off"}
            active={borderOn}
            disabled={!styling}
            onClick={() =>
              styling &&
              setStylingField({ activeBorder: { ...styling.settings.activeBorder, mode: borderOn ? "off" : styling.caps.nativeBorder ? "native" : "overlay" } })
            }
          />
        </div>
      </Section>
      {note && (
        <div className="sh-quick-note" role="status">
          {note}
        </div>
      )}
    </>
  );
};

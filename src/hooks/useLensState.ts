import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LensConfig, WindowsThemeInfo, RunningWindow } from "../types/lens";
import { packById, lighten } from "../themes/packs";
import { ensurePackLoaded, loadCustomPacksFromDisk } from "../themes/customPacks";
import { setLocale } from "../i18n";
import { applyUiScale } from "../shell/uiScale";
import { applyDockEdge } from "../shell/dockEdge";
import { applyShapeStyle } from "../themes/shapes/shapes";
import "../themes/shapes/expressive.css";
import "../themes/dotmatrix/dotmatrix.css";
import { installKeyhookResponder } from "../shell/keyhookResponder";

export function applyThemeToDocument(cfg: LensConfig, winTheme: WindowsThemeInfo) {
  const root = document.documentElement;
  const activeAccent =
    cfg.theme.accentMode === "custom" ? cfg.theme.customAccent : winTheme.accentHex;

  root.dataset.preset = cfg.theme.preset;
  root.dataset.scheme = packById(cfg.theme.preset)?.scheme ?? "dark";
  // Accessibility: Lens overrides for motion and contrast (empty = follow Windows)
  root.dataset.motion =
    cfg.theme.motion === "reduce" || cfg.theme.motion === "full" ? cfg.theme.motion : "";
  root.dataset.contrast = cfg.theme.contrast === "high" ? "high" : "";
  setLocale(cfg.theme.locale);

  // Theme pack surface colors (Obsidian and unknown presets fall back to tokens.css defaults)
  const pack = packById(cfg.theme.preset);
  if (pack?.base) {
    root.style.setProperty("--lens-pack-base", pack.base);
    // Dark packs lift the glass layer slightly; light packs use pure white cards on the tinted base.
    root.style.setProperty(
      "--lens-pack-elevated",
      pack.scheme === "light" ? "#FFFFFF" : lighten(pack.base, 0.045)
    );
  } else {
    root.style.removeProperty("--lens-pack-base");
    root.style.removeProperty("--lens-pack-elevated");
  }
  root.style.setProperty("--lens-accent", activeAccent);
  applyShapeStyle(root, cfg.theme.shapeStyle, activeAccent, packById(cfg.theme.preset)?.base ?? "#09090B");
  root.style.setProperty("--lens-windows-accent", winTheme.accentHex);
  root.style.setProperty("--lens-glass-opacity", String(cfg.theme.glassOpacity));
  root.style.setProperty("--lens-glass-opacity-pct", `${Math.round(cfg.theme.glassOpacity * 100)}%`);
  root.style.setProperty("--lens-blur", `${cfg.theme.blurPx}px`);
  root.style.setProperty("--lens-radius", `${cfg.theme.borderRadius}px`);
  root.style.setProperty(
    "--lens-accent-tint",
    `${Math.round(cfg.theme.accentTintStrength * 100)}%`
  );
  root.style.setProperty("--dock-icon-size", `${cfg.dock.iconSize}px`);
  root.style.setProperty("--dock-hover-scale", String(cfg.dock.hoverScale));
  root.style.setProperty("--dock-hover-lift", `${cfg.dock.hoverLift}px`);

  // Live Font Family across all Lens UI surfaces
  const fontMap: Record<string, string> = {
    "rounded-arial": '"Arial Rounded MT Bold", "Arial Rounded", "Segoe UI Variable", system-ui, sans-serif',
    "inter-sans": '"Segoe UI Variable Display", "Inter", system-ui, -apple-system, sans-serif',
    "tech-mono": '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
    "editorial-serif": 'Georgia, Cambria, "Times New Roman", serif',
  };
  const chosenFont = fontMap[cfg.theme.fontFamily || "rounded-arial"] || fontMap["rounded-arial"];
  root.style.setProperty("--font-sans", chosenFont);
  document.body.style.fontFamily = chosenFont;

  // UI scale: the backend grows the windows, the webview zoom grows the content (src/shell/uiScale.ts)
  applyUiScale(cfg.theme.uiScale);
  // Which edge the Dock is on, for flyouts that attach to it (src/shell/dockEdge.ts)
  applyDockEdge(cfg.dock.position);
  installKeyhookResponder();

  // Inject user Custom CSS override safely
  let styleEl = document.getElementById("lens-custom-css") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "lens-custom-css";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = cfg.theme.customCss || "";
}

export function useLensState() {
  const [config, setConfig] = useState<LensConfig | null>(null);
  const [winTheme, setWinTheme] = useState<WindowsThemeInfo>({
    accentHex: "#2D7D9A",
    accentR: 45,
    accentG: 125,
    accentB: 154,
    appsUseLightTheme: false,
    systemUsesLightTheme: false,
    transparencyEnabled: true,
    osFamily: "windows",
    windowsBuild: 0,
  });

  useEffect(() => {
    let mounted = true;
    Promise.all([
      invoke<LensConfig>("get_config"),
      invoke<WindowsThemeInfo>("get_windows_theme"),
    ])
      .then(async ([cfg, theme]) => {
        await loadCustomPacksFromDisk();
        if (!mounted) return;
        setConfig(cfg);
        setWinTheme(theme);
        applyThemeToDocument(cfg, theme);
      })
      .catch(console.error);

    const unlistenCfg = listen<LensConfig>("lens://config-updated", (event) => {
      // A custom pack imported in another window is unknown here until its file is read.
      ensurePackLoaded(event.payload.theme.preset).finally(() => {
        if (mounted) setConfig({ ...event.payload });
      });
    });
    const unlistenTheme = listen<WindowsThemeInfo>("lens://windows-theme", (event) => {
      setWinTheme(event.payload);
    });

    return () => {
      mounted = false;
      unlistenCfg.then((fn) => fn());
      unlistenTheme.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (config) {
      applyThemeToDocument(config, winTheme);
    }
  }, [config, winTheme]);

  const updateConfig = useCallback(async (incoming: LensConfig) => {
    // Keep the native titlebar color in step with the active pack, whichever surface changed the preset.
    const surfaceHex = packById(incoming.theme.preset)?.base ?? "";
    const next =
      (incoming.theme.surfaceHex ?? "") === surfaceHex
        ? incoming
        : { ...incoming, theme: { ...incoming.theme, surfaceHex } };
    setConfig(next);
    await invoke("save_config_cmd", { newConfig: next });
  }, []);

  return { config, winTheme, updateConfig };
}

/**
 * Live list of app windows. The backend pushes "lens://windows-changed" the moment a window
 * opens, closes, is renamed, focused or minimized (win_events.rs). Polling is only a safety net:
 * it runs at `intervalMs` until the first push arrives, then drops to one check every 5 s.
 */
export function useRunningWindows(intervalMs = 900) {
  const [windows, setWindows] = useState<RunningWindow[]>([]);

  useEffect(() => {
    let alive = true;
    let lastSig = "";
    let pushSeen = false;
    let lastPoll = 0;

    // Only re-render when something actually changed — an idle desktop costs zero React work.
    const accept = (list: RunningWindow[]) => {
      if (!alive) return;
      const sig = list
        .map(
          (w) =>
            `${w.hwnd}|${w.title}|${w.isFocused ? 1 : 0}${w.isMinimized ? 1 : 0}${w.isMaximized ? 1 : 0}|${w.iconDataUrl?.length ?? 0}`
        )
        .join("\n");
      if (sig === lastSig) return;
      lastSig = sig;
      setWindows(list);
    };

    const poll = (force = false) => {
      // Hidden surfaces (palette, settings) do no work at all.
      if (document.hidden) return;
      const nowMs = Date.now();
      if (!force && pushSeen && nowMs - lastPoll < 5000) return;
      lastPoll = nowMs;
      invoke<RunningWindow[]>("get_running_windows")
        .then(accept)
        .catch(() => {});
    };

    const unlisten = listen<RunningWindow[]>("lens://windows-changed", (event) => {
      pushSeen = true;
      if (!document.hidden) accept(event.payload);
    });
    const onVisible = () => poll(true);
    document.addEventListener("visibilitychange", onVisible);

    poll(true);
    const timer = window.setInterval(() => poll(), intervalMs);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unlisten.then((fn) => fn());
    };
  }, [intervalMs]);

  return windows;
}

export function useSurfaceGlide(label: string) {
  const [phase, setPhase] = useState<"is-open" | "is-pre-open" | "is-closing">("is-open");

  useEffect(() => {
    const triggerOpenGlide = () => {
      setPhase("is-pre-open");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPhase("is-open");
        });
      });
    };

    const unlisten = listen<{ label: string; state: "open" | "closing" }>(
      "lens://surface-glide",
      (e) => {
        if (e.payload?.label !== label) return;
        if (e.payload.state === "closing") {
          setPhase("is-closing");
        } else {
          triggerOpenGlide();
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [label]);

  return phase;
}

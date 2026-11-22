import { invoke } from "@tauri-apps/api/core";
import { THEME_PACKS, applyThemePack } from "../themes/packs";
import type { LensConfig } from "../types/lens";

export interface ParsedDesktopAction {
  id: string;
  label: string;
  category: "audio" | "display" | "theme" | "window" | "desktop" | "shell" | "media";
  color: string;
  run: (ctx: {
    config: LensConfig;
    updateConfig: (next: LensConfig) => Promise<void> | void;
  }) => Promise<string>;
}

interface AudioAppSession {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
}

function parseSingleClause(rawClause: string, idx: number): ParsedDesktopAction | null {
  const c = rawClause.trim();
  const p = c.toLowerCase();
  if (!p) return null;

  // 1. Per-app mute / unmute ("mute chrome", "unmute spotify")
  const appMute = p.match(/^(mute|unmute)\s+([a-z0-9._ -]{2,28})$/);
  if (appMute && !["sound", "audio", "volume", "system", "all", "master"].includes(appMute[2].trim())) {
    const mute = appMute[1] === "mute";
    const targetApp = appMute[2].trim();
    return {
      id: `nl-appmute-${idx}`,
      label: `${mute ? "Mute" : "Unmute"} ${targetApp}`,
      category: "audio",
      color: "#38BDF8",
      run: async () => {
        const sessions = await invoke<AudioAppSession[]>("list_audio_sessions_cmd").catch(() => []);
        const matched = sessions.filter((s) => s.name.toLowerCase().includes(targetApp));
        if (matched.length === 0) return `No active audio session for "${targetApp}"`;
        await Promise.all(
          matched.map((s) => invoke("set_app_mute_cmd", { pid: s.pid, muted: mute }))
        );
        return `${mute ? "Muted" : "Unmuted"} ${matched[0].name}`;
      },
    };
  }

  // 2. Master mute / unmute
  if (/^(mute|unmute)(\s+(audio|sound|volume|system|master))?$/.test(p)) {
    const mute = p.startsWith("mute");
    return {
      id: `nl-mute-${idx}`,
      label: mute ? "Mute Master Volume" : "Unmute Master Volume",
      category: "audio",
      color: "#38BDF8",
      run: async () => {
        await invoke("set_mute_cmd", { muted: mute });
        return mute ? "Master audio muted" : "Master audio unmuted";
      },
    };
  }

  // 3. Brightness ("40% brightness" or "brightness 40%")
  const brightMatch =
    p.match(/(\d{1,3})\s*%?\s*(brightness|bright|screen)/) ||
    p.match(/(brightness|bright)\s*(?:to\s+)?(\d{1,3})\s*%?/);
  if (brightMatch) {
    const rawNum = /^\d+$/.test(brightMatch[1]) ? brightMatch[1] : brightMatch[2];
    const pct = Math.min(100, Math.max(5, parseInt(rawNum, 10)));
    return {
      id: `nl-bright-${idx}`,
      label: `Brightness → ${pct}%`,
      category: "display",
      color: "#FBBF24",
      run: async () => {
        await invoke("set_brightness_cmd", { level: pct });
        return `Brightness set to ${pct}%`;
      },
    };
  }

  // 4. Master Volume ("80% volume" or "volume 80%")
  const volMatch =
    p.match(/(\d{1,3})\s*%?\s*(volume|vol|sound|audio)/) ||
    p.match(/(volume|vol|sound|audio)\s*(?:to\s+)?(\d{1,3})\s*%?/);
  if (volMatch) {
    const rawNum = /^\d+$/.test(volMatch[1]) ? volMatch[1] : volMatch[2];
    const pct = Math.min(100, Math.max(0, parseInt(rawNum, 10)));
    return {
      id: `nl-vol-${idx}`,
      label: `Volume → ${pct}%`,
      category: "audio",
      color: "#38BDF8",
      run: async () => {
        await invoke("set_volume_cmd", { level: pct });
        return `Volume set to ${pct}%`;
      },
    };
  }

  // 5. Night Light ("night light on/off", "night light 60%")
  if (p.includes("night light") || p.includes("nightlight") || p.includes("warmth")) {
    const off = p.includes("off") || p.includes("disable");
    const numMatch = p.match(/(\d{1,3})/);
    const strength = off ? 0 : numMatch ? Math.min(100, Math.max(10, parseInt(numMatch[1], 10))) : 55;
    return {
      id: `nl-night-${idx}`,
      label: off ? "Night Light Off" : `Night Light → ${strength}%`,
      category: "display",
      color: "#FB923C",
      run: async () => {
        await invoke("set_night_light_cmd", { enabled: !off, warmth: strength });
        return off ? "Night Light disabled" : `Night Light enabled (${strength}%)`;
      },
    };
  }

  // 6. Window Tiling & Smart Window Organizer
  if (
    p.includes("tile") ||
    p.includes("organize window") ||
    p.includes("smart group") ||
    p.includes("focus stack") ||
    p.includes("split window") ||
    p.includes("snap window")
  ) {
    const layout = p.includes("grid") || p.includes("quad")
      ? "grid"
      : p.includes("third") || p.includes("column")
        ? "thirds"
        : p.includes("split") || p.includes("left") || p.includes("side")
          ? "split"
          : p.includes("organize") || p.includes("group") || p.includes("smart")
            ? "smart-group"
            : "focus-stack";
    const niceLabel =
      layout === "grid"
        ? "Tile 2×2 Quad Grid"
        : layout === "thirds"
          ? "Tile 3 Columns"
          : layout === "split"
            ? "Tile 50/50 Split"
            : layout === "smart-group"
              ? "Smart Organize Windows"
              : "Tile Master-Stack";
    return {
      id: `nl-tile-${idx}`,
      label: niceLabel,
      category: "window",
      color: "#34D399",
      run: async () => {
        return await invoke<string>("tile_windows_cmd", { layout });
      },
    };
  }

  // 7. Window Opacity ("80% opacity", "opacity 70%")
  const opMatch =
    p.match(/(\d{2,3})\s*%?\s*(opacity|transparent|glass)/) ||
    p.match(/(opacity|glass)\s*(?:to\s+)?(\d{2,3})\s*%?/);
  if (opMatch) {
    const rawNum = /^\d+$/.test(opMatch[1]) ? opMatch[1] : opMatch[2];
    const pct = Math.min(100, Math.max(40, parseInt(rawNum, 10)));
    return {
      id: `nl-opacity-${idx}`,
      label: `Window Opacity → ${pct}%`,
      category: "theme",
      color: "#A78BFA",
      run: async ({ config, updateConfig }) => {
        await updateConfig({ ...config, theme: { ...config.theme, glassOpacity: pct / 100 } });
        return `Window opacity set to ${pct}%`;
      },
    };
  }

  // 8. Corner Roundness ("sharp corners", "round corners", "12px corners")
  if (p.includes("corner") || p.includes("roundness")) {
    const numMatch = p.match(/(\d{1,2})/);
    const radius = numMatch
      ? Math.min(20, Math.max(0, parseInt(numMatch[1], 10)))
      : p.includes("sharp") || p.includes("square")
        ? 4
        : 16;
    return {
      id: `nl-radius-${idx}`,
      label: `Window Roundness → ${radius}px`,
      category: "theme",
      color: "#A78BFA",
      run: async ({ config, updateConfig }) => {
        await updateConfig({ ...config, theme: { ...config.theme, borderRadius: radius } });
        return `Corner roundness set to ${radius}px`;
      },
    };
  }

  // 9. Theme Presets ("catppuccin theme", "nord theme", "midnight theme", "dracula", etc.)
  for (const pack of THEME_PACKS) {
    const hit = [pack.id, pack.label.toLowerCase(), ...pack.aliases].some(
      (key) => p === key || p === `${key} theme` || (p.includes(key) && (p.includes("theme") || p.includes("mode")))
    );
    if (hit) {
      return {
        id: `nl-theme-${idx}`,
        label: `${pack.label} Theme`,
        category: "theme",
        color: pack.accent === "#FAFAFA" ? "#A78BFA" : pack.accent,
        run: async ({ config, updateConfig }) => {
          await updateConfig(applyThemePack(config, pack.id));
          return `Applied ${pack.label} Theme`;
        },
      };
    }
  }

  // 10. Virtual Desktop Switch ("next desktop", "prev desktop", "new desktop")
  if (p.includes("desktop") && (p.includes("next") || p.includes("prev") || p.includes("new") || p.includes("right") || p.includes("left"))) {
    const direction = p.includes("new")
      ? "new"
      : p.includes("prev") || p.includes("left")
        ? "prev"
        : "next";
    return {
      id: `nl-vdesk-${idx}`,
      label: direction === "new" ? "New Virtual Desktop" : direction === "prev" ? "Previous Desktop" : "Next Desktop",
      category: "desktop",
      color: "#60A5FA",
      run: async () => {
        await invoke("switch_virtual_desktop_cmd", { direction });
        return `Switched virtual desktop (${direction})`;
      },
    };
  }

  // 11. Media Controls ("play music", "pause spotify", "next track", "previous song")
  if (
    /^(play|pause|resume)(\s+(music|spotify|media|song))?$/.test(p) ||
    /^(next|prev|previous)\s+(track|song|music)$/.test(p)
  ) {
    const action = p.startsWith("next") ? "next" : p.startsWith("prev") ? "prev" : "play_pause";
    return {
      id: `nl-media-${idx}`,
      label: action === "next" ? "Next Track" : action === "prev" ? "Previous Track" : "Play / Pause Media",
      category: "media",
      color: "#1DB954",
      run: async () => {
        await invoke("media_control_cmd", { action });
        return `Media: ${action.replace("_", "/")}`;
      },
    };
  }

  // 12. Taskbar hide/show
  if (p.includes("taskbar") && (p.includes("hide") || p.includes("show"))) {
    const hide = p.includes("hide");
    return {
      id: `nl-taskbar-${idx}`,
      label: hide ? "Hide Windows Taskbar" : "Show Windows Taskbar",
      category: "shell",
      color: "#94A3B8",
      run: async ({ config, updateConfig }) => {
        await updateConfig({ ...config, func: { ...config.func, hideNativeTaskbar: hide } });
        return hide ? "Windows Taskbar hidden" : "Windows Taskbar restored";
      },
    };
  }

  return null;
}

export function parseNaturalLanguageActions(query: string): ParsedDesktopAction[] {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const clauses = trimmed
    .split(/\s*(?:,|;|\band\b|\bthen\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const actions: ParsedDesktopAction[] = [];
  clauses.forEach((clause, idx) => {
    const parsed = parseSingleClause(clause, idx);
    if (parsed) actions.push(parsed);
  });
  return actions;
}

export async function executeNaturalLanguagePlan(
  query: string,
  actions: ParsedDesktopAction[],
  config: LensConfig,
  updateConfig: (next: LensConfig) => Promise<void> | void,
  source = "search-router"
): Promise<string[]> {
  let latestConfig = config;
  const wrappedUpdate = async (next: LensConfig) => {
    latestConfig = next;
    await updateConfig(next);
  };

  const results: string[] = [];
  for (const act of actions) {
    try {
      const msg = await act.run({ config: latestConfig, updateConfig: wrappedUpdate });
      results.push(msg);
    } catch (e) {
      results.push(`${act.label}: ${String(e)}`);
    }
  }

  const summary = results.join(" · ");
  invoke("push_notification_cmd", {
    title: "Lens Action Router",
    body: summary,
    appName: "Lens AI",
    category: "agent",
  }).catch(() => {});

  // Log accepted plan to local DPO dataset (dpo_pairs.jsonl)
  invoke("record_dpo_pair_cmd", {
    prompt: query.trim(),
    chosen: actions.map((a) => a.label).join(" -> "),
    rejected: "no_op",
    source,
  }).catch(() => {});

  return results;
}

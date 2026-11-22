import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LayoutGrid,
  Bell,
  Plus,
  Search,
  Layers,
  Wifi,
  Volume2,
  Settings,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Music,
} from "lucide-react";
import { useLensState } from "../hooks/useLensState";
import type { MediaNowPlaying } from "../types/lens";
import { TrayStrip } from "../components/TrayStrip";
import { PluginSlot } from "../components/PluginSlot";
import { WorkspaceStrip, readWorkspaces } from "../components/WorkspacesCard";
import { BatteryTopBarModule } from "../components/BatteryModule";
import { KeyboardTopBarModule } from "../components/KeyboardLayoutModule";
import "./TopBarSurface.css";

export const TopBarSurface: React.FC = () => {
  const { config } = useLensState();
  const [now, setNow] = useState(() => new Date());
  const [visible, setVisible] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [media, setMedia] = useState<MediaNowPlaying | null>(null);
  const topSearchInputRef = React.useRef<HTMLInputElement>(null);
  const searchOpenRef = React.useRef(false);
  searchOpenRef.current = searchOpen;

  const showTopMedia = config?.topBar?.showMediaControls ?? true;

  useEffect(() => {
    if (!showTopMedia) {
      setMedia(null);
      return;
    }
    let alive = true;
    const pollMedia = () => {
      invoke<MediaNowPlaying>("get_media_now_playing_cmd")
        .then((m) => {
          if (alive) setMedia(m.hasSession ? m : null);
        })
        .catch(() => {});
    };
    pollMedia();
    const mt = window.setInterval(pollMedia, 2000);
    return () => {
      alive = false;
      window.clearInterval(mt);
    };
  }, [showTopMedia]);

  useEffect(() => {
    invoke<boolean>("get_topbar_visible_cmd")
      .then((v) => setVisible(v))
      .catch(() => {});
    const t = window.setInterval(() => setNow(new Date()), 1000);
    const unlisten = listen<boolean>("lens://topbar-visible", (e) => {
      setVisible(e.payload);
    });
    const unlistenSearch = listen<boolean>("lens://topbar-search-open", (e) => {
      setSearchOpen(e.payload);
      if (!e.payload) {
        setSearchQuery("");
      }
    });
    const onBlur = () => {
      window.setTimeout(() => {
        if (!document.hasFocus() && searchOpenRef.current) {
          setSearchOpen(false);
          setSearchQuery("");
          invoke("sync_topbar_search_cmd", { query: "", open: false }).catch(() => {});
        }
      }, 220);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("blur", onBlur);
      unlisten.then((fn) => fn());
      unlistenSearch.then((fn) => fn());
    };
  }, []);

  if (!config) return null;

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const barHeight = config.topBar?.height ?? 34;
  const isFloating = config.topBar?.floating ?? false;

  return (
    <div className={`topbar-wrapper ${!visible ? "is-hidden" : ""} ${isFloating ? "is-floating" : ""}`}>
      <header className={`topbar ${searchOpen ? "is-search-expanded" : ""}`} style={{ height: barHeight }}>
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-icon-btn"
          style={{ height: 22, padding: "0 6px" }}
          onClick={() => invoke("toggle_surface", { label: "launcher" }).catch(() => {})}
          aria-label="Open Launcher"
        >
          <LayoutGrid size={14} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="topbar-icon-btn"
          style={{ height: 22, padding: "0 6px" }}
          onClick={() => invoke("toggle_surface", { label: "overview" }).catch(() => {})}
          aria-label="Show all windows"
        >
          <Layers size={14} strokeWidth={2.5} />
        </button>
        {config && readWorkspaces(config).enabled ? (
          <WorkspaceStrip />
        ) : (
          <div className="session-strip">
    <button
      type="button"
      className="topbar-icon-btn"
      style={{ height: 22, padding: "0 5px" }}
      onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "left" })}
      aria-label="Previous Desktop"
    >
      <ChevronLeft size={14} strokeWidth={2.3} />
    </button>

    <button
      type="button"
      className="topbar-icon-btn"
      style={{ height: 22, padding: "0 8px", fontSize: 11.5, fontWeight: 500 }}
      onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "overview" })}
      aria-label="Desktops Overview"
    >
      <Layers size={13} strokeWidth={2.2} />
      <span>Desktops</span>
    </button>

    <button
      type="button"
      className="topbar-icon-btn"
      style={{ height: 22, padding: "0 5px" }}
      onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "right" })}
      aria-label="Next Desktop"
    >
      <ChevronRight size={14} strokeWidth={2.3} />
    </button>

    <button
      type="button"
      className="topbar-icon-btn"
      style={{ height: 22, padding: "0 5px" }}
      onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "new" })}
      aria-label="New Desktop"
    >
      <Plus size={14} strokeWidth={2.3} />
    </button>
  </div>
        )}
        <PluginSlot slot="topbar-left" />
      </div>

      <div className="topbar-center">
        {showTopMedia && media && !searchOpen && (
          <div className="topbar-media-pill">
            {media.thumbnailDataUrl ? (
              <img src={media.thumbnailDataUrl} alt="" className="topbar-media-art" />
            ) : (
              <span className="topbar-media-art-fallback">
                <Music size={11} color="#1DB954" />
              </span>
            )}
            <span className="topbar-media-title">
              {media.title}
              {media.artist ? ` · ${media.artist}` : ""}
            </span>
            <div className="topbar-media-controls">
              <button
                type="button"
                className="topbar-media-btn"
                aria-label="Previous Track"
                onClick={() => {
                  invoke("media_control_cmd", { action: "prev" }).catch(() => {});
                  window.setTimeout(() => {
                    invoke<MediaNowPlaying>("get_media_now_playing_cmd")
                      .then((m) => setMedia(m.hasSession ? m : null))
                      .catch(() => {});
                  }, 250);
                }}
              >
                <SkipBack size={12} fill="currentColor" strokeWidth={2} />
              </button>
              <button
                type="button"
                className="topbar-media-btn play"
                aria-label={media.isPlaying ? "Pause" : "Play"}
                onClick={() => {
                  setMedia((prev) => (prev ? { ...prev, isPlaying: !prev.isPlaying } : prev));
                  invoke("media_control_cmd", { action: "play_pause" }).catch(() => {});
                }}
              >
                {media.isPlaying ? (
                  <Pause size={12} fill="currentColor" strokeWidth={2} />
                ) : (
                  <Play size={12} fill="currentColor" strokeWidth={2} />
                )}
              </button>
              <button
                type="button"
                className="topbar-media-btn"
                aria-label="Next Track"
                onClick={() => {
                  invoke("media_control_cmd", { action: "next" }).catch(() => {});
                  window.setTimeout(() => {
                    invoke<MediaNowPlaying>("get_media_now_playing_cmd")
                      .then((m) => setMedia(m.hasSession ? m : null))
                      .catch(() => {});
                  }, 250);
                }}
              >
                <SkipForward size={12} fill="currentColor" strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="topbar-right">
        <div
          className={`topbar-search-well ${searchOpen ? "is-open" : ""}`}
          onClick={() => {
            if (!searchOpen) {
              setSearchOpen(true);
              setSearchQuery("");
              invoke("sync_topbar_search_cmd", { query: "", open: true }).catch(() => {});
              window.setTimeout(() => topSearchInputRef.current?.focus(), 20);
            } else {
              topSearchInputRef.current?.focus();
            }
          }}
        >
          <Search size={13.5} strokeWidth={2.6} className="topbar-search-icon" />
          <input
            ref={topSearchInputRef}
            className="topbar-search-glide-input"
            value={searchQuery}
            placeholder={searchOpen ? "Search apps, files, folders..." : ""}
            aria-label="Search apps, files, folders"
            onFocus={() => {
              if (!searchOpen) {
                setSearchOpen(true);
                invoke("sync_topbar_search_cmd", { query: searchQuery, open: true }).catch(() => {});
              }
            }}
            onChange={(e) => {
              const v = e.target.value;
              setSearchQuery(v);
              invoke("sync_topbar_search_cmd", { query: v, open: true }).catch(() => {});
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setSearchOpen(false);
                setSearchQuery("");
                invoke("sync_topbar_search_cmd", { query: "", open: false }).catch(() => {});
                topSearchInputRef.current?.blur();
              } else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
                e.preventDefault();
                invoke("dock_search_nav_cmd", { key: e.key }).catch(() => {});
                if (e.key === "Enter") {
                  setSearchOpen(false);
                  setSearchQuery("");
                  topSearchInputRef.current?.blur();
                }
              }
            }}
          />
          {searchOpen && (
            <button
              type="button"
              className="topbar-search-esc"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSearchOpen(false);
                setSearchQuery("");
                invoke("sync_topbar_search_cmd", { query: "", open: false }).catch(() => {});
                topSearchInputRef.current?.blur();
              }}
            >
              ESC
            </button>
          )}
        </div>

        <div className="topbar-utility-group">
          <PluginSlot slot="topbar-right" />
          <TrayStrip enabled={config?.func.trayHost ?? false} />
          {!(config?.func.trayHost ?? false) && (
            <button
              type="button"
              className="topbar-util-icon"
              onClick={() => invoke("peek_native_taskbar_cmd", { seconds: 8 }).catch(() => {})}
              aria-label="Show system tray for a few seconds"
            >
              <ChevronUp size={16} strokeWidth={2.6} />
            </button>
          )}

          <button
            type="button"
            className="topbar-util-icon"
            onClick={() =>
              invoke("open_quicksettings_tab_cmd", { tab: "notifications", section: "notifications" })
            }
            aria-label="Notifications"
          >
            <Bell size={16} strokeWidth={2.6} />
          </button>

          <KeyboardTopBarModule />
          <BatteryTopBarModule
            onClick={() => invoke("open_quicksettings_tab_cmd", { tab: "quick", section: "quick" })}
          />

          <button
            type="button"
            className="topbar-util-icon"
            onClick={() =>
              invoke("open_quicksettings_tab_cmd", { tab: "network", section: "network" })
            }
            aria-label="Wi-Fi and Network"
          >
            <Wifi size={16} strokeWidth={2.6} />
          </button>

          <button
            type="button"
            className="topbar-util-icon"
            onClick={() =>
              invoke("open_quicksettings_tab_cmd", { tab: "audio", section: "audio" })
            }
            aria-label="Volume and Audio Mixer"
          >
            <Volume2 size={16} strokeWidth={2.6} />
          </button>

          <button
            type="button"
            className="topbar-util-icon"
            onClick={() =>
              invoke("open_quicksettings_tab_cmd", { tab: "quick", section: "quick" })
            }
            aria-label="Quick Settings"
          >
            <Settings size={15.5} strokeWidth={2.55} />
          </button>
        </div>

        <button
          type="button"
          className="topbar-clock"
          onClick={() =>
            invoke("open_quicksettings_tab_cmd", { tab: "calendar", section: "calendar" })
          }
          aria-label="Open Calendar and Clock"
        >
          {dateStr} · {timeStr}
        </button>
      </div>
      </header>
    </div>
  );
};

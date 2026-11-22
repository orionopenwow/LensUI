import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppWindow, X } from "lucide-react";
import type { RunningWindow } from "../types/lens";

interface Props {
  windows: RunningWindow[];
  /** Fallback icon when a window has none of its own. */
  iconUrl?: string | null;
  onFocus: (hwnd: number) => void;
  onClose: (hwnd: number) => void;
}

const MAX_TILES = 4;

/**
 * Live window previews for the Dock hover card. Each tile reserves a picture area; the backend
 * places a native DWM thumbnail exactly over it (click-through, so clicks land here). Windows the
 * backend can't preview (minimized, closed, refused) show their icon and title instead.
 */
export const DockPreviewStrip: React.FC<Props> = ({ windows, iconUrl, onFocus, onClose }) => {
  const shown = windows.slice(0, MAX_TILES);
  const shotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const key = shown.map((w) => w.hwnd).join(",");

  useEffect(() => {
    let cancelled = false;
    // Wait for the hover card's entrance animation to settle so the measured rects are final.
    const t = window.setTimeout(() => {
      if (cancelled) return;
      const tiles = shown
        .map((w) => {
          const el = shotRefs.current.get(w.hwnd);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { hwnd: w.hwnd, x: r.left, y: r.top, w: r.width, h: r.height };
        })
        .filter((t): t is { hwnd: number; x: number; y: number; w: number; h: number } => t !== null);
      const background =
        getComputedStyle(document.documentElement).getPropertyValue("--lens-pack-base").trim() ||
        "#141418";
      invoke<number[]>("dock_preview_show_cmd", { tiles, background })
        .then((bad) => {
          if (!cancelled) setFailed(new Set(bad ?? []));
        })
        .catch(() => {
          if (!cancelled) setFailed(new Set(shown.map((w) => w.hwnd)));
        });
    }, 170);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      invoke("dock_preview_hide_cmd").catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="dock-preview-strip">
      {shown.map((w) => {
        const icon = w.iconDataUrl || iconUrl;
        const title = w.title || w.processName.replace(/\.exe$/i, "");
        return (
          <div
            key={w.hwnd}
            className={`dock-preview-tile ${w.isFocused ? "focused" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onFocus(w.hwnd)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onFocus(w.hwnd);
            }}
          >
            <div className="dock-preview-head">
              {icon ? (
                <img src={icon} alt="" className="dock-preview-icon" />
              ) : (
                <AppWindow size={13} className="dock-preview-icon" />
              )}
              <span className="dock-preview-title">{title}</span>
              <button
                type="button"
                className="dock-preview-close"
                aria-label="Close window"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(w.hwnd);
                }}
              >
                <X size={11} strokeWidth={2.8} />
              </button>
            </div>
            <div
              className={`dock-preview-shot ${failed.has(w.hwnd) ? "is-fallback" : ""}`}
              ref={(el) => {
                if (el) shotRefs.current.set(w.hwnd, el);
                else shotRefs.current.delete(w.hwnd);
              }}
            >
              {failed.has(w.hwnd) &&
                (icon ? (
                  <img src={icon} alt="" className="dock-preview-fallback-icon" />
                ) : (
                  <AppWindow size={30} strokeWidth={1.6} />
                ))}
            </div>
          </div>
        );
      })}
      {windows.length > MAX_TILES && (
        <div className="dock-preview-more">+{windows.length - MAX_TILES} more</div>
      )}
    </div>
  );
};

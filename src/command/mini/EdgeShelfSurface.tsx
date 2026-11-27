// The Edge Shelf: a thin tab on a screen edge. Hover (or drag something over it) and it grows into
// a mini Shelf panel; drop files, text, links or images from any app to keep them; drag items back
// out. Hidden while a fullscreen app or game is in front. Window label: "edgeshelf".
import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Archive, ArrowUpRight, FileText, Trash2 } from "lucide-react";
import { useLensState } from "../../hooks/useLensState";
import { useCommandSettings } from "../settings";
import { useShelf, KIND_ICON } from "../ShelfDrawer";
import { DEFAULT_SHELF, formatTokens, shelfAdd, shelfRemove } from "../../shelf/contract";
import { panelRect, tabRect, tabVisible, type Rect } from "./edgeGeometry";
import { clearPose, glideOut, type GlideHandle } from "../../ui/motion";
import "./edge.css";
import { logFail, quiet } from "../../failsafe/calls";

/** How long the pointer may be away before the panel closes (a grace period, not an animation). */
const LEAVE_GRACE_MS = 420;

type Phase = "collapsed" | "open" | "drop";

const screenArea = (): Rect => {
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  return { x: s.availLeft ?? 0, y: s.availTop ?? 0, w: s.availWidth, h: s.availHeight };
};

export function EdgeShelfSurface({ initial }: { initial?: { phase?: Phase; dropped?: string } } = {}) {
  useLensState();
  const settings = useCommandSettings();
  const s = settings.edge;
  const [phase, setPhase] = useState<Phase>(initial?.phase ?? "collapsed");
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(initial?.dropped ?? null);
  const { items } = useShelf(DEFAULT_SHELF);
  const hoverTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const exit = useRef<GlideHandle | null>(null);
  /** Coming back while the panel is fading out: stop the exit and show the panel again. */
  const cancelExit = () => {
    if (!exit.current) return;
    exit.current.cancel();
    exit.current = null;
    clearPose(panelRef.current);
  };

  // Size and place the window for the current phase.
  useEffect(() => {
    if (initial) return; // scripted (parity)
    const area = screenArea();
    const r = phase === "collapsed" ? tabRect(area, s) : panelRect(area, s);
    // One native step (docs/SMOOTHNESS.md, G-12): size and place together, never one after the
    // other. The window only changes while nothing is moving: the panel's entry starts after it
    // has grown, and its exit has finished before it shrinks (see `close`).
    invoke("place_surface_cmd", { label: "edgeshelf", x: r.x, y: r.y, w: r.w, h: r.h }).catch(logFail("Edge shelf", "place itself"));
  }, [phase, s.edge, s.offset, s.thickness, s.length, s.panel.w, s.panel.h]);

  // Stay out of the way of games, video and slideshows.
  useEffect(() => {
    if (initial) return;
    const t = window.setInterval(() => {
      if (phase !== "collapsed") return;
      invoke<{ fullscreen: boolean }>("context_foreground").then((c) => setFullscreen(!!c?.fullscreen)).catch(quiet); // a poll; the next one repeats it
    }, 2000);
    return () => window.clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (initial) return;
    const visible = tabVisible(s, fullscreen, settings.edgeOnlyWhileDragging, dragging) || phase !== "collapsed";
    const w = getCurrentWindow();
    (visible ? w.show() : w.hide()).catch(logFail("Edge shelf", visible ? "show itself" : "hide itself"));
  }, [s.enabled, fullscreen, dragging, phase, settings.edgeOnlyWhileDragging]);

  const open = useCallback((now = false) => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    cancelExit();
    if (now) return setPhase((p) => (p === "drop" ? p : "open"));
    if (hoverTimer.current) return;
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      setPhase("open");
    }, s.hoverMs);
  }, [s.hoverMs]);
  const close = useCallback(() => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    leaveTimer.current = window.setTimeout(() => {
      // Exit first; the window shrinks to the tab only once the panel is fully see-through.
      const handle = glideOut(panelRef.current, { scale: 0.97, opacity: 0 });
      exit.current = handle;
      void handle.finished.then(() => {
        if (exit.current !== handle) return;
        exit.current = null;
        setPhase("collapsed");
      });
    }, LEAVE_GRACE_MS);
  }, []);

  const flash = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 1800);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setPhase("open");
    const files = Array.from(e.dataTransfer.files ?? []);
    try {
      if (files.length) {
        for (const f of files.slice(0, 20)) {
          const path = (f as unknown as { path?: string }).path ?? f.name;
          const isImage = /^image\//.test(f.type);
          await shelfAdd({ kind: isImage ? "image" : "file", title: f.name, path });
        }
        return flash(`Kept ${files.length} file${files.length > 1 ? "s" : ""}`);
      }
      const url = e.dataTransfer.getData("text/uri-list").split("\n").find((l) => l && !l.startsWith("#"));
      const text = e.dataTransfer.getData("text/plain");
      if (url && (!text || text.trim() === url.trim())) {
        await shelfAdd({ kind: "page", url, title: url });
        return flash("Kept link");
      }
      if (text) {
        await shelfAdd({ kind: "text", text, url: url || undefined });
        return flash("Kept text");
      }
    } catch (err) {
      flash(String(err));
    }
  };

  if (phase === "collapsed") {
    return (
      <div
        className={`edge-tab is-${s.edge}`}
        onMouseEnter={() => open()}
        onMouseLeave={close}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); open(true); setPhase("drop"); }}
        onDragOver={(e) => e.preventDefault()}
        role="button"
        aria-label="Lens Shelf. Hover or drop to open."
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open(true)}
      >
        <span className="edge-grip" aria-hidden />
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={`edge-panel is-${s.edge}${phase === "drop" ? " is-drop" : ""}`}
      onMouseEnter={() => open(true)}
      onMouseLeave={close}
      onDragEnter={(e) => { e.preventDefault(); setPhase("drop"); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setPhase("open");
      }}
      onDrop={onDrop}
      aria-label="Lens Shelf"
    >
      <header className="edge-head">
        <Archive size={14} strokeWidth={2.2} />
        <span>Shelf</span>
        <span className="edge-count">{items.length}</span>
        <button type="button" className="edge-icon" aria-label="Open in Lens Command"
          onClick={() => {
            invoke("open_surface", { label: "command" }).catch(logFail("Edge shelf", "open Command"));
            invoke("command_layout", { layout: "full", anchor: "center" }).catch(logFail("Edge shelf", "open Command full size"));
          }}>
          <ArrowUpRight size={14} />
        </button>
      </header>
      {phase === "drop" ? (
        <div className="edge-drop" aria-live="polite">
          <Archive size={22} strokeWidth={1.8} />
          <p>Drop to keep it on your Shelf</p>
          <p className="edge-muted">Files, text, links and images</p>
        </div>
      ) : (
        <ol className="edge-list">
          {items.length === 0 ? <li className="edge-empty">Drag anything here from any app. Drag it back out when you need it.</li> : null}
          {items.slice(0, 40).map((it) => {
            const Icon = KIND_ICON[it.kind] ?? FileText;
            return (
              <li
                key={it.id}
                className="edge-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData("text/plain", it.text || it.url || it.path || it.title);
                  if (it.url) e.dataTransfer.setData("text/uri-list", it.url);
                }}
              >
                <Icon size={14} strokeWidth={2} />
                <span className="edge-title">{it.title}</span>
                <span className="edge-meta">{it.approx_tokens ? formatTokens(it.approx_tokens) : it.kind}</span>
                <button type="button" className="edge-icon is-hover" aria-label="Remove" onClick={() => shelfRemove(it.id)}>
                  <Trash2 size={12} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {toast ? <div className="edge-toast" role="status">{toast}</div> : null}
    </div>
  );
}

export default EdgeShelfSurface;

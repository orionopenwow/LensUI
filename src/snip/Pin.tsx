// A pinned snip: always on top, drag to move, Ctrl+wheel to zoom, opacity, click-through.
import React, { useEffect, useState } from "react";
import { Copy, MousePointerClick, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PinInfo } from "./api";
import { snipPinClickThrough, snipPinClose, snipPinInfo } from "./api";
import { Tip } from "./Tip";

export const Pin: React.FC<{ label: string; demo?: PinInfo }> = ({ label, demo }) => {
  const [info, setInfo] = useState<PinInfo | null>(demo ?? null);
  const [opacity, setOpacity] = useState(demo?.opacity ?? 1);
  const [zoom, setZoom] = useState(1);
  const [through, setThrough] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (demo) return;
    snipPinInfo(label)
      .then((i) => {
        setInfo(i);
        setOpacity(i.opacity);
        if (i.clickThrough) {
          setThrough(true);
          void snipPinClickThrough(label, true);
        }
      })
      .catch(() => void getCurrentWindow().close());
  }, [label, demo]);

  const close = () => void snipPinClose(label).catch(() => void getCurrentWindow().close());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.ctrlKey && e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!info) return null;
  return (
    <div
      className="snip-root snip-pin"
      style={{ opacity }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest(".snip-pin-bar")) return;
        void getCurrentWindow().startDragging().catch(() => {});
      }}
      onDoubleClick={close}
      onWheel={(e) => {
        if (!e.ctrlKey) return;
        setZoom((z) => Math.min(8, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
      }}
      aria-label={`Pinned snip${info.title ? ` — ${info.title}` : ""}`}
    >
      <img src={info.png} alt="" draggable={false} style={{ transform: `scale(${zoom})` }} />
      <div className="snip-pin-bar" role="toolbar" aria-label="Pin controls">
        <Tip text="Opacity" below>
          <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} aria-label="Opacity" />
        </Tip>
        <Tip text="Copy the image" below>
          <button
            type="button"
            className="snip-btn icon"
            aria-label="Copy"
            onClick={async () => {
              try {
                const blob = await (await fetch(info.png)).blob();
                await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                setMsg("Copied");
              } catch {
                setMsg("Couldn't copy");
              }
              window.setTimeout(() => setMsg(""), 1500);
            }}
          >
            <Copy size={14} />
          </button>
        </Tip>
        <Tip text="Click-through: clicks go to the window underneath. Open Lens Snip to turn it off." below>
          <button
            type="button"
            className={`snip-btn icon ${through ? "on" : ""}`}
            aria-pressed={through}
            aria-label="Click-through"
            onClick={() => {
              setThrough(true);
              void snipPinClickThrough(label, true);
            }}
          >
            <MousePointerClick size={14} />
          </button>
        </Tip>
        <Tip text="Close (Esc or double-click)" below>
          <button type="button" className="snip-btn icon" aria-label="Close pin" onClick={close}>
            <X size={14} />
          </button>
        </Tip>
      </div>
      {msg ? <div className="snip-toast" style={{ bottom: 8 }}>{msg}</div> : null}
      {zoom !== 1 ? <div className="snip-size" style={{ left: 8, bottom: 8 }}>{Math.round(zoom * 100)}%</div> : null}
    </div>
  );
};

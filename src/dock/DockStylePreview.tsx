import React from "react";
import type { DockStyleId } from "./styles";
import "./DockStylePreview.css";

const W = 112;
const H = 64;

/** Icon squares for a row of `n` icons of size `s` with gap `g`, starting at x. */
function icons(x: number, y: number, n: number, s: number, g: number, key: string) {
  return Array.from({ length: n }, (_, i) => (
    <rect key={`${key}${i}`} className="dsp-icon" x={x + i * (s + g)} y={y} width={s} height={s} rx={1.5} />
  ));
}

/**
 * A tiny, token-coloured picture of a Dock style for pickers (Control Center, Setup).
 * Colours come from the active theme pack, so it matches every pack and light schemes.
 */
export const DockStylePreview: React.FC<{ style: DockStyleId; selected?: boolean; className?: string }> = ({
  style,
  selected = false,
  className = "",
}) => {
  const rowW = (n: number, s: number, g: number) => n * s + (n - 1) * g;
  let body: React.ReactNode;
  switch (style) {
    case "slim": {
      const w = rowW(6, 4, 2) + 8;
      const x = (W - w) / 2;
      body = (
        <>
          <rect className="dsp-pill" x={x} y={H - 8} width={w} height={8} rx={2} />
          {icons(x + 4, H - 6, 6, 4, 2, "s")}
        </>
      );
      break;
    }
    case "taskbar": {
      const rw = rowW(6, 5, 2);
      return frame(
        <>
          <rect className="dsp-bar" x={0} y={H - 9} width={W} height={9} />
          {icons((W - rw) / 2, H - 7, 6, 5, 2, "t")}
          <rect className="dsp-sys" x={W - 22} y={H - 6} width={18} height={3} rx={1.5} />
        </>
      );
    }
    case "studio":
      return frame(
        <>
          <rect className="dsp-bar" x={0} y={H - 9} width={W} height={9} />
          {icons(4, H - 7, 6, 5, 2, "d")}
          <rect className="dsp-sys" x={W - 22} y={H - 6} width={18} height={3} rx={1.5} />
        </>
      );
    case "minimal": {
      const rw = rowW(6, 6, 3);
      const x = (W - rw) / 2;
      body = (
        <>
          <rect className="dsp-ghost" x={x - 4} y={H - 11} width={rw + 8} height={11} rx={2.5} />
          {icons(x, H - 8, 6, 6, 3, "m")}
        </>
      );
      break;
    }
    case "split": {
      const rw = rowW(6, 6, 2);
      const x = (W - rw - 8) / 2;
      body = (
        <>
          <rect className="dsp-pill" x={x} y={H - 11} width={rw + 8} height={11} rx={2.5} />
          {icons(x + 4, H - 8, 6, 6, 2, "p")}
          <rect className="dsp-pill" x={W - 26} y={H - 11} width={22} height={11} rx={2.5} />
          <rect className="dsp-sys" x={W - 22} y={H - 7} width={14} height={3} rx={1.5} />
        </>
      );
      break;
    }
    default: {
      const rw = rowW(6, 6, 2);
      const x = (W - rw - 8) / 2;
      body = (
        <>
          <rect className="dsp-pill" x={x} y={H - 11} width={rw + 8} height={11} rx={2.5} />
          {icons(x + 4, H - 8, 6, 6, 2, "f")}
        </>
      );
    }
  }
  return frame(body);

  function frame(children: React.ReactNode) {
    return (
      <svg
        className={`dock-style-preview ${selected ? "is-selected" : ""} ${className}`}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={`${style} Dock style`}
      >
        <rect className="dsp-screen" x={0.5} y={0.5} width={W - 1} height={H - 1} rx={3} />
        <rect className="dsp-topbar" x={0.5} y={0.5} width={W - 1} height={5} rx={0} />
        {children}
      </svg>
    );
  }
};

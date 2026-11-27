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
    case "islands": {
      const rw = rowW(5, 5, 2);
      const ax = (W - rw - 8) / 2;
      return frame(
        <>
          <rect className="dsp-pill" x={3} y={H - 11} width={24} height={9} rx={4.5} />
          <rect className="dsp-sys" x={7} y={H - 7.5} width={4} height={2} rx={1} />
          <rect className="dsp-sys" x={14} y={H - 7.5} width={9} height={2} rx={1} />
          <rect className="dsp-pill" x={ax} y={H - 11} width={rw + 8} height={9} rx={4.5} />
          {icons(ax + 4, H - 9, 5, 5, 2, "i")}
          <rect className="dsp-pill" x={W - 29} y={H - 11} width={26} height={9} rx={4.5} />
          <rect className="dsp-sys" x={W - 24} y={H - 7.5} width={16} height={2} rx={1} />
        </>
      );
    }
    case "unified": {
      // One pill: launcher, apps, a hairline, then tray, bell and a two-line clock.
      const rw = rowW(5, 6, 2);
      const w = 6 + 2 + rw + 4 + 1 + 4 + 18 + 4;
      const x = (W - w) / 2;
      const y = H - 11;
      const dx = x + 3 + 6 + 2 + rw + 3;
      return frame(
        <>
          <rect className="dsp-pill" x={x} y={y} width={w} height={11} rx={5.5} />
          <rect className="dsp-sys" x={x + 3} y={y + 3} width={6} height={5} rx={1.5} />
          {icons(x + 3 + 6 + 2, y + 2.5, 5, 6, 2, "u")}
          <rect className="dsp-sys" x={dx} y={y + 2.5} width={0.8} height={6} />
          <rect className="dsp-sys" x={dx + 4} y={y + 3.5} width={7} height={2} rx={1} />
          <rect className="dsp-sys" x={dx + 13} y={y + 2.5} width={8} height={2.2} rx={1} />
          <rect className="dsp-sys" x={dx + 13} y={y + 6} width={8} height={1.4} rx={0.7} />
        </>
      );
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

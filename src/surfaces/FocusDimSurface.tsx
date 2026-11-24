import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type * as Gen from "../types/generated";
import {
  DEFAULT_CAPS, DEFAULT_STYLING, effectiveBorder, normalizeStyling, previewRadius, type StylingCaps, type WindowStyling,
} from "../utils/windowStyling";
import "./FocusDimSurface.css";

/**
 * A small live picture of focus dimming and the active border: a desktop with two windows in
 * the back and the focused one in front. The real effect is drawn natively by win_focus_dim.rs
 * (click-through Win32 overlays, no WebView), so this only previews the settings — it's used
 * in the Window Rules card and, as `?surface=focusdim`, as a full-size preview page.
 */
export const FocusDimPreview: React.FC<{ styling: WindowStyling; caps?: StylingCaps; height?: number }> = ({
  styling,
  caps = DEFAULT_CAPS,
  height = 150,
}) => {
  const radius = previewRadius(caps);
  const border = effectiveBorder(styling.activeBorder, caps);
  const dim = Math.min(40, Math.max(0, styling.dimInactive)) / 100;
  const ring = border ? border.width + 1 : 0;

  const win = (left: string, top: string, w: string, h: string, z: number): React.CSSProperties => ({
    position: "absolute",
    left,
    top,
    width: w,
    height: h,
    zIndex: z,
    borderRadius: radius,
    background: "var(--lens-pack-elevated, #18181b)",
    border: "1px solid rgb(var(--lens-ink) / 0.10)",
    boxShadow: "0 6px 18px rgb(0 0 0 / 0.28)",
    overflow: "hidden",
  });

  const Chrome: React.FC<{ title: string }> = ({ title }) => (
    <div
      style={{
        height: 16,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 7px",
        fontSize: 9,
        color: "var(--lens-fg-secondary)",
        borderBottom: "1px solid rgb(var(--lens-ink) / 0.08)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
      <span style={{ width: 5, height: 5, borderRadius: 3, background: "rgb(var(--lens-ink) / 0.35)" }} />
      <span style={{ width: 5, height: 5, borderRadius: 3, background: "rgb(var(--lens-ink) / 0.35)" }} />
    </div>
  );

  const Lines: React.FC<{ n: number }> = ({ n }) => (
    <div style={{ padding: "7px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ height: 4, width: `${88 - ((i * 17) % 40)}%`, borderRadius: 2, background: "rgb(var(--lens-ink) / 0.14)" }} />
      ))}
    </div>
  );

  return (
    <div
      role="img"
      aria-label={`Preview: inactive windows dimmed ${Math.round(dim * 100)}%, ${border ? "with" : "without"} an active-window border`}
      style={{
        position: "relative",
        height,
        borderRadius: 10,
        overflow: "hidden",
        background: "linear-gradient(140deg, #1e3a5f 0%, #3b2f63 55%, #5b2a4a 100%)",
        border: "1px solid var(--lens-border)",
      }}
    >
      <div style={win("6%", "12%", "44%", "62%", 1)}>
        <Chrome title="Files" />
        <Lines n={5} />
      </div>
      <div style={win("54%", "8%", "40%", "54%", 1)}>
        <Chrome title="Music" />
        <Lines n={4} />
      </div>
      {/* The dim layer sits under the focused window, exactly like the real overlay. */}
      <div className="fd-dim" style={{ position: "absolute", inset: 0, zIndex: 2, background: `rgb(0 0 0 / ${dim})` }} />
      <div
        className="fd-focus"
        style={{
          position: "absolute",
          left: "24%",
          top: "26%",
          width: "50%",
          height: "62%",
          zIndex: 3,
          padding: ring ? ring - 1 : 0,
          margin: ring ? -(ring - 1) : 0,
          borderRadius: radius ? radius + ring - 1 : 0,
          background: border ? border.background : "transparent",
          boxShadow: border && border.glow > 0 ? `0 0 ${border.glow * 1.6}px ${border.glow / 3}px ${styling.activeBorder.colors[0]}88` : "none",
        }}
      >
        <div style={{ ...win("0", "0", "100%", "100%", 3), position: "relative", boxShadow: "0 10px 26px rgb(0 0 0 / 0.38)" }}>
          <Chrome title="Editor — focused" />
          <Lines n={6} />
        </div>
      </div>
    </div>
  );
};

/** `?surface=focusdim`: the preview at full size, reading the saved settings. */
export const FocusDimSurface: React.FC = () => {
  const [state, setState] = useState<{ styling: WindowStyling; caps: StylingCaps }>({ styling: DEFAULT_STYLING, caps: DEFAULT_CAPS });
  useEffect(() => {
    invoke<Gen.WindowStylingState | null>("get_window_styling_cmd")
      .then((s) => {
        if (s) setState({ styling: normalizeStyling(s.settings), caps: s.caps ?? DEFAULT_CAPS });
      })
      .catch(() => {});
  }, []);
  return (
    <div style={{ width: "100%", height: "100%", padding: 16, boxSizing: "border-box" }}>
      <FocusDimPreview styling={state.styling} caps={state.caps} height={Math.max(220, window.innerHeight - 32)} />
    </div>
  );
};

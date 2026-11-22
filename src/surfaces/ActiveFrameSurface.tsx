import React from "react";
import { useLensState } from "../hooks/useLensState";

export const ActiveFrameSurface: React.FC = () => {
  const { config } = useLensState();
  const style = config?.windowControls.frameStyle ?? "accent-glow";

  if (style === "none") return null;

  let border = "2px solid color-mix(in oklch, var(--lens-accent) 75%, white 15%)";
  let shadow =
    "inset 0 0 0 1px rgb(var(--lens-ink) / 0.14), 0 0 16px color-mix(in oklch, var(--lens-accent) 45%, transparent)";

  if (style === "obsidian-hairline") {
    border = "1.5px solid rgb(var(--lens-ink) / 0.22)";
    shadow = "inset 0 0 0 1px rgb(0 0 0 / 0.55)";
  } else if (style === "neon") {
    border = "2px solid var(--lens-accent)";
    shadow =
      "0 0 22px var(--lens-accent), inset 0 0 10px color-mix(in oklch, var(--lens-accent) 40%, transparent)";
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: 2,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "var(--lens-radius)",
          border,
          boxShadow: shadow,
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

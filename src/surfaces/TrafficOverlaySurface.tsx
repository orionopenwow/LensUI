import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLensState } from "../hooks/useLensState";
import { TrafficLights } from "../components/TrafficLights";

export const TrafficOverlaySurface: React.FC = () => {
  const { config } = useLensState();
  const styleVariant = config?.windowControls.style ?? "traffic-classic";
  const order = config?.windowControls.order ?? "green-yellow-red";
  const isTopLeft = config?.windowControls.position === "top-left";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: isTopLeft ? "flex-start" : "flex-end",
        padding: isTopLeft ? "0 12px" : "0 14px",
        // Solid matte dark caption cap (138x32) that cleanly masks native Windows — □ × buttons
        background: "#121215",
        borderBottomLeftRadius: isTopLeft ? 0 : "min(var(--lens-radius), 14px)",
        borderTopRightRadius: isTopLeft ? 0 : "min(var(--lens-radius), 16px)",
        borderTopLeftRadius: isTopLeft ? "min(var(--lens-radius), 16px)" : 0,
        borderBottomRightRadius: isTopLeft ? "min(var(--lens-radius), 14px)" : 0,
        borderLeft: isTopLeft ? "none" : "1px solid rgb(var(--lens-ink) / 0.08)",
        borderBottom: "1px solid rgb(var(--lens-ink) / 0.08)",
        borderRight: isTopLeft ? "1px solid rgb(var(--lens-ink) / 0.08)" : "none",
      }}
    >
      <TrafficLights
        styleVariant={styleVariant}
        order={order}
        onMaximize={() => invoke("traffic_target_action", { action: "maximize" })}
        onMinimize={() => invoke("traffic_target_action", { action: "minimize" })}
        onClose={() => invoke("traffic_target_action", { action: "close" })}
      />
    </div>
  );
};

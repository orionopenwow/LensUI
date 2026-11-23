import React from "react";

interface TrafficLightsProps {
  styleVariant?: string;
  order?: string; // "yellow-green-red" (default, Windows order) | "green-yellow-red" | "red-yellow-green"
  onMaximize: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export const TrafficLights: React.FC<TrafficLightsProps> = ({
  styleVariant = "traffic-classic",
  order = "yellow-green-red",
  onMaximize,
  onMinimize,
  onClose,
}) => {
  const close = { id: "red", label: "Close", glyph: "×", onClick: onClose };
  const min = { id: "yellow", label: "Minimize", glyph: "−", onClick: onMinimize };
  const max = { id: "green", label: "Maximize", glyph: "+", onClick: onMaximize };
  const buttons =
    order === "red-yellow-green" ? [close, min, max] : order === "green-yellow-red" ? [max, min, close] : [min, max, close];

  return (
    <div
      className={`traffic-lights traffic-style-${styleVariant}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {buttons.map((b) => (
        <button
          key={b.id}
          type="button"
          aria-label={b.label}
          className={`traffic-btn tl-${b.id}`}
          onClick={(e) => {
            e.stopPropagation();
            b.onClick();
          }}
        >
          <span className="glyph">{b.glyph}</span>
        </button>
      ))}
    </div>
  );
};

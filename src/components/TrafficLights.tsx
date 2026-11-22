import React from "react";

interface TrafficLightsProps {
  styleVariant?: string;
  order?: string; // "green-yellow-red" | "red-yellow-green"
  onMaximize: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export const TrafficLights: React.FC<TrafficLightsProps> = ({
  styleVariant = "traffic-classic",
  order = "green-yellow-red",
  onMaximize,
  onMinimize,
  onClose,
}) => {
  const buttons =
    order === "red-yellow-green"
      ? [
          { id: "red", label: "Close", glyph: "×", onClick: onClose },
          { id: "yellow", label: "Minimize", glyph: "−", onClick: onMinimize },
          { id: "green", label: "Maximize", glyph: "+", onClick: onMaximize },
        ]
      : [
          { id: "green", label: "Maximize", glyph: "+", onClick: onMaximize },
          { id: "yellow", label: "Minimize", glyph: "−", onClick: onMinimize },
          { id: "red", label: "Close", glyph: "×", onClick: onClose },
        ];

  return (
    <div
      className={`traffic-lights traffic-style-${styleVariant}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {buttons.map((b) => (
        <button
          key={b.id}
          type="button"
          title={b.label}
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

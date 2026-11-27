import React, { useEffect, useRef, useState } from "react";

interface ColorWheelProps {
  value: string;
  windowsAccentHex: string;
  accentMode: string;
  onSelectColor: (hex: string) => void;
  onSelectWindowsLive: () => void;
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return { h: 0, s: 0, v: 0.98 };
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

const SWATCHES: { hex: string; name: string }[] = [
  { hex: "#FAFAFA", name: "Pure White" },
  { hex: "#A1A1AA", name: "Silver" },
  { hex: "#27272A", name: "Matte Black" },
  { hex: "#60A5FA", name: "Ice Blue" },
  { hex: "#818CF8", name: "Indigo" },
  { hex: "#34D399", name: "Emerald" },
  { hex: "#FBBF24", name: "Warm Gold" },
  { hex: "#FB7185", name: "Soft Rose" },
];

export const ColorWheel: React.FC<ColorWheelProps> = ({
  value,
  windowsAccentHex,
  accentMode,
  onSelectColor,
  onSelectWindowsLive,
}) => {
  const ringCanvasRef = useRef<HTMLCanvasElement>(null);
  const svBoxRef = useRef<HTMLDivElement>(null);
  const dragModeRef = useRef<"none" | "ring" | "sv">("none");
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hoverLoupe, setHoverLoupe] = useState<{ x: number; y: number; hex: string } | null>(null);

  const size = 156;
  const center = size / 2;
  const outerR = size / 2 - 2;
  const ringThickness = 15;
  const innerR = outerR - ringThickness;
  const svSize = 68;

  useEffect(() => {
    const parsed = hexToHsv(value);
    setHsv((prev) => ({
      h: parsed.s === 0 ? prev.h : parsed.h,
      s: parsed.s,
      v: parsed.v,
    }));
  }, [value]);

  // Draw crisp hollow rainbow Hue Ring
  useEffect(() => {
    const canvas = ringCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - center;
        const dy = y - center;
        const dist = Math.hypot(dx, dy);
        if (dist >= innerR - 1 && dist <= outerR + 1) {
          let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          if (deg < 0) deg += 360;
          const hex = hsvToHex(deg, 1, 1);
          const idx = (y * size + x) * 4;
          let alpha = 255;
          if (dist < innerR) alpha = Math.max(0, Math.round((dist - (innerR - 1)) * 255));
          else if (dist > outerR) alpha = Math.max(0, Math.round((outerR + 1 - dist) * 255));
          data[idx] = parseInt(hex.slice(1, 3), 16);
          data[idx + 1] = parseInt(hex.slice(3, 5), 16);
          data[idx + 2] = parseInt(hex.slice(5, 7), 16);
          data[idx + 3] = alpha;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  const updateHue = (clientX: number, clientY: number) => {
    const canvas = ringCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = clientX - rect.left - center;
    const dy = clientY - rect.top - center;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const nextS = hsv.s < 0.05 ? 0.75 : hsv.s;
    const nextV = hsv.v < 0.15 ? 0.9 : hsv.v;
    const next = { h: deg, s: nextS, v: nextV };
    setHsv(next);
    onSelectColor(hsvToHex(next.h, next.s, next.v));
  };

  const updateSV = (clientX: number, clientY: number) => {
    const box = svBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
    const next = { h: hsv.h, s, v };
    setHsv(next);
    onSelectColor(hsvToHex(next.h, next.s, next.v));
  };

  const ringMidR = (outerR + innerR) / 2;
  const hueRad = (hsv.h * Math.PI) / 180;
  const hueThumbX = center + Math.cos(hueRad) * ringMidR;
  const hueThumbY = center + Math.sin(hueRad) * ringMidR;
  const pureHueHex = hsvToHex(hsv.h, 1, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {/* Outer Hue Ring + Centered Inner SV Square */}
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <canvas
          ref={ringCanvasRef}
          width={size}
          height={size}
          style={{ width: size, height: size, cursor: "pointer", display: "block" }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragModeRef.current = "ring";
            updateHue(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (dragModeRef.current === "ring") updateHue(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            dragModeRef.current = "none";
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        />

        {/* Hue Ring Thumb */}
        <div
          style={{
            position: "absolute",
            left: hueThumbX - 7,
            top: hueThumbY - 7,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: pureHueHex,
            border: "2.5px solid #ffffff",
            boxShadow: "0 2px 6px rgb(0 0 0 / 0.75)",
            pointerEvents: "none",
          }}
        />

        {/* Inner Saturation / Value Square (White top-left, Black bottom, Hue top-right) */}
        <div
          ref={svBoxRef}
          style={{
            position: "absolute",
            width: svSize,
            height: svSize,
            borderRadius: 6,
            background: `linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, ${pureHueHex})`,
            boxShadow:
              "inset 0 0 0 1px rgb(255 255 255 / 0.16), 0 4px 14px rgb(0 0 0 / 0.65)",
            cursor: "none",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragModeRef.current = "sv";
            updateSV(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const lx = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
            const ly = Math.min(rect.height, Math.max(0, e.clientY - rect.top));
            const s = lx / rect.width;
            const v = 1 - ly / rect.height;
            setHoverLoupe({ x: lx, y: ly, hex: hsvToHex(hsv.h, s, v) });
            if (dragModeRef.current === "sv") updateSV(e.clientX, e.clientY);
          }}
          onPointerLeave={() => {
            if (dragModeRef.current !== "sv") setHoverLoupe(null);
          }}
          onPointerUp={(e) => {
            dragModeRef.current = "none";
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        >
          {/* Current selected color circle */}
          <div
            style={{
              position: "absolute",
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              transform: "translate(-50%, -50%)",
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: value,
              border: "2px solid #ffffff",
              boxShadow: "0 1px 4px rgb(0 0 0 / 0.85)",
              pointerEvents: "none",
            }}
          />
          {/* Live zoomed color loupe replacing the crosshair */}
          {hoverLoupe && (
            <div
              style={{
                position: "absolute",
                left: hoverLoupe.x,
                top: hoverLoupe.y,
                transform: "translate(-50%, -50%)",
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: hoverLoupe.hex,
                border: "2.5px solid #ffffff",
                boxShadow: "0 3px 10px rgb(0 0 0 / 0.8)",
                pointerEvents: "none",
                zIndex: 5,
              }}
            />
          )}
        </div>
      </div>

      {/* Centered Hex Pill */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          padding: "4px 12px",
          borderRadius: 8,
          background: "rgb(255 255 255 / 0.05)",
          border: "1px solid var(--lens-border)",
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          color: "var(--lens-fg)",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: value,
            border: "1px solid rgb(255 255 255 / 0.25)",
          }}
        />
        {value.toUpperCase()}
      </div>

      {/* Compact Sensical Swatches (White, Silver, Black + Modern Tones) */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {SWATCHES.map(({ hex, name }) => {
          const isSelected = accentMode === "custom" && value.toUpperCase() === hex;
          return (
            <button data-weight="medium"
              key={hex}
              type="button"
              aria-label={`Accent ${name}`}
              aria-pressed={isSelected}
              onClick={() => onSelectColor(hex)}
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                background: hex,
                border: isSelected
                  ? "2px solid #ffffff"
                  : "1px solid rgb(255 255 255 / 0.24)",
                outline: isSelected ? "1px solid #09090b" : "none",
              }}
            />
          );
        })}
        <button data-weight="medium"
          type="button"
          aria-label={`Win: sync Windows accent (${windowsAccentHex})`}
          onClick={onSelectWindowsLive}
          style={{
            height: 18,
            padding: "0 6px",
            borderRadius: 5,
            fontSize: 10,
            background: accentMode === "windows" ? "var(--lens-accent)" : "rgb(255 255 255 / 0.06)",
            color: accentMode === "windows" ? "#09090b" : "var(--lens-fg-secondary)",
            border: "1px solid var(--lens-border)",
            fontWeight: 600,
          }}
        >
          Win
        </button>
      </div>
    </div>
  );
};

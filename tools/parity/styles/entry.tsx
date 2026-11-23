// Style-layer scenes for Lens Expressive and Lens Dot Matrix.
// ?scene=widgets|statpills|dock|expressive-widgets|desktop|gallery &preset=<pack> &shape=expressive|dotmatrix
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import "../../../src/surfaces/QuickSettingsSurface.css";
import "../../../src/components/NotificationCenterPane.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { CookieClock, WeatherBlob, WeekBadge, Fab, CheckRing } from "../../../src/themes/shapes/Expressive";
import {
  BatteryTile,
  MediaDiscTile,
  WeatherCard,
  BigClockTile,
  DateTile,
  MinimalAnalogTile,
  StatPills,
  DotText,
} from "../../../src/themes/dotmatrix/DotMatrix";
import { LeftIsland, ChipsIsland } from "../../../src/dock/islands/IslandParts";
import { islandsLayout } from "../../../src/dock/islands/layout";
import { ThemeGallery } from "../../../src/components/ThemeGallery";
import { NotificationCenterPane } from "../../../src/components/NotificationCenterPane";
import { CalendarClockPane } from "../../../src/components/CalendarClockPane";

import { packById } from "../../../src/themes/packs";

const p = new URLSearchParams(location.search);
// Use the pack's own accent, as applying the pack in Settings would.
{
  const cfg = (globalThis as any).__lensConfig();
  const pk = packById(p.get("preset") || "obsidian");
  if (pk && pk.accentMode === "custom") cfg.theme.customAccent = pk.accent;
}
const scene = p.get("scene") || "widgets";
const shape = p.get("shape") || "expressive";
// Fixed time so screenshots are stable: Thursday 19 Nov 2026, 07:32.
const NOW = new Date(2026, 10, 19, 7, 32, 0);

const days = [
  { day: "Mon", kind: "sun" as const, high: 29, low: 24 },
  { day: "Tue", kind: "partly" as const, high: 28, low: 24 },
  { day: "Wed", kind: "cloud" as const, high: 28, low: 23 },
  { day: "Thu", kind: "rain" as const, high: 30, low: 24 },
  { day: "Fri", kind: "storm" as const, high: 30, low: 24 },
  { day: "Sat", kind: "snow" as const, high: 30, low: 24 },
];

const DotWidgets = () => (
  <div className="ldm-grid" style={{ padding: 24 }}>
    <BatteryTile percent={100} />
    <MediaDiscTile playing={false} />
    <WeatherCard temp={23} high={30} low={23} place="Springfield" condition="Clear" days={days} />
    <BigClockTile now={NOW} />
    <DateTile now={NOW} />
    <MinimalAnalogTile now={NOW} />
  </div>
);

const ExpressiveWidgets = () => (
  <div style={{ display: "flex", gap: 20, padding: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
    <div className="qs-card" style={{ width: 300, padding: 18, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--lens-fg-secondary)" }}>Thursday</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--lens-fg)" }}>November 19</div>
        </div>
        <WeekBadge date={NOW} />
      </div>
      <div style={{ display: "grid", placeItems: "center" }}>
        <CookieClock date={NOW} size={180} dayLabel="Thu 19" />
      </div>
    </div>
    <div className="qs-card" style={{ width: 340, padding: 16, display: "grid", gap: 10, position: "relative" }}>
      <div className="qs-row-title" style={{ textAlign: "center" }}>Agenda</div>
      {["Review the Dock PR", "Water the plants", "Call the bank back", "Ship the Pages site"].map((t, i) => (
        <div key={t} className="qs-tile" style={{ minHeight: 44 }}>
          <CheckRing checked={i === 1} label={t} />
          <span>{t}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Fab label="Add a to-do" />
      </div>
    </div>
    <div className="qs-card" style={{ width: 200, padding: 16, display: "grid", placeItems: "center" }}>
      <WeatherBlob temp={26} condition="Partly cloudy" size={160} />
    </div>
  </div>
);

const AppIcon = ({ c }: { c: string }) => <span style={{ width: 30, height: 30, borderRadius: shape === "expressive" ? 15 : 9, background: c, display: "inline-block" }} />;

/** A static Islands Dock built from the real island parts, laid out with islandsLayout(). */
const IslandsBar = ({ width }: { width: number }) => {
  const layout = islandsLayout({ width, left: 220, apps: 300, chips: shape === "expressive" ? 150 : 0, right: 250, height: 48 });
  const at = (id: string) => layout.islands.find((i) => i.id === id);
  const box = (id: string): React.CSSProperties => {
    const r = at(id)!;
    return { position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, boxSizing: "border-box" };
  };
  return (
    <div className="dock-stage dock-style-islands is-bar" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: layout.reserved }}>
      {at("left") && (
        <div style={box("left")}>
          <LeftIsland count={5} active={1} shapeStyle={shape} />
        </div>
      )}
      {at("apps") && (
        <div className="lds-island" style={{ ...box("apps"), justifyContent: "center", gap: 10 }}>
          {["#F97316", "#3B82F6", "#22C55E", "#A855F7", "#EAB308", "#EC4899", "#14B8A6"].map((c, i) => (
            <span key={c} style={{ position: "relative" }}>
              <AppIcon c={c} />
              {i < 3 && <span style={{ position: "absolute", left: 8, right: 8, bottom: -6, height: 3, borderRadius: 2, background: i === 0 ? "var(--lens-accent)" : "rgb(var(--lens-ink) / 0.5)" }} />}
            </span>
          ))}
        </div>
      )}
      {at("chips") && (
        <div style={box("chips")}>
          <ChipsIsland weather="26° Clear" />
        </div>
      )}
      {at("right") && (
        <div className="lds-island" style={{ ...box("right"), justifyContent: "flex-end", gap: 10, paddingRight: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ width: 14, height: 14, borderRadius: 4, border: "2px solid var(--lens-fg-secondary)" }} />
          ))}
          {shape === "dotmatrix" ? <DotText text="07:32" pitch={3} /> : <span style={{ color: "var(--lens-fg)", fontWeight: 700, fontSize: 13 }}>7:32 AM</span>}
        </div>
      )}
    </div>
  );
};

/** A neutral generated wave wallpaper (no images). */
const WaveWallpaper = () => (
  <svg width="100%" height="100%" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }} aria-hidden>
    <rect width="1600" height="900" fill="var(--lens-pack-base, #0b0b0e)" />
    {[0, 1, 2, 3, 4].map((i) => (
      <path
        key={i}
        d={`M0 ${220 + i * 140} C 300 ${120 + i * 140}, 600 ${360 + i * 140}, 900 ${240 + i * 140} S 1400 ${140 + i * 140}, 1600 ${260 + i * 140} V 900 H 0 Z`}
        fill="rgb(var(--lens-ink))"
        opacity={0.025 + i * 0.012}
      />
    ))}
  </svg>
);

const Desktop = () => {
  const W = 1600;
  return (
    <div style={{ position: "relative", width: W, height: 900, overflow: "hidden" }}>
      <WaveWallpaper />
      <div style={{ position: "absolute", top: 6, right: 10 }}>
        <StatPills values={{ cpu: 14, tempC: 56, memUsedGb: 7.4, memTotalGb: 32 }} now={NOW} />
      </div>
      <div style={{ position: "absolute", left: 60, top: 90, width: 760, height: 470, borderRadius: 12, background: "var(--lens-bg-elevated)", border: "1px solid var(--lens-border)" }}>
        <div style={{ height: 34, borderBottom: "1px solid var(--lens-border)", display: "flex", alignItems: "center", padding: "0 14px", color: "var(--lens-fg-secondary)", fontSize: 12 }}>
          Terminal
        </div>
        <div style={{ padding: 16, fontFamily: "Consolas, monospace", fontSize: 13, color: "var(--lens-fg-2)", lineHeight: 1.7 }}>
          <div>$ lens --version</div>
          <div>Lens UI 0.3.0</div>
          <div>$ _</div>
        </div>
      </div>
      <div style={{ position: "absolute", right: 30, top: 50, transform: "scale(0.82)", transformOrigin: "top right" }}>
        {shape === "dotmatrix" ? <DotWidgets /> : <ExpressiveWidgets />}
      </div>
      <IslandsBar width={W} />
    </div>
  );
};

function App() {
  useLensState();
  // Surfaces are transparent windows (global.css); give each scene the pack's own desktop colour.
  return <div style={{ background: "var(--lens-pack-base, #09090b)", minHeight: "100vh" }}>{renderScene()}</div>;
}

function renderScene() {
  switch (scene) {
    case "widgets":
      return shape === "dotmatrix" ? <DotWidgets /> : <ExpressiveWidgets />;
    case "statpills":
      return (
        <div style={{ padding: 16 }}>
          <StatPills values={{ cpu: 14, tempC: 56, memUsedGb: 7.4, memTotalGb: 32 }} now={NOW} />
        </div>
      );
    case "dock":
      return (
        <div style={{ position: "relative", width: 1366, height: 120 }}>
          <IslandsBar width={1366} />
        </div>
      );
    case "desktop":
      return <Desktop />;
    case "notifications":
      return (
        <div className="qs-shell" style={{ width: 380, padding: 12 }}>
          <NotificationCenterPane />
        </div>
      );
    case "calendar":
      return (
        <div className="qs-shell" style={{ width: 380, padding: 12 }}>
          <CalendarClockPane />
        </div>
      );
    case "gallery":
      return (
        <div style={{ padding: 16, width: 720 }}>
          <ThemeGallery config={(globalThis as any).__lensConfig()} onApply={() => {}} windowsAccent="#2D7D9A" onClose={() => {}} />
        </div>
      );
    default:
      return <ExpressiveWidgets />;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

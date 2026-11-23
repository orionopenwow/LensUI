// Renders Lens Music for screenshots: ?scene=…&preset=…[&tint=1]
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { NowPlayingView } from "../../../src/music/NowPlaying";
import { MiniPlayer } from "../../../src/music/MiniPlayer";
import { MusicCard } from "../../../src/components/MusicCard";
import { nowPlayingScene } from "../../../src/music/scene";
import { musicAccent, pickVivid, type NowPlaying } from "../../../src/music/model";
import { samplePalette } from "../../../src/music/art";
import { SAMPLE } from "./mockCore";

const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "np-expanded";
const tint = p.get("tint") === "1";
const now = SAMPLE as unknown as NowPlaying;

/** Simulates "Theme follows music": recolours --lens-accent like MusicAccentBridge does. */
function useTint(on: boolean) {
  const [ready, setReady] = useState(!on);
  useEffect(() => {
    if (!on) return;
    samplePalette(now.artwork!).then((pal) => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      const base = cs.getPropertyValue("--lens-pack-base").trim() || "#09090b";
      root.style.setProperty("--lens-accent", musicAccent(pickVivid(pal), cs.getPropertyValue("--lens-accent").trim() || "#fafafa", base.startsWith("#") ? base : "#09090b", 0.7));
      setReady(true);
    });
  }, [on]);
  return ready;
}

const Chrome: React.FC = () => (
  <div className="lens-glass" style={{ padding: 16, display: "grid", gap: 12, width: 520 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ width: 10, height: 10, borderRadius: 99, background: "var(--lens-accent)" }} />
      <b style={{ fontSize: 13 }}>Lens accent</b>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{tint ? "following the music" : "your theme"}</span>
    </div>
    <div style={{ display: "flex", gap: 8 }}>
      <button className="cc-btn">Primary</button>
      <button className="cc-chip active">Selected chip</button>
      <span className="cc-toggle on" role="switch" aria-checked />
    </div>
    <div style={{ height: 4, borderRadius: 4, background: "linear-gradient(90deg, var(--lens-accent) 62%, rgba(127,127,127,.25) 62%)" }} />
    <div style={{ border: "2px solid var(--lens-accent)", borderRadius: 10, padding: 10, fontSize: 12 }}>Active window border</div>
  </div>
);

const DockMock: React.FC<{ kind: "floating" | "taskbar" }> = ({ kind }) => (
  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#1b2330,#2a1830)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
    <div className="lens-glass" style={kind === "floating"
      ? { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 22, marginBottom: 16 }
      : { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 0, width: "100%", height: 48, boxSizing: "border-box" }}>
      {["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7"].map((c) => (
        <span key={c} style={{ width: 36, height: 36, borderRadius: 10, background: c, opacity: 0.85 }} />
      ))}
      <span style={{ width: 1, height: 28, background: "var(--lens-border)" }} />
      <MiniPlayer variant={kind === "floating" ? "dock" : "topbar"} fixed={{ now, position: 64_000 }} />
      {kind === "taskbar" && <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>3:09 PM</span>}
    </div>
  </div>
);

const SceneCanvas: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const pal = { accent: { r: 217, g: 70, b: 143 }, base: { r: 9, g: 9, b: 11 }, elevated: { r: 24, g: 24, b: 28 }, fg: { r: 250, g: 250, b: 250 }, dark: true };
    const inst = nowPlayingScene.create({ canvas: c, width: 960, height: 540, dpr: 1, palette: pal, options: { speed: 0.6, react: false, glow: 0.9 }, seed: 7, preview: false });
    let f = 0;
    const loop = () => {
      inst.step(1 / 30, { x: 0, y: 0, inside: false, buttons: 0, alt: false, events: [] });
      inst.render();
      if (++f < 90) requestAnimationFrame(loop);
    };
    loop();
    return () => inst.dispose();
  }, []);
  return <canvas ref={ref} style={{ width: 960, height: 540, display: "block" }} />;
};

/** Static approximation of Spotify's layout using the *generated* Lens Spicetify theme. */
const SpicetifyMock: React.FC = () => {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const name = tint ? "music-tint" : p.get("preset") === "alabaster-daylight" ? "alabaster-daylight" : "obsidian";
    Promise.all([fetch(`fixtures/${name}.color.ini`).then((r) => r.text()), fetch(`fixtures/${name}.user.css`).then((r) => r.text())]).then(([ini, css]) => {
      const vars: string[] = [];
      for (const line of ini.split("\n")) {
        const m = line.match(/^([a-z-]+)\s*=\s*([0-9a-f]{6})/i);
        if (!m) continue;
        const v = parseInt(m[2], 16);
        vars.push(`--spice-${m[1]}: #${m[2]}`, `--spice-rgb-${m[1]}: ${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`);
      }
      const st = document.createElement("style");
      st.textContent = `.spice-root{${vars.join(";")}} ${css.replace(/:root/g, ".spice-root")}`;
      document.head.appendChild(st);
      setOk(true);
    });
  }, []);
  const art = now.artwork!;
  return (
    <div className="spice-root Root" style={{ height: "100%", background: "var(--spice-sidebar)", color: "var(--spice-text)", fontFamily: "system-ui, sans-serif", opacity: ok ? 1 : 0 }}>
      <div className="Root__top-container" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gridTemplateRows: "1fr auto", height: "100%", boxSizing: "border-box" }}>
        <nav className="Root__nav-bar" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Your Library</div>
          {["Favourite Songs", "Late Night Focus", "Heavyweight D&B", "Lens Sessions, Vol. 1"].map((t, i) => (
            <div key={t} className="main-yourLibraryX-listItem" style={{ display: "flex", gap: 8, alignItems: "center", padding: 6 }}>
              <img src={art} style={{ width: 40, height: 40, borderRadius: 4, filter: `hue-rotate(${i * 50}deg)` }} />
              <div><div className="main-yourLibraryX-listRowTitle" style={{ fontSize: 13, fontWeight: 600 }}>{t}</div><div className="main-yourLibraryX-listRowSubtitle" style={{ color: "var(--spice-subtext)" }}>Playlist · You</div></div>
            </div>
          ))}
        </nav>
        <main className="Root__main-view" style={{ overflow: "hidden", position: "relative" }}>
          <div className="main-entityHeader-backgroundColor" style={{ backgroundColor: "#5b1d4a", padding: 24, display: "flex", gap: 20, alignItems: "flex-end" }}>
            <img src={art} style={{ width: 180, height: 180, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }} />
            <div className="main-entityHeader-title">
              <div style={{ fontSize: 12 }}>Album</div>
              <h1 style={{ fontSize: 56, margin: "4px 0" }}>Lens Sessions</h1>
              <div className="main-entityHeader-metaData" style={{ color: "var(--spice-subtext)" }}>The Placeholders · 2026 · 8 songs, 31 min</div>
            </div>
          </div>
          <div style={{ padding: "16px 24px" }}>
            <span className="main-playButton-PlayButton"><button style={{ width: 52, height: 52, borderRadius: 99, border: 0 }}>▶</button></span>
            {["Harbour Lights", "Glass Canyon", "Slow Static", "Paper Tides"].map((t, i) => (
              <div key={t} style={{ display: "grid", gridTemplateColumns: "24px 1fr 60px", padding: "8px 0", color: i === 0 ? "var(--spice-button)" : undefined }}>
                <span className="main-trackList-rowSubTitle" style={{ color: "var(--spice-subtext)" }}>{i + 1}</span><span>{t}</span>
                <span className="main-trackList-rowDuration" style={{ color: "var(--spice-subtext)" }}>3:4{i}</span>
              </div>
            ))}
          </div>
        </main>
        <footer className="Root__now-playing-bar" style={{ gridColumn: "1 / -1", padding: "10px 16px", display: "flex", alignItems: "center", gap: 16 }}>
          <img src={art} style={{ width: 48, height: 48, borderRadius: 6 }} />
          <div style={{ fontSize: 13 }}><b>Harbour Lights</b><div style={{ color: "var(--spice-subtext)" }}>The Placeholders</div></div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="playback-bar__progress-time-elapsed" style={{ color: "var(--spice-subtext)" }}>1:04</span>
            <div style={{ flex: 1, height: 4, borderRadius: 4, background: "rgba(var(--spice-rgb-text),.2)" }}><div className="x-progressBar-fillColor" style={{ width: "28%", height: 4, borderRadius: 4 }} /></div>
            <span className="playback-bar__progress-time" style={{ color: "var(--spice-subtext)" }}>3:44</span>
          </div>
        </footer>
      </div>
      <div style={{ position: "absolute", right: 8, top: 8, fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,.5)", color: "#fff" }}>Preview mock — not Spotify</div>
    </div>
  );
};

function App() {
  useLensState();
  const ready = useTint(tint);
  if (!ready) return null;
  if (scene === "mini-floating") return <DockMock kind="floating" />;
  if (scene === "mini-taskbar") return <DockMock kind="taskbar" />;
  if (scene === "accent") return <div style={{ padding: 24 }}><Chrome /></div>;
  if (scene === "scene") return <SceneCanvas />;
  if (scene === "spicetify") return <SpicetifyMock />;
  if (scene === "card") {
    return (
      <div className="lens-glass cc-content" style={{ minHeight: "100%", boxSizing: "border-box", borderRadius: 0 }}>
        <MusicCard />
      </div>
    );
  }
  const mode = scene.includes("compact") ? "compact" : scene.includes("fullscreen") ? "fullscreen" : "expanded";
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <NowPlayingView mode={mode} fixed={{ now: scene === "np-empty" ? { ...now, hasSession: false } : now, position: 64_000 }} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

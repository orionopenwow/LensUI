// "Lens at work" scenes on a mock desktop: ?scene=<name>&preset=<pack>[&t=<ms>]
// Scenes: travel click typing snap setting flip banner waiting subtle card demo
// `demo` is the "Lens, tile left and turn on dark mode" timeline; `t` picks the frame (0–5600 ms).
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/approval/ApprovalCard.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { PresenceView } from "../../../src/presence/PresenceView";
import { PresenceBar } from "../../../src/presence/PresenceBar";
import { PresenceTwin } from "../../../src/presence/PresenceTwin";
import { PresenceCard } from "../../../src/presence/PresenceCard";
import { ORB_URL } from "../../../src/presence/orb";
import { caption, ease, maskLocal, pathAt, sceneFor, travelMs, ORB_SIZE, type Pt } from "../../../src/presence/model";
import { EVT_UI, type LRect, type PresenceEvent, type UiEvent } from "../../../src/presence/types";

const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "travel";
const preset = p.get("preset") || "obsidian";
const light = preset.includes("daylight") || preset.includes("paper");
const T = Number(p.get("t") || 0);

const W = 1000;
const H = 640;
const DOCK_Y = 584;
const DOCK_ICONS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#64748b"];
const dockIcon = (i: number): LRect => ({ x: 356 + i * 50, y: DOCK_Y + 8, w: 40, h: 40 });
const SETTINGS_ICON = dockIcon(5);
const WIN: LRect = { x: 220, y: 70, w: 560, h: 380 };

function ev(over: Partial<PresenceEvent>): PresenceEvent {
  return {
    run: 1, seq: 2, actor: { kind: "internal", label: "Lens" }, external: false, visual: "full", travel: true, catchUp: false,
    kind: "click", target: null, dest: null, monitor: null, caption: "", text: null, index: 1, total: null, settings: [], durationMs: 400, captions: true,
    ...over,
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  useLensState();
  return <>{children}</>;
}

function Desktop({ dark = !light, win = WIN, children, title = "Q4 planning.docx — Word", body }: { dark?: boolean; win?: LRect; children?: React.ReactNode; title?: string; body?: React.ReactNode }) {
  const bg = dark ? "linear-gradient(135deg, #2b303b, #161a22 60%, #20242e)" : "linear-gradient(135deg, #d9dee7, #eef1f6 55%, #cfd6e2)";
  return (
    <div style={{ position: "fixed", inset: 0, background: bg, overflow: "hidden", font: "13px system-ui" }}>
      <div
        style={{
          position: "absolute", left: win.x, top: win.y, width: win.w, height: win.h, borderRadius: 10, boxSizing: "border-box",
          background: dark ? "#1e2128" : "#ffffff", border: dark ? "1px solid #2c3039" : "1px solid #d5d9e0",
          boxShadow: "0 10px 30px rgba(0,0,0,.25)", color: dark ? "#ddd" : "#222", padding: 18, overflow: "hidden",
        }}
      >
        <b>{title}</b>
        {body ?? (
          <p style={{ margin: "14px 0 0", lineHeight: "22px", color: dark ? "#aab" : "#555" }}>
            Next steps: ship “Lens at work” behind Subtle, then turn on Full for the beta channel once parity is green.
          </p>
        )}
      </div>
      <div
        style={{
          position: "absolute", left: 340, top: DOCK_Y, width: 320, height: 56, borderRadius: 16,
          background: dark ? "rgba(20,22,28,.85)" : "rgba(255,255,255,.8)", border: dark ? "1px solid #2c3039" : "1px solid #d5d9e0",
        }}
      />
      {DOCK_ICONS.map((c, i) => {
        const r = dockIcon(i);
        return <div key={c} style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 10, background: c, opacity: 0.92 }} />;
      })}
      <svg width="22" height="22" viewBox="0 0 24 24" style={{ position: "absolute", left: SETTINGS_ICON.x + 9, top: SETTINGS_ICON.y + 9 }} aria-hidden>
        <circle cx="12" cy="12" r="4" fill="none" stroke="#fff" strokeWidth="2" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="#fff" strokeWidth="2" />
      </svg>
      {children}
    </div>
  );
}

/** Earlier orb positions along the curve, fading — the "travel frames". */
function Trail({ from, to, n = 6 }: { from: Pt; to: Pt; n?: number }) {
  const pts = Array.from({ length: n }, (_, i) => pathAt(from, to, i / n));
  return (
    <>
      {pts.map((q, i) => (
        <img key={i} src={ORB_URL} alt="" style={{ position: "absolute", left: q.x - ORB_SIZE / 2, top: q.y - ORB_SIZE / 2, width: ORB_SIZE, height: ORB_SIZE, opacity: 0.12 + (0.5 * i) / n }} />
      ))}
    </>
  );
}

function Still({ e, from }: { e: PresenceEvent; from: Pt | null }) {
  return <PresenceView scene={sceneFor(e, from)} progress={1} still />;
}

function Field({ label, value, at }: { label: string; value: string; at: LRect }) {
  return (
    <div style={{ position: "absolute", left: at.x, top: at.y - 20, width: at.w }}>
      <div style={{ fontSize: 12, height: 16, color: light ? "#555" : "#aab", marginBottom: 4 }}>{label}</div>
      <div style={{ height: at.h, boxSizing: "border-box", borderRadius: 6, border: light ? "1px solid #c8ccd4" : "1px solid #3a3f4a", background: light ? "#fff" : "#15171c", padding: "0 10px", lineHeight: `${at.h}px`, color: light ? "#222" : "#ddd" }}>{value}</div>
    </div>
  );
}

function SettingsMock() {
  const row = (id: string, label: string, control: React.ReactNode) => (
    <div className="cc-row" data-guide-id={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, background: "rgb(var(--lens-ink) / 0.04)", marginTop: 8 }}>
      <span className="cc-label">{label}</span>
      {control}
    </div>
  );
  const sw = (on: boolean) => <span className="pr-toggle" role="switch" aria-checked={on} style={{ display: "inline-block" }} />;
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--lens-bg-base)", color: "var(--lens-fg)", font: "13px var(--font-sans, system-ui)", padding: 32, boxSizing: "border-box" }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Appearance</div>
      <div style={{ width: 560 }}>
        {row("settings.theme", "Theme", <span style={{ color: "var(--lens-fg-muted)" }}>Obsidian</span>)}
        {row("settings.theme-mode", "Dark mode", sw(true))}
        {row("settings.accent", "Accent colour", <span style={{ width: 16, height: 16, borderRadius: 8, background: "var(--lens-accent)", display: "inline-block" }} />)}
        {row("settings.night-light", "Night light", sw(false))}
      </div>
    </div>
  );
}

function Flip() {
  useEffect(() => {
    const detail: UiEvent = { actor: { kind: "internal", label: "Lens" }, settings: ["Mode → Dark"], label: "Mode → Dark" };
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent(EVT_UI, { detail })), 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <SettingsMock />
      <PresenceTwin still />
    </>
  );
}

// ------------------------------------------------------------------------------- the demo reel
// "Lens, tile left and turn on dark mode": 0 ask · 0.6 s travel to the title bar · ghost ·
// 1.6 s window snaps · 2.5 s fly to Settings in the dock · 3.4 s theme flips · 4.4 s done.

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRect = (a: LRect, b: LRect, t: number): LRect => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
const phase = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const LEFT: LRect = { x: 8, y: 8, w: W / 2 - 12, h: DOCK_Y - 16 };
const TITLE: LRect = { x: WIN.x + 12, y: WIN.y + 8, w: 220, h: 26 };

function Demo({ t }: { t: number }) {
  const snap = ease(phase(t, 1600, 2300));
  const dark = t >= 3500;
  const win = lerpRect(WIN, LEFT, snap);
  const start: Pt = { x: 840, y: 520 };
  const titleC: Pt = { x: TITLE.x + TITLE.w / 2, y: TITLE.y + TITLE.h / 2 };
  const leftC: Pt = { x: LEFT.x + LEFT.w / 2, y: LEFT.y + LEFT.h / 2 };
  const setC: Pt = { x: SETTINGS_ICON.x + 20, y: SETTINGS_ICON.y + 20 };
  let view: React.ReactNode = null;
  if (t >= 300 && t < 1600) {
    const d = travelMs(Math.hypot(titleC.x - start.x, titleC.y - start.y));
    const e = ev({ kind: "window", target: TITLE, dest: LEFT, caption: caption("Lens", "Tile left", 1, 2), index: 1, total: 2 });
    const s = { ...sceneFor(e, start), to: titleC, ghost: t > 300 + d ? { from: WIN, to: LEFT } : null };
    view = <PresenceView scene={s} progress={phase(t, 300, 300 + d)} still />;
  } else if (t >= 1600 && t < 2500) {
    const e = ev({ kind: "window", target: win, dest: LEFT, caption: caption("Lens", "Tile left", 1, 2), index: 1, total: 2 });
    const s = { ...sceneFor(e, titleC), from: titleC, to: leftC, ring: null, ghost: snap < 1 ? { from: null, to: LEFT } : null };
    view = <PresenceView scene={s} progress={snap} still />;
  } else if (t >= 2500 && t < 4400) {
    const d = travelMs(Math.hypot(setC.x - leftC.x, setC.y - leftC.y));
    const e = ev({ kind: t >= 2500 + d + 150 ? "click" : "setting", target: SETTINGS_ICON, settings: ["Mode → Dark"], caption: caption("Lens", "Mode → Dark", 2, 2), index: 2, total: 2 });
    const s = sceneFor(e, leftC);
    const chip = t >= 2500 + d ? { kind: "setting" as const, text: "Mode → Dark" } : null;
    view = <PresenceView scene={{ ...s, chip, ripple: t >= 2500 + d + 150 && t < 3300 ? s.ripple : null }} progress={phase(t, 2500, 2500 + d)} still />;
  } else if (t >= 4400) {
    const e = ev({ kind: "done", target: SETTINGS_ICON, caption: caption("Lens", "Done", 2, 2), index: 2, total: 2 });
    const s = sceneFor(e, setC);
    const fadeOut = 1 - phase(t, 5000, 5600);
    view = <div style={{ opacity: fadeOut }}><PresenceView scene={{ ...s, travel: false }} progress={1} still /></div>;
  }
  const askOpacity = t < 1400 ? 1 : 1 - phase(t, 1400, 1800);
  return (
    <Desktop dark={dark} win={win}>
      {askOpacity > 0 ? (
        <div className="pr-chip" style={{ left: W / 2, top: DOCK_Y - 48, opacity: askOpacity, fontWeight: 500, display: "flex", gap: 8, alignItems: "center", paddingLeft: 6 }}>
          <img src={ORB_URL} alt="" width={18} height={18} /> “Lens, tile left and turn on dark mode”
        </div>
      ) : null}
      {view}
    </Desktop>
  );
}

// ------------------------------------------------------------------------------------- scenes
function Scene() {
  const title: Pt = { x: WIN.x + 120, y: WIN.y + 20 };
  switch (scene) {
    case "travel": {
      const target: LRect = { x: 640, y: 130, w: 110, h: 32 };
      const from: Pt = { x: 160, y: 520 };
      return (
        <Desktop body={<button style={{ position: "absolute", left: target.x - WIN.x, top: target.y - WIN.y, width: target.w, height: target.h, borderRadius: 6, border: 0, background: "#3b82f6", color: "#fff" }}>Share</button>}>
          <Trail from={from} to={{ x: target.x + target.w / 2, y: target.y + target.h / 2 }} n={7} />
          <Still e={ev({ kind: "click", target, caption: caption("Lens", "Clicking ‘Share’", 2, 4), index: 2, total: 4 })} from={from} />
        </Desktop>
      );
    }
    case "click": {
      const target = dockIcon(1);
      return (
        <Desktop>
          <Still e={ev({ kind: "click", target, caption: caption("Lens", "Opening Files", 1, 1), index: 1, total: 1 })} from={{ x: 300, y: 400 }} />
        </Desktop>
      );
    }
    case "typing": {
      const to: LRect = { x: WIN.x + 18, y: WIN.y + 90, w: 380, h: 32 };
      const pw: LRect = { x: WIN.x + 18, y: WIN.y + 190, w: 380, h: 32 };
      return (
        <Desktop title="Deploy — Settings" body={<span />}>
          <Field label="Message" value="Rotated key" at={to} />
          <Field label="API key" value="••••••••••••••••" at={pw} />
          <Still e={ev({ kind: "type", target: to, text: maskLocal("Rotated key sk-live-4f9a2c71b0e94d8a", false), caption: caption("Claude Code", "Typing into ‘Message’", 3, 5), index: 3, total: 5, actor: { kind: "claude-code", label: "Claude Code" }, external: true })} from={{ x: 300, y: 200 }} />
        </Desktop>
      );
    }
    case "snap": {
      return (
        <Desktop>
          <Still e={ev({ kind: "window", target: { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h }, dest: LEFT, caption: caption("Lens", "Tile left", 1, 2), index: 1, total: 2 })} from={title} />
        </Desktop>
      );
    }
    case "setting": {
      return (
        <Desktop>
          <Trail from={{ x: 500, y: 260 }} to={{ x: SETTINGS_ICON.x + 20, y: SETTINGS_ICON.y + 20 }} n={6} />
          <Still e={ev({ kind: "setting", target: SETTINGS_ICON, settings: ["Theme → Nord"], caption: caption("Lens", "Theme → Nord", 1, 1), index: 1, total: 1 })} from={{ x: 500, y: 260 }} />
        </Desktop>
      );
    }
    case "flip":
      return <Flip />;
    case "banner": {
      const target: LRect = { x: WIN.x + 18, y: WIN.y + 120, w: 140, h: 34 };
      return (
        <Desktop body={<button style={{ position: "absolute", left: 18, top: 120, width: 140, height: 34, borderRadius: 6, border: 0, background: "#10b981", color: "#fff" }}>Book table</button>} title="Dinner — Lens Browser">
          <div style={{ position: "absolute", left: (W - 560) / 2, top: 8, width: 560 }}>
            <PresenceBar label="Claude Desktop" step="Clicking ‘Book table’ · 3/7" hotkey="Ctrl+Alt+Pause" onStop={() => {}} />
          </div>
          <Still e={ev({ kind: "click", visual: "subtle", target, external: true, actor: { kind: "claude-desktop", label: "Claude Desktop" }, caption: caption("Claude Desktop", "Clicking ‘Book table’", 3, 7), index: 3, total: 7 })} from={null} />
        </Desktop>
      );
    }
    case "waiting": {
      const card: LRect = { x: 520, y: 120, w: 400, h: 158 };
      return (
        <Desktop>
          <div className="ap-card" style={{ position: "absolute", left: card.x, top: card.y, width: card.w, maxWidth: card.w, height: card.h, animation: "none" }}>
            <div className="ap-head"><span className="ap-head-title">Needs your OK</span></div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Send the summary to Maya?</div>
            <div style={{ color: "var(--lens-fg-muted)" }}>Claude Code wants to send an email from Outlook.</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={{ height: 32, padding: "0 14px", borderRadius: 8, border: 0, background: "var(--lens-accent)", color: "var(--lens-accent-fg, #000)" }}>Allow once</button>
              <button style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "1px solid var(--lens-border)", background: "transparent", color: "var(--lens-fg)" }}>Deny</button>
            </div>
          </div>
          <Still e={ev({ kind: "wait", target: card, actor: { kind: "claude-code", label: "Claude Code" }, external: true, caption: caption("Claude Code", "Waiting for your OK", 4, 6), index: 4, total: 6 })} from={null} />
        </Desktop>
      );
    }
    case "subtle": {
      const target = dockIcon(2);
      return (
        <Desktop>
          <Still e={ev({ kind: "click", visual: "subtle", target, caption: caption("Voice", "Opening Music", 1, 1), actor: { kind: "voice", label: "Voice" }, index: 1, total: 1 })} from={null} />
        </Desktop>
      );
    }
    case "card":
      return (
        <div style={{ padding: 16, background: "var(--lens-bg-base)", minHeight: "100%", color: "var(--lens-fg)" }}>
          <div style={{ width: 640 }}>
            <PresenceCard initial={{ mode: "subtle", externalAlways: true, pauseHotkey: "Ctrl+Alt+Pause", captions: true }} hotkeyOk />
          </div>
        </div>
      );
    case "demo":
      return <Demo t={T} />;
    default:
      return null;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <Shell>
    <Scene />
  </Shell>,
);
// Frame stepping for the demo reel without reloading.
(window as unknown as { __frame: (t: number) => void }).__frame = (t: number) =>
  root.render(
    <Shell>
      <Demo t={t} />
    </Shell>,
  );

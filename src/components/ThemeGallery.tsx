import React from "react";
import type { LensConfig } from "../types/lens";
import { allPacks, lighten, type ThemePack } from "../themes/packs";

interface Props {
  config: LensConfig;
  /** Called with the pack id; the parent applies it (applyThemePack + updateConfig). */
  onApply: (packId: string) => void;
  /** Live Windows accent, used to draw packs that follow the OS accent. */
  windowsAccent?: string;
}

const TIER_ORDER: ThemePack["tier"][] = ["Core", "Linux Suite", "Studio", "Light", "Custom"];
const TIER_LABEL: Record<ThemePack["tier"], string> = {
  Core: "Core",
  "Linux Suite": "Linux Suite",
  Studio: "Studio",
  Light: "Light",
  Custom: "Your Themes",
};

const TRAFFIC: Record<string, [string, string, string]> = {
  "traffic-classic": ["#28c840", "#febc2e", "#ff5f57"],
  "traffic-muted": ["#3ec969", "#f0be4a", "#f06761"],
  "minimal-dots": ["#34d399", "#fbbf24", "#fb7185"],
  "accent-pills": ["#22c55e", "#eab308", "#ef4444"],
};

/** A miniature desktop drawn entirely from the pack's own values — no screenshots. */
const PackPreview: React.FC<{ pack: ThemePack; accent: string }> = ({ pack, accent }) => {
  const light = pack.scheme === "light";
  const base = pack.base ?? "#09090B";
  const elevated = light ? "#FFFFFF" : lighten(base, 0.045);
  const ink = light ? "0 0 0" : "255 255 255";
  const text = light ? "#18181B" : "#FAFAFA";
  const radius = Math.max(2, Math.round(pack.radius * 0.55));
  const frame =
    pack.frameStyle === "none"
      ? "transparent"
      : pack.frameStyle === "obsidian-hairline" || accent.toUpperCase() === "#FAFAFA"
        ? `rgb(${ink} / 0.16)`
        : accent;
  const dots = TRAFFIC[pack.controlStyle] ?? TRAFFIC["traffic-classic"];
  const pill = pack.controlStyle === "accent-pills";

  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: "100%",
        height: 78,
        borderRadius: 8,
        overflow: "hidden",
        background: `linear-gradient(150deg, ${lighten(base, light ? 0 : 0.1)}, ${base})`,
        border: `1px solid rgb(${ink} / 0.12)`,
      }}
    >
      {/* top bar */}
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: 9,
          background: elevated,
          borderBottom: `1px solid rgb(${ink} / 0.1)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 3,
          padding: "0 5px",
        }}
      >
        <span style={{ width: 14, height: 3, borderRadius: 2, background: `rgb(${ink} / 0.28)` }} />
        <span style={{ width: 3, height: 3, borderRadius: 2, background: text }} />
      </div>

      {/* an app window with the pack's frame, radius and window buttons */}
      <div
        style={{
          position: "absolute",
          left: 12,
          right: 26,
          top: 16,
          height: 36,
          borderRadius: radius,
          background: elevated,
          border: `1px solid ${frame}`,
          boxShadow:
            pack.frameStyle === "neon" ? `0 0 8px ${accent}88` : `0 3px 8px rgb(0 0 0 / ${light ? 0.12 : 0.45})`,
          padding: "5px 6px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }}>
          {dots.map((c, i) => (
            <span
              key={i}
              style={{ width: pill ? 8 : 5, height: pill ? 4 : 5, borderRadius: 3, background: c }}
            />
          ))}
        </div>
        <span style={{ width: "62%", height: 3, borderRadius: 2, background: text, opacity: 0.85 }} />
        <span style={{ width: "40%", height: 3, borderRadius: 2, background: `rgb(${ink} / 0.32)` }} />
        <span style={{ width: 16, height: 5, borderRadius: 3, background: accent }} />
      </div>

      {/* dock */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 3,
          padding: "3px 6px",
          borderRadius: `${radius}px ${radius}px 0 0`,
          background: elevated,
          border: `1px solid rgb(${ink} / 0.12)`,
          borderBottom: "none",
        }}
      >
        {[accent, "#60a5fa", "#34d399", "#fbbf24"].map((c, i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: pack.iconShape === "circle" ? 4 : pack.iconShape === "rounded" ? 2 : 2.5,
              background: c,
            }}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Every theme pack (built-in and custom) grouped by tier, each as a live mini-preview card.
 * Drop-in replacement for the Theme Packs chip list in Control Center.
 */
export const ThemeGallery: React.FC<Props> = ({ config, onApply, windowsAccent }) => {
  const packs = allPacks();
  return (
    <div className="cc-card">
      <div className="cc-label">Theme Gallery</div>
      <div className="cc-desc">
        One click restyles surfaces, accent, icons, folders, and window frames together.
      </div>
      {TIER_ORDER.map((tier) => {
        const inTier = packs.filter((p) => p.tier === tier);
        if (inTier.length === 0) return null;
        return (
          <div key={tier} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--lens-fg-secondary)",
              }}
            >
              {TIER_LABEL[tier]}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))",
                gap: 10,
              }}
            >
              {inTier.map((pack) => {
                const active = config.theme.preset === pack.id;
                const accent =
                  pack.accentMode === "windows" ? (windowsAccent ?? pack.accent) : pack.accent;
                return (
                  <button
                    key={pack.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${pack.label} theme`}
                    onClick={() => onApply(pack.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 7,
                      padding: 7,
                      borderRadius: 11,
                      textAlign: "left",
                      cursor: "pointer",
                      background: active ? "rgb(var(--lens-ink) / 0.1)" : "rgb(var(--lens-ink) / 0.035)",
                      border: `1px solid ${active ? "var(--lens-fg)" : "var(--lens-border)"}`,
                      color: active ? "var(--lens-fg)" : "var(--lens-fg-secondary)",
                      transition:
                        "background 150ms cubic-bezier(0.22, 1, 0.36, 1), border-color 150ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  >
                    <PackPreview pack={pack} accent={accent} />
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{pack.label}</span>
                      {active && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            background: "var(--lens-fg)",
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

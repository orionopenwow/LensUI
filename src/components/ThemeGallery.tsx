import React, { useMemo, useState } from "react";
import { ExternalLink, Search, Star, X } from "lucide-react";
import { openExternal } from "../ai/open";
import type { LensConfig } from "../types/lens";
import { allPacks, lighten, type ThemePack } from "../themes/packs";
import { CLAUDE_COLLECTION } from "../themes/community/claude";
import "../themes/community/community.css";
import { dockStyleLabel } from "../dock/styles";
import { AmbientPreview, packPalette } from "../playground/ambient/controls";

interface Props {
  config: LensConfig;
  /** Called with the pack id; the parent applies it (applyThemePack + updateConfig). */
  onApply: (packId: string) => void;
  /** Live Windows accent, used to draw packs that follow the OS accent. */
  windowsAccent?: string;
  /** Shows a close button in the header (used when the gallery opens from "Browse all"). */
  onClose?: () => void;
}

const TIER_ORDER: ThemePack["tier"][] = ["Core", "Linux Suite", "Studio", "Light", "Living", "Community", "Custom"];

type FilterId = "all" | "dark" | "light" | "linux" | "studio" | "living" | "claude" | "custom";
const FILTERS: { id: FilterId; label: string; test: (p: ThemePack) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "dark", label: "Dark", test: (p) => p.scheme !== "light" },
  { id: "light", label: "Light", test: (p) => p.scheme === "light" },
  { id: "linux", label: "Linux classics", test: (p) => p.tier === "Linux Suite" },
  { id: "studio", label: "Studio", test: (p) => p.tier === "Studio" },
  { id: "living", label: "Living", test: (p) => p.tier === "Living" },
  { id: "claude", label: "Claude Code", test: (p) => p.collection === CLAUDE_COLLECTION },
  { id: "custom", label: "Custom", test: (p) => p.tier === "Custom" },
];

const TRAFFIC: Record<string, [string, string, string]> = {
  "traffic-classic": ["#28c840", "#febc2e", "#ff5f57"],
  "traffic-muted": ["#3ec969", "#f0be4a", "#f06761"],
  "minimal-dots": ["#34d399", "#fbbf24", "#fb7185"],
  "accent-pills": ["#22c55e", "#eab308", "#ef4444"],
};

/** A miniature desktop drawn entirely from the pack's own values — no screenshots. */
export const PackPreview: React.FC<{ pack: ThemePack; accent: string; height?: number }> = ({ pack, accent, height = 78 }) => {
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
  const compact = height < 64;
  const dockStyle = pack.dockStyle ?? "floating";
  const dockIcons = [accent, "#60a5fa", "#34d399", "#fbbf24"];
  const iconRadius = pack.iconShape === "circle" ? 4 : pack.iconShape === "rounded" ? 2 : 2.5;

  const dockBox: React.CSSProperties =
    dockStyle === "taskbar"
      ? { left: 0, right: 0, bottom: 0, justifyContent: "center", borderRadius: 0, borderLeft: "none", borderRight: "none", borderBottom: "none" }
      : dockStyle === "minimal"
        ? { left: "50%", bottom: 3, transform: "translateX(-50%)", background: "transparent", border: "none" }
        : dockStyle === "slim"
          ? { left: "50%", bottom: 3, transform: "translateX(-50%)", padding: "2px 4px", borderRadius: 4 }
          : { left: "50%", bottom: 3, transform: "translateX(-50%)", borderRadius: radius };

  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 8,
        overflow: "hidden",
        background: `linear-gradient(150deg, ${lighten(base, light ? 0 : 0.1)}, ${base})`,
        border: `1px solid rgb(${ink} / 0.12)`,
      }}
    >
      {/* the pack's own animated backdrop (docs/AMBIENT.md), drawn under everything else */}
      <AmbientPreview packId={pack.id} palette={packPalette(pack, accent)} fps={6} />
      {/* top bar */}
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: compact ? 7 : 9,
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
          left: compact ? 8 : 12,
          right: compact ? 14 : 26,
          top: compact ? 12 : 16,
          height: compact ? height - 30 : 36,
          borderRadius: radius,
          background: elevated,
          border: `1px solid ${frame}`,
          boxShadow:
            pack.frameStyle === "neon" ? `0 0 8px ${accent}88` : `0 3px 8px rgb(0 0 0 / ${light ? 0.12 : 0.45})`,
          padding: compact ? "4px 5px" : "5px 6px",
          display: "flex",
          flexDirection: "column",
          gap: compact ? 3 : 4,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }}>
          {dots.map((c, i) => (
            <span key={i} style={{ width: pill ? 8 : 5, height: pill ? 4 : 5, borderRadius: 3, background: c }} />
          ))}
        </div>
        <span style={{ width: "62%", height: 3, borderRadius: 2, background: text, opacity: 0.85 }} />
        {!compact && <span style={{ width: "40%", height: 3, borderRadius: 2, background: `rgb(${ink} / 0.32)` }} />}
        <span style={{ width: 16, height: compact ? 4 : 5, borderRadius: 3, background: accent }} />
      </div>

      {/* dock, drawn in the pack's own dock style */}
      <div
        style={{
          position: "absolute",
          display: "flex",
          gap: 3,
          padding: "3px 6px",
          background: elevated,
          border: `1px solid rgb(${ink} / 0.12)`,
          ...dockBox,
        }}
      >
        {dockIcons.map((c, i) => (
          <span
            key={i}
            style={{
              width: dockStyle === "slim" ? 5 : compact ? 6 : 7,
              height: dockStyle === "slim" ? 5 : compact ? 6 : 7,
              borderRadius: iconRadius,
              background: c,
            }}
          />
        ))}
      </div>
    </div>
  );
};

/** One selectable pack card. `size="small"` is the compact recommended-row card. */
export const PackCard: React.FC<{
  pack: ThemePack;
  active: boolean;
  accent: string;
  size?: "small" | "large";
  /** Show the Recommended / Light / Dock badges (large cards only). */
  meta?: boolean;
  onApply: (id: string) => void;
}> = ({ pack, active, accent, size = "large", meta = true, onApply }) => {
  const small = size === "small";
  const card = (
    <button
      type="button"
      className={`tux-pack ${active ? "active" : ""} ${small ? "small" : ""}`}
      aria-pressed={active}
      aria-label={`${pack.label} theme${pack.description ? `. ${pack.description}` : ""}`}
      onClick={() => onApply(pack.id)}
    >
      <PackPreview pack={pack} accent={accent} height={small ? 52 : 72} />
      <span className="tux-pack-name">
        <span className="tux-pack-label">{pack.label}</span>
        {active && <span className="tux-pack-dot" />}
      </span>
      {!small && pack.description && <span className="tux-pack-desc">{pack.description}</span>}
      {!small && meta && (
        <span className="tux-pack-meta">
          {pack.recommended && (
            <span className="tux-badge">
              <Star size={10} strokeWidth={2.4} /> Recommended
            </span>
          )}
          <span className="tux-badge muted">{pack.scheme === "light" ? "Light" : "Dark"}</span>
          {pack.dockStyle && <span className="tux-badge muted">{dockStyleLabel(pack.dockStyle)} dock</span>}
        </span>
      )}
    </button>
  );
  if (small || !pack.source) return card;
  const src = pack.source;
  return (
    <div className="tux-pack-wrap">
      {card}
      <div className="tux-pack-source">
        <span className="tux-pack-credit" aria-label={`From ${src.name} by ${src.author}, ${src.license}`}>
          {src.author}
        </span>
        <button
          type="button"
          className="cc-btn-ghost tux-pack-link"
          aria-label={`Open the original ${pack.label} theme by ${src.author}`}
          onClick={() => openExternal(src.url)}
        >
          Original <ExternalLink size={11} aria-hidden />
        </button>
      </div>
    </div>
  );
};

/**
 * Every theme pack (built-in and custom) with filters and search. Opened from "Browse all" under
 * the recommended row on the Theme & Look tab.
 */
export const ThemeGallery: React.FC<Props> = ({ config, onApply, windowsAccent, onClose }) => {
  const packs = allPacks();
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
    return packs
      .filter(f.test)
      .filter(
        (p) =>
          !q ||
          p.label.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          p.aliases.some((a) => a.includes(q)) ||
          (p.source ? `${p.source.name} ${p.source.author}`.toLowerCase().includes(q) : false),
      )
      .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packs.length, filter, query]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, packs.filter(f.test).length])) as Record<FilterId, number>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packs.length],
  );

  return (
    <div className="cc-card tux-gallery">
      <div className="cc-row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="cc-label">All themes</div>
          <div className="cc-desc">
            {packs.length} themes. One click changes colours, icons, folders and window frames together.
          </div>
        </div>
        {onClose && (
          <button type="button" className="cc-btn-ghost tux-icon-btn" aria-label="Close all themes" onClick={onClose}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className="tux-gallery-tools">
        <div className="tux-seg" role="tablist" aria-label="Filter themes">
          {FILTERS.filter((f) => f.id !== "custom" || counts.custom > 0).map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={filter === f.id ? "active" : ""}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="tux-num">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <label className="tux-search">
          <Search size={13} aria-hidden />
          <input
            className="cc-input"
            placeholder="Search themes"
            aria-label="Search themes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="cc-desc" style={{ padding: "16px 0", textAlign: "center" }}>
          No themes match “{query}”.
        </div>
      ) : (
        <>
          {filter === "claude" && (
            <div className="cc-desc tux-collection-head" role="note">
              Community themes from the Claude Code ecosystem · unofficial · links to originals
            </div>
          )}
          <div className="tux-pack-grid">
            {shown.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                active={config.theme.preset === pack.id}
                accent={pack.accentMode === "windows" ? (windowsAccent ?? pack.accent) : pack.accent}
                onApply={onApply}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

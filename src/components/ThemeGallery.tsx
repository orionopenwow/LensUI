import React, { useMemo, useState } from "react";
import { ExternalLink, Search, Star, X } from "lucide-react";
import { openExternal } from "../ai/open";
import type { LensConfig } from "../types/lens";
import { allPacks, lighten, type ThemePack } from "../themes/packs";
import { CLAUDE_COLLECTION } from "../themes/community/claude";
import "../themes/community/community.css";
import { dockStyleLabel } from "../dock/styles";
import { AmbientPreview, packPalette } from "../playground/ambient/controls";
import { FEEL_LABEL, FONT_LABEL, familyOf, featuredLook, featuredPacks, isFeatured } from "../themes/featured";

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

type FilterId = "all" | "featured" | "dark" | "light" | "linux" | "studio" | "living" | "claude" | "custom";
const FILTERS: { id: FilterId; label: string; test: (p: ThemePack) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "featured", label: "Featured", test: (p) => isFeatured(p.id) },
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
  const dockIcons = [accent, "#60a5fa", "#34d399", "#fbbf24", "#f472b6"];
  const iconRadius = pack.iconShape === "circle" ? 4 : pack.iconShape === "rounded" ? 2 : 2.5;

  const dockGroups =
    dockStyle === "islands" || dockStyle === "split"
      ? [dockIcons.slice(0, 3), dockIcons.slice(3)]
      : [dockIcons];

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

      {/* dock, drawn in the pack's own dock style: islands and split are two pills, studio carries labels */}
      <div className={`tux-pv-dock tux-pv-dock-${dockStyle}`}>
        {dockGroups.map((group, g) => (
          <span key={g} className="tux-pv-pill" ref={(el) => {
            el?.style.setProperty("--pv-elev", elevated);
            el?.style.setProperty("--pv-ink", ink);
            el?.style.setProperty("--pv-radius", `${dockStyle === "taskbar" ? 0 : dockStyle === "slim" ? 4 : dockStyle === "islands" ? 9 : radius}px`);
          }}>
            {group.map((c, i) => (
              <span key={i} className="tux-pv-icon" ref={(el) => {
                el?.style.setProperty("--pv-c", c);
                el?.style.setProperty("--pv-ir", `${iconRadius}px`);
              }} />
            ))}
            {dockStyle === "studio" && g === 0 && <span className="tux-pv-label" />}
          </span>
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
  /** "Like <featured look>": the family a pack under More themes is filed under. */
  family?: string;
  /** Small cards only: show the one-line description under the name (Simple mode's featured looks). */
  describe?: boolean;
  onApply: (id: string) => void;
}> = ({ pack, active, accent, size = "large", meta = true, family, describe, onApply }) => {
  const small = size === "small";
  const look = featuredLook(pack.id);
  const card = (
    <button
      type="button"
      className={`tux-pack ${active ? "active" : ""} ${small ? "small" : ""} ${small && describe && pack.description ? "has-desc" : ""}`}
      aria-pressed={active}
      aria-label={`${pack.label} theme${pack.description ? `. ${pack.description}` : ""}`}
      onClick={() => onApply(pack.id)}
    >
      <PackPreview pack={pack} accent={accent} height={small ? 52 : 72} />
      <span className="tux-pack-name">
        <span className="tux-pack-label">{pack.label}</span>
        {active && <span className="tux-pack-dot" />}
      </span>
      {(!small || describe) && pack.description && <span className="tux-pack-desc">{pack.description}</span>}
      {!small && meta && (
        <span className="tux-pack-meta">
          {look ? (
            <span className="tux-badge">
              <Star size={10} strokeWidth={2.4} /> Featured
            </span>
          ) : (
            family && <span className="tux-badge muted">Like {family}</span>
          )}
          <span className="tux-badge muted">{pack.tier === "Living" ? "Light by day" : pack.scheme === "light" ? "Light" : "Dark"}</span>
          {pack.dockStyle && <span className="tux-badge muted">{dockStyleLabel(pack.dockStyle)} dock</span>}
          {look && <span className="tux-badge muted">{FONT_LABEL[look.font]}</span>}
          {look && <span className="tux-badge muted">{FEEL_LABEL[look.feel]}</span>}
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
  // Featured looks lead (with their own Dock style and one-line character); everything else follows
  // under More themes, tagged with the featured look it resembles.
  const packs = useMemo(() => {
    const featured = featuredPacks();
    const ids = new Set(featured.map((p) => p.id));
    return [...featured, ...allPacks().filter((p) => !ids.has(p.id))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPacks().length]);
  const families = useMemo(() => new Map(packs.filter((p) => !isFeatured(p.id)).map((p) => [p.id, familyOf(p).label])), [packs]);
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
          (families.get(p.id) ?? "").toLowerCase().includes(q) ||
          (p.source ? `${p.source.name} ${p.source.author}`.toLowerCase().includes(q) : false),
      )
      .sort((a, b) => Number(isFeatured(b.id)) - Number(isFeatured(a.id)) || (isFeatured(a.id) ? 0 : TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)));
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
            {packs.length} themes: {featuredPacks().length} featured looks, each unmistakably its own, then the rest by family.
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
          {[
            { id: "featured", title: "Featured", note: "A whole look in one click: colours, Dock, corners, font, backdrop and motion.", list: shown.filter((p) => isFeatured(p.id)) },
            { id: "more", title: "More themes", note: "Variations, filed under the featured look each one resembles.", list: shown.filter((p) => !isFeatured(p.id)) },
          ]
            .filter((sec) => sec.list.length > 0)
            .map((sec) => (
              <section key={sec.id} className="tux-gallery-sec" aria-label={sec.title} data-section={sec.id}>
                <div className="tux-gallery-sec-head">
                  <span className="tux-h3">{sec.title}</span>
                  <span className="tux-num">{sec.list.length}</span>
                  <span className="cc-desc">{sec.note}</span>
                </div>
                <div className="tux-pack-grid">
                  {sec.list.map((pack) => (
                    <PackCard
                      key={pack.id}
                      pack={pack}
                      family={families.get(pack.id)}
                      active={config.theme.preset === pack.id}
                      accent={pack.accentMode === "windows" ? (windowsAccent ?? pack.accent) : pack.accent}
                      onApply={onApply}
                    />
                  ))}
                </div>
              </section>
            ))}
        </>
      )}
    </div>
  );
};

import React, { useMemo } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { LensConfig } from "../types/lens";
import {
  DESKTOP_RULES,
  newGroupId,
  readDesktopGroups,
  type DesktopGroup,
  type DesktopGroupsConfig,
  type DesktopRule,
} from "../utils/desktopGroups";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

type ConfigWithGroups = LensConfig & { desktopGroups?: unknown };

const COLORS = ["#60A5FA", "#38BDF8", "#A78BFA", "#34D399", "#FBBF24", "#FB7185", "#A1A1AA"];

/** Control Center card for desktop groups. Groups are a view: files never move. */
export const DesktopGroupsCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const cfg = useMemo(() => readDesktopGroups((config as ConfigWithGroups).desktopGroups), [config]);

  const save = (next: DesktopGroupsConfig) =>
    onUpdateConfig({ ...(config as ConfigWithGroups), desktopGroups: next } as LensConfig);

  const patchGroup = (id: string, patch: Partial<DesktopGroup>) =>
    save({ ...cfg, groups: cfg.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= cfg.groups.length) return;
    const groups = [...cfg.groups];
    [groups[idx], groups[j]] = [groups[j], groups[idx]];
    save({ ...cfg, groups });
  };

  const toggleRule = (g: DesktopGroup, rule: DesktopRule) =>
    patchGroup(g.id, { rules: g.rules.includes(rule) ? g.rules.filter((r) => r !== rule) : [...g.rules, rule] });

  return (
    <div className="cc-card">
      <div className="cc-label">Desktop groups</div>
      <div className="cc-desc">
        Named sections in the Desktop drawer. They only change how items are shown: nothing on your
        desktop is moved, renamed or deleted.
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Sort new items automatically</div>
          <div className="cc-desc">Each item joins the first group whose types match, unless you placed it by hand.</div>
        </div>
        <button data-weight="light"
          type="button"
          className={`cc-toggle ${cfg.autoSort ? "on" : ""}`}
          aria-label="Sort automatically"
          onClick={() => save({ ...cfg, autoSort: !cfg.autoSort })}
        />
      </div>
      <div className="cc-row">
        <div>
          <div className="cc-label">Show "Everything else"</div>
          <div className="cc-desc">A section for items no group claims.</div>
        </div>
        <button data-weight="light"
          type="button"
          className={`cc-toggle ${cfg.showUnsorted ? "on" : ""}`}
          aria-label="Show everything else"
          onClick={() => save({ ...cfg, showUnsorted: !cfg.showUnsorted })}
        />
      </div>

      {cfg.groups.map((g, idx) => (
        <div
          key={g.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 10,
            borderRadius: 10,
            border: "1px solid var(--lens-border)",
            background: "rgb(var(--lens-ink) / 0.025)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {COLORS.map((c) => (
                <button data-weight="medium"
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={g.color.toUpperCase() === c}
                  onClick={() => patchGroup(g.id, { color: c })}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: c,
                    cursor: "pointer",
                    outline: g.color.toUpperCase() === c ? "2px solid var(--lens-fg)" : "none",
                    outlineOffset: 1,
                  }}
                />
              ))}
            </div>
            <input
              className="cc-input"
              style={{ flex: 1, minWidth: 0 }}
              value={g.name}
              maxLength={40}
              aria-label="Group name"
              onChange={(e) => patchGroup(g.id, { name: e.target.value })}
            />
            <button data-weight="medium" type="button" className="cc-btn-ghost" aria-label="Move up" disabled={idx === 0} onClick={() => move(idx, -1)}>
              <ArrowUp size={12} />
            </button>
            <button data-weight="medium"
              type="button"
              className="cc-btn-ghost"
              aria-label="Move down"
              disabled={idx === cfg.groups.length - 1}
              onClick={() => move(idx, 1)}
            >
              <ArrowDown size={12} />
            </button>
            <button data-weight="medium"
              type="button"
              className="cc-btn-ghost"
              aria-label="Remove group"
              onClick={() => save({ ...cfg, groups: cfg.groups.filter((x) => x.id !== g.id) })}
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="cc-chip-grid">
            {DESKTOP_RULES.map((r) => (
              <button data-weight="light"
                key={r.id}
                type="button"
                className={`cc-chip ${g.rules.includes(r.id) ? "active" : ""}`}
                onClick={() => toggleRule(g, r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          {g.paths.length > 0 && (
            <div className="cc-desc" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>
                {g.paths.length} item{g.paths.length === 1 ? "" : "s"} placed here by hand.
              </span>
              <button data-weight="medium" type="button" className="cc-btn-ghost" onClick={() => patchGroup(g.id, { paths: [] })}>
                Release
              </button>
            </div>
          )}
        </div>
      ))}

      <button data-weight="medium"
        type="button"
        className="cc-btn"
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6 }}
        disabled={cfg.groups.length >= 24}
        onClick={() =>
          save({
            ...cfg,
            groups: [
              ...cfg.groups,
              { id: newGroupId(), name: "New group", color: COLORS[cfg.groups.length % COLORS.length], collapsed: false, rules: [], paths: [] },
            ],
          })
        }
      >
        <Plus size={12} /> Add Group
      </button>
    </div>
  );
};

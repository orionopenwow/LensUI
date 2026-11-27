import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Palette,
  Music,
  LayoutGrid,
  PanelBottom,
  Layers,
  Monitor,
  Sparkles,
  Sun,
  Volume2,
  Wifi,
  Zap,
  AppWindow,
  HardDrive,
  Bell,
  Shield,
  RefreshCw,
  Clock,
  Accessibility,
  Gamepad2,
  Activity,
  MessageSquare,
  FlaskConical,
  Search,
  Power,
  ExternalLink,
  X,
  SlidersHorizontal,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { GROUPS, PAGES, pagesInGroup, type PageId } from "./registry";
import { buildIndex, search, type SearchEntry } from "./search";
import { preloadSettingsPage } from "./pages";
import { ModePill } from "./simple/ModePill";
import { inSimpleNav, isAdvancedHit, morePages, type SettingsMode } from "./simple/mode";
import { oops } from "../ui/oops";

const ICONS: Record<string, React.FC<{ size?: number; strokeWidth?: number; color?: string; "aria-hidden"?: boolean }>> = {
  quick: SlidersHorizontal,
  palette: Palette,
  music: Music,
  grid: LayoutGrid,
  dock: PanelBottom,
  layers: Layers,
  monitor: Monitor,
  sparkles: Sparkles,
  sun: Sun,
  volume: Volume2,
  wifi: Wifi,
  zap: Zap,
  appwindow: AppWindow,
  harddrive: HardDrive,
  bell: Bell,
  shield: Shield,
  refresh: RefreshCw,
  clock: Clock,
  accessibility: Accessibility,
  gamepad: Gamepad2,
  activity: Activity,
  message: MessageSquare,
  flask: FlaskConical,
};

export const PageIcon: React.FC<{ id: PageId; size?: number }> = ({ id, size = 15 }) => {
  const p = PAGES.find((x) => x.id === id);
  const I = (p && ICONS[p.icon]) || Monitor;
  return <I size={size} strokeWidth={2.1} color={p?.color} aria-hidden />;
};

export const SettingsNav: React.FC<{
  page: PageId;
  /** Simple or Advanced (docs/SETTINGS_SIMPLE.md). Advanced when omitted. */
  mode?: SettingsMode;
  onMode?: (m: SettingsMode) => void;
  onNavigate: (page: PageId, section?: string) => void;
  onWizard: () => void;
}> = ({ page, mode = "advanced", onMode, onNavigate, onWizard }) => {
  const [showMore, setShowMore] = useState(false);
  const simple = mode === "simple";
  const folded = simple ? morePages().length : 0;
  // A folded page that is open (from search or a deep link) shows in the list too.
  const visible = (id: PageId) => !simple || inSimpleNav(id) || showMore || id === page;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const index = useMemo(() => buildIndex(), []);
  const results = useMemo(() => (q.trim() ? search(q, index, 9) : []), [q, index]);

  // Ctrl+F or "/" focuses search (unless typing in a field already).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.ctrlKey && e.key.toLowerCase() === "f") || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setSel(0), [q]);

  const open = (r: SearchEntry) => {
    if (r.kind === "windows" && r.uri) {
      invoke("open_windows_setting_cmd", { uri: r.uri }).catch(oops(`open ${r.label} in Windows Settings`));
    } else {
      onNavigate(r.page, r.section);
    }
    setQ("");
  };

  // Arrow keys move between sidebar items (roving focus).
  const onNavKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const found = navRef.current?.querySelectorAll<HTMLButtonElement>(".cc-nav-btn[data-page]");
    const items: HTMLButtonElement[] = found ? Array.from(found) : [];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <aside className="cc-sidebar sh-sidebar" aria-label="Settings">
      {onMode && <ModePill mode={mode} onChange={onMode} />}
      <div className="sh-search" role="search">
        <Search size={13} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search settings"
          aria-label="Search settings (Ctrl+F)"
          aria-controls={q.trim() ? "sh-search-results" : undefined}
          aria-activedescendant={results[sel] ? `sh-res-${sel}` : undefined}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(results.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter" && results[sel]) {
              e.preventDefault();
              open(results[sel]);
            } else if (e.key === "Escape" && q) {
              e.stopPropagation();
              setQ("");
            }
          }}
        />
        {q && (
          <button data-weight="medium" type="button" className="sh-search-clear" aria-label="Clear search" onClick={() => setQ("")}>
            <X size={12} aria-hidden />
          </button>
        )}
      </div>

      {q.trim() ? (
        <div className="sh-results" id="sh-search-results" role="listbox" aria-label="Search results">
          {results.length === 0 && <div className="sh-results-empty">No matches. Try "bluetooth" or "dock style".</div>}
          {results.map((r, i) => (
            <button data-weight="light"
              key={`${r.kind}-${r.page}-${r.section ?? r.uri ?? ""}-${r.label}`}
              id={`sh-res-${i}`}
              type="button"
              role="option"
              aria-selected={i === sel}
              className={`sh-result ${i === sel ? "sel" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => open(r)}
            >
              <PageIcon id={r.page} size={13} />
              <span className="sh-result-text">
                <span className="sh-result-label">{r.label}</span>
                <span className="sh-result-crumb">{r.breadcrumb}</span>
              </span>
              {r.kind !== "windows" && isAdvancedHit(mode, r.page, r.section) && <span className="ss-adv-tag">Advanced</span>}
              {r.kind === "windows" && <ExternalLink size={11} aria-label="Opens Windows Settings" />}
            </button>
          ))}
        </div>
      ) : (
        <nav ref={navRef} className="sh-nav" onKeyDown={onNavKey}>
          {GROUPS.filter((g) => pagesInGroup(g.id).some((p) => visible(p.id))).map((g) => (
            <div key={g.id} className="cc-nav-group" role="group" aria-label={g.label}>
              <div className="cc-nav-group-label">{g.label}</div>
              {pagesInGroup(g.id).filter((p) => visible(p.id)).map((p) => (
                <button data-weight="light"
                  key={p.id}
                  type="button"
                  data-page={p.id}
                  className={`cc-nav-btn ${page === p.id ? "active" : ""} ${simple && !inSimpleNav(p.id) ? "ss-nav-extra" : ""}`}
                  aria-current={page === p.id ? "page" : undefined}
                  onClick={() => onNavigate(p.id)}
                  onPointerEnter={() => preloadSettingsPage(p.id)}
                  onFocus={() => preloadSettingsPage(p.id)}
                >
                  <PageIcon id={p.id} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          ))}
          {simple && folded > 0 && (
            <button data-weight="medium" type="button" className="ss-nav-more" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
              <MoreHorizontal size={15} aria-hidden />
              <span>{showMore ? "Fewer pages" : `More (${folded} pages)`}</span>
              <ChevronDown size={13} className="chev" aria-hidden />
            </button>
          )}
        </nav>
      )}

      <div className="sh-nav-foot">
        <button data-weight="light" type="button" className="cc-nav-btn" onClick={onWizard}>
          <Sparkles size={15} strokeWidth={2.1} color="#F472B6" aria-hidden />
          <span>Setup Wizard</span>
        </button>
        <button data-weight="light" type="button" className="cc-nav-btn sh-quit" onClick={() => invoke("quit_lens").catch(oops("quit Lens"))}>
          <Power size={15} strokeWidth={2.1} aria-hidden />
          <span>Quit Lens</span>
        </button>
      </div>
    </aside>
  );
};

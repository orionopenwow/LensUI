// Lens Apps: free and open-source tools with real thumbnails and App Store-style one-click Get.
// Mounted as Settings › Apps (docs/LENS_APPS.md §1) and as the standalone `apps` surface.
//
// Two views: Discover (the catalogue) and Library (what's on this PC, updates, "Update all").
// Keyboard: "/" focuses search · Enter on a card opens details · Ctrl+Enter on a card is Get ·
// Esc closes a popover, then goes back · arrows move between cards in a row and between the tabs.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Skeleton } from "../ui";
import { loadCatalog, loadSettings } from "./api";
import { Detail } from "./Detail";
import { DownloadTray } from "./DownloadTray";
import { Library } from "./Library";
import { licenceInfo } from "./licence";
import { Pill, RollingCount, Section } from "./pieces";
import { filterApps, homeSections } from "./search";
import type { AppsSettings, Catalog, CatalogApp } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { useAppsController, type AppsDemo, type Ctl } from "./useAppsController";
import { AppIcon, AppThumb } from "./visuals";
import "./apps.css";
import "./library.css";

export type AppsView = "discover" | "library";

export interface LensAppsProps {
  initialApp?: string;
  initialQuery?: string;
  initialView?: AppsView;
  /** Screenshot/test hooks: preset state instead of talking to the backend. */
  demo?: AppsDemo;
}

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

function Row({ children, label }: { children: ReactNode; label: string }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-card]")];
    const i = cards.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const nextCard = cards[Math.max(0, Math.min(cards.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))];
    nextCard?.focus();
    nextCard?.scrollIntoView({ block: "nearest", inline: "nearest" });
    e.preventDefault();
  };
  return (
    <div className="la-rail" role="list" aria-label={label} onKeyDown={onKey}>
      {children}
    </div>
  );
}

function AppCard({ app, ctl, live, hero, hovered, onOpen }: { app: CatalogApp; ctl: Ctl; live: boolean; hero?: boolean; hovered?: boolean; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.key !== "Enter") return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) ctl.get(app);
    else onOpen();
  };
  const isInstalled = !!ctl.installed[app.id];
  return (
    <div
      className={`la-card${hero ? " la-card-hero" : ""}${ctl.popoverProps(app) ? " la-card-pop" : ""}`}
      role="listitem"
      tabIndex={0}
      data-card
      data-app-id={app.id}
      data-weight="heavy"
      aria-label={`${app.name}. ${app.pitch}`}
      onClick={onOpen}
      onKeyDown={onKey}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <AppThumb app={app} live={live} hover={hover || hovered} installed={isInstalled} />
      <div className="la-card-body">
        <AppIcon app={app} size={hero ? 40 : 34} installed={isInstalled} live={live} />
        <div className="la-card-text">
          <span className="la-card-name">{app.name}</span>
          <span className="la-card-pitch">{hero && app.replaces.length ? `Instead of ${app.replaces[0]} · ${licenceInfo(app).label}` : app.pitch}</span>
        </div>
        <Pill app={app} ctl={ctl} onDetails={onOpen} />
      </div>
    </div>
  );
}

function SuiteRow({ launcher, apps, ctl, live, onOpen }: { launcher: CatalogApp | null; apps: CatalogApp[]; ctl: Ctl; live: boolean; onOpen: (id: string) => void }) {
  if (!launcher && !apps.length) return null;
  return (
    <div className="la-suite">
      {launcher && (
        <div
          className="la-suite-lead"
          role="button"
          tabIndex={0}
          data-app-id={launcher.id}
          data-weight="heavy"
          aria-label={`${launcher.name}: one launcher installs and updates all ${apps.length} apps`}
          onClick={() => onOpen(launcher.id)}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onOpen(launcher.id);
            }
          }}
        >
          <AppIcon app={launcher} size={44} installed={!!ctl.installed[launcher.id]} live={live} />
          <div className="la-card-text">
            <span className="la-card-name">{launcher.name}</span>
            <span className="la-card-pitch">One launcher installs and updates all {apps.length} apps</span>
          </div>
          <Pill app={launcher} ctl={ctl} onDetails={() => onOpen(launcher.id)} />
        </div>
      )}
      <div className="la-suite-icons" role="list" aria-label="ArtCraft suite apps">
        {apps.map((a) => (
          <button key={a.id} className="la-suite-app" role="listitem" data-app-id={a.id} data-weight="medium" onClick={() => onOpen(a.id)} aria-label={`${a.name}: ${a.pitch}`}>
            <AppIcon app={a} size={40} installed={!!ctl.installed[a.id]} live={live} />
            <span className="la-suite-name">{a.name.replace(/Craft$/, "")}</span>
            <span className="la-suite-sub">{a.replaces[0] ?? ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Discover | Library, with an indicator that slides between them (transform only). */
function ViewTabs({ view, updates, onView }: { view: AppsView; updates: number; onView: (v: AppsView) => void }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const to: AppsView = view === "discover" ? "library" : "discover";
    onView(to);
    e.currentTarget.querySelector<HTMLElement>(`[data-view="${to}"]`)?.focus();
  };
  return (
    <div className="la-tabs" role="tablist" aria-label="Lens Apps" data-view={view} onKeyDown={onKey}>
      <span className="la-tabs-ind" aria-hidden="true" />
      <button role="tab" className="la-tab" data-view="discover" data-weight="medium" aria-selected={view === "discover"} tabIndex={view === "discover" ? 0 : -1} onClick={() => onView("discover")}>
        Discover
      </button>
      <button role="tab" className="la-tab" data-view="library" data-weight="medium" aria-selected={view === "library"} tabIndex={view === "library" ? 0 : -1} onClick={() => onView("library")}>
        Library
        {updates > 0 && (
          <span className="la-tab-badge">
            <RollingCount value={updates} label={`${updates} ${updates === 1 ? "update" : "updates"}`} />
          </span>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

export function LensApps({ initialApp, initialQuery = "", initialView, demo }: LensAppsProps) {
  const [catalog, setCatalog] = useState<Catalog | null>(demo?.catalog ?? null);
  const [settings, setSettings] = useState<AppsSettings>(DEFAULT_SETTINGS);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(demo?.category ?? null);
  const [openSourceOnly, setOpenSourceOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialApp ?? null);
  const [view, setView] = useState<AppsView>(demo?.view ?? initialView ?? "discover");
  // Which way the content last moved: forward comes from the right, back from the left.
  const [swap, setSwap] = useState<"fwd" | "back" | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  // The card or row that opened the detail page: focus goes back to it.
  const cameFrom = useRef<string | null>(null);
  const ctl = useAppsController(catalog, demo);

  useEffect(() => {
    loadSettings().then(setSettings);
    if (demo?.catalog) return;
    loadCatalog().then(setCatalog);
  }, [demo]);

  const show = useCallback(
    (to: AppsView) => {
      if (to === view) return;
      setSwap(to === "library" ? "fwd" : "back");
      setView(to);
    },
    [view],
  );

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName) && !selected) {
        if (view !== "discover") show("discover");
        // The field exists on the next frame when the view just changed.
        requestAnimationFrame(() => searchRef.current?.focus());
        e.preventDefault();
      }
    },
    [selected, view, show],
  );

  const results = useMemo(
    () => (catalog ? filterApps(catalog.apps, { query, category, openSourceOnly, showNonOpenSource: settings.showNonOpenSource }) : []),
    [catalog, query, category, openSourceOnly, settings.showNonOpenSource],
  );
  const home = useMemo(() => (catalog ? homeSections(catalog, settings.showNonOpenSource) : null), [catalog, settings.showNonOpenSource]);

  // Back from a detail page: focus returns to what opened it, so the keyboard never loses its place.
  useEffect(() => {
    if (selected || !cameFrom.current) return;
    const id = cameFrom.current;
    cameFrom.current = null;
    const el = topRef.current?.querySelector<HTMLElement>(`[data-app-id="${CSS.escape(id)}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const back = useCallback(() => {
    setSwap("back");
    setSelected(null);
  }, []);

  if (!catalog || !home) return <div className="la la-loading"><Skeleton label="Loading apps…" shape="grid" rows={3} /></div>;
  const live = settings.liveThumbnails;
  const app = selected ? catalog.apps.find((a) => a.id === selected) : null;
  const browsing = !!query.trim() || !!category || openSourceOnly;
  const open = (id: string) => {
    const root = topRef.current;
    const from = root?.querySelector<HTMLElement>(`[data-app-id="${CSS.escape(id)}"]`);
    if (root && from && !selected) {
      const r = root.getBoundingClientRect();
      const c = from.getBoundingClientRect();
      // Grow from the card, measured against what is on screen now (the page scrolls to the top).
      setOrigin(r.width > 0 ? { x: Math.max(0, Math.min(1, (c.left + c.width / 2 - r.left) / r.width)), y: 0 } : null);
      cameFrom.current = id;
    } else if (!selected) setOrigin(null);
    setSwap("fwd");
    setSelected(id);
    topRef.current?.scrollIntoView({ block: "start" });
  };
  const card = (a: CatalogApp, hero = false) => <AppCard key={a.id} app={a} ctl={ctl} live={live} hero={hero} hovered={demo?.hover === a.id} onOpen={() => open(a.id)} />;
  const swapClass = swap ? ` la-swap la-swap-${swap}` : "";

  return (
    <div className="la" onKeyDown={onKey} ref={topRef}>
      {app ? (
        <Detail
          key={app.id}
          app={app}
          catalog={catalog}
          ctl={ctl}
          live={live}
          origin={origin}
          shot={demo?.shot}
          backLabel={view === "library" ? "Library" : "All apps"}
          onBack={back}
          onOpen={open}
        />
      ) : (
        <>
          <div className="la-head">
            <div className="la-head-text">
              <div className="la-title">Apps</div>
              <div className="la-sub">
                Free and open-source tools, each with its maker and licence.{" "}
                <span className="la-mono la-muted">
                  {catalog.apps.length} apps · {catalog.updated}
                </span>
              </div>
            </div>
            <ViewTabs view={view} updates={ctl.library.updateCount} onView={show} />
          </div>
          {view === "library" ? (
            <div key="library" className={`la-view${swapClass}`} role="tabpanel" aria-label="Library">
              <Library ctl={ctl} live={live} total={catalog.apps.length} onOpen={open} onDiscover={() => show("discover")} />
            </div>
          ) : (
            <div key="discover" className={`la-view${swapClass}`} role="tabpanel" aria-label="Discover">
              <div className="la-searchbar">
                <input
                  ref={searchRef}
                  className="la-search"
                  placeholder={`Search ${catalog.apps.length} apps, or what they replace…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && query && (e.stopPropagation(), setQuery(""))}
                  aria-label="Search apps"
                />
                <kbd className="la-search-kbd">/</kbd>
              </div>
              <div className="la-filters" role="toolbar" aria-label="Filter apps">
                <button className={`la-filter${!category ? " active" : ""}`} data-weight="light" onClick={() => setCategory(null)} aria-pressed={!category}>
                  All
                </button>
                {catalog.categories.map((c) => (
                  <button key={c.id} className={`la-filter${category === c.id ? " active" : ""}`} data-weight="light" onClick={() => setCategory(category === c.id ? null : c.id)} aria-pressed={category === c.id}>
                    {c.title}
                  </button>
                ))}
                <label className="la-filter la-filter-toggle" data-weight="light">
                  <input type="checkbox" checked={openSourceOnly} onChange={(e) => setOpenSourceOnly(e.target.checked)} /> Open source only
                </label>
              </div>
              {browsing ? (
                <div className="la-grid" role="list" aria-label="Results">
                  {results.length === 0 && (
                    <div className="la-empty" role="status">
                      Nothing in the catalogue matches that. Try what you want to do, like "edit video" or "slides".
                    </div>
                  )}
                  {results.map((a) => card(a))}
                </div>
              ) : (
                <>
                  <Section title="Open-source rewrites" subtitle="New open alternatives to the big paid apps">
                    <Row label="Open-source rewrites">{home.hero.map((a) => card(a, true))}</Row>
                  </Section>
                  <Section title="The ArtCraft suite" subtitle="Native creative and office apps, one launcher" count={home.suite.apps.length + (home.suite.launcher ? 1 : 0)}>
                    <SuiteRow launcher={home.suite.launcher} apps={home.suite.apps} ctl={ctl} live={live} onOpen={open} />
                  </Section>
                  <Section title="AI on your PC" subtitle="Local models, generation and transcription" count={home.ai.length}>
                    <Row label="AI on your PC">{home.ai.map((a) => card(a))}</Row>
                  </Section>
                  <Section title="Essentials" subtitle="Free tools almost everyone wants" count={home.essentials.length}>
                    <Row label="Essentials">{home.essentials.map((a) => card(a))}</Row>
                  </Section>
                  <Section title="Browse by category">
                    <div className="la-cats">
                      {home.categories.map((c) => (
                        <button key={c.id} className="la-cat" data-weight="heavy" onClick={() => setCategory(c.id)}>
                          <span className="la-cat-icons">
                            {c.preview.map((a) => (
                              <AppIcon key={a.id} app={a} size={26} live={live} />
                            ))}
                          </span>
                          <span className="la-cat-title">{c.title}</span>
                          <span className="la-mono la-muted">{c.count}</span>
                        </button>
                      ))}
                    </div>
                  </Section>
                </>
              )}
            </div>
          )}
        </>
      )}
      <DownloadTray
        queue={ctl.queue}
        jobs={ctl.jobs}
        apps={ctl.byId}
        recipes={ctl.recipes}
        onCancel={ctl.cancelId}
        onRun={ctl.runId}
        onDismiss={ctl.dismiss}
        onApplySetup={ctl.applySetup}
        onSkipSetup={ctl.skipSetup}
      />
    </div>
  );
}

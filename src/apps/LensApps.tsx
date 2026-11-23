// Lens Apps: free and open-source tools with real thumbnails and App Store-style one-click Get.
// Mounted as Settings › Apps (docs/LENS_APPS.md §1) and as the standalone `apps` surface.
//
// Keyboard: "/" focuses search · Enter on a card opens details · Ctrl+Enter on a card is Get ·
// Esc closes a popover, then goes back · arrows move between cards in a row.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Skeleton } from "../ui";
import { ActionPill, pillFor, type PillKind, type PopoverMode, type PopoverProps } from "./ActionPill";
import {
  applyRecipe,
  cancelJob,
  discardRelease,
  installedApps,
  loadCatalog,
  loadSettings,
  onProgress,
  openApp,
  openLink,
  prepareRelease,
  recipePreview,
  revealApp,
  revertRecipe,
  runApp,
  runRelease,
  showApp,
} from "./api";
import { DownloadTray } from "./DownloadTray";
import { reduceJobs, type Jobs } from "./jobs";
import { emptyQueue, itemFor, nextToStart, reduceQueue, type QueueOp, type QueueState } from "./queue";
import { filterApps, homeSections } from "./search";
import type { AppShow, AppsSettings, Catalog, CatalogApp, InstalledInfo, PreparedRelease, RecipeStepView } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { AppIcon, AppThumb } from "./visuals";
import "./apps.css";
import { announce as presenceAnnounce } from "../presence/api";

const STATUS_LABEL: Record<string, string> = { stable: "Stable", beta: "Beta", alpha: "Early alpha" };
const METHOD_LABEL: Record<string, string> = { winget: "winget", githubRelease: "GitHub release, verified", via: "Craft Launcher", officialSite: "Official site", web: "Web app" };

export interface LensAppsProps {
  initialApp?: string;
  initialQuery?: string;
  /** Screenshot/test hooks: preset state instead of talking to the backend. */
  demo?: {
    catalog?: Catalog;
    installed?: Record<string, InstalledInfo>;
    queue?: QueueState;
    jobs?: Jobs;
    prepared?: Record<string, PreparedRelease>;
    shows?: Record<string, AppShow>;
    recipes?: Record<string, RecipeStepView[]>;
    popover?: { appId: string; mode: PopoverMode };
    hover?: string;
    category?: string;
  };
}

// ---------------------------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------------------------

function useAppsController(catalog: Catalog | null, demo: LensAppsProps["demo"]) {
  const [installed, setInstalled] = useState<Record<string, InstalledInfo>>(demo?.installed ?? {});
  const [queue, dispatch] = useReducer(reduceQueue, demo?.queue ?? emptyQueue);
  const [jobs, setJobs] = useState<Jobs>(demo?.jobs ?? {});
  const [prepared, setPrepared] = useState<Record<string, PreparedRelease>>(demo?.prepared ?? {});
  const [shows, setShows] = useState<Record<string, AppShow | { error: string }>>(demo?.shows ?? {});
  const [recipes, setRecipes] = useState<Record<string, RecipeStepView[]>>(demo?.recipes ?? {});
  const [popover, setPopover] = useState<{ appId: string; mode: PopoverMode } | null>(demo?.popover ?? null);
  const byId = useMemo<Record<string, CatalogApp>>(() => Object.fromEntries((catalog?.apps ?? []).map((a) => [a.id, a])), [catalog]);

  useEffect(() => {
    if (demo) return;
    installedApps().then(setInstalled);
  }, [demo]);

  // Progress events → jobs; job end → queue.
  useEffect(() => {
    if (demo) return;
    let un: (() => void) | undefined;
    onProgress((e) => {
      setJobs((j) => reduceJobs(j, e));
      if (e.op === "download") return; // release downloads finish through apps_release_prepare
      if (e.stage === "done" || e.stage === "failed") {
        dispatch({ type: "finished", appId: e.appId, ok: e.stage === "done", message: e.message });
        installedApps().then(setInstalled);
      }
    }).then((u) => (un = u));
    return () => un?.();
  }, [demo]);

  // Queue runner: start the next queued item when nothing is running.
  const next = nextToStart(queue);
  useEffect(() => {
    if (!next || demo || !catalog) return;
    const app = byId[next.appId];
    if (!app) return;
    dispatch({ type: "started", appId: next.appId });
    // "Lens at work": ring the app's card with "Installing Obsidian" (Subtle by default).
    const verb = next.op === "uninstall" ? "Removing" : next.op === "upgrade" ? "Updating" : "Installing";
    void presenceAnnounce("apps", { kind: "click", label: `${verb} ${app.name}` }, document.querySelector(`[data-app-id="${CSS.escape(app.id)}"]`));
    if (app.install.method === "githubRelease") {
      prepareRelease(app.id).then(
        (p) => {
          setPrepared((m) => ({ ...m, [app.id]: p }));
          dispatch({ type: "verified", appId: app.id, token: p.token });
        },
        (e) => dispatch({ type: "finished", appId: app.id, ok: false, message: String(e) }),
      );
    } else {
      runApp(app.id, next.op).then(
        (jobId) => dispatch({ type: "started", appId: app.id, jobId }),
        (e) => dispatch({ type: "finished", appId: app.id, ok: false, message: String(e) }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.appId, next?.status, demo, catalog, byId]);

  // After a successful install, fetch the setup checklist for the tray.
  useEffect(() => {
    if (demo) return;
    for (const it of queue.items) {
      if (it.setupPending && !recipes[it.appId]) {
        recipePreview(it.appId).then(
          (r) => (r.length ? setRecipes((m) => ({ ...m, [it.appId]: r })) : dispatch({ type: "setupDone", appId: it.appId })),
          () => dispatch({ type: "setupDone", appId: it.appId }),
        );
      }
    }
  }, [queue, recipes, demo]);

  const viaOf = useCallback((app: CatalogApp): CatalogApp | null => (app.install.method === "via" ? byId[app.install.via] ?? null : null), [byId]);

  const openPopover = useCallback(
    (app: CatalogApp, mode: PopoverMode) => {
      const target = viaOf(app) ?? app;
      setPopover({ appId: app.id, mode });
      if (target.install.method === "winget" && !shows[target.id] && !demo) {
        showApp(target.id).then(
          (s) => setShows((m) => ({ ...m, [target.id]: s })),
          (e) => setShows((m) => ({ ...m, [target.id]: { error: String(e) } })),
        );
      }
    },
    [shows, demo, viaOf],
  );

  const primary = useCallback(
    (app: CatalogApp, kind: PillKind) => {
      switch (kind) {
        case "open":
          if (app.install.method === "web" && !installed[app.id]) openApp(app.id).catch(() => openLink(app.id, (app.install as { url: string }).url));
          else openApp(app.id).catch(() => undefined);
          return;
        case "getExternal":
          openLink(app.id, (app.install as { url: string }).url).catch(() => undefined);
          return;
        case "update":
          return openPopover(app, "update");
        case "run":
          return openPopover(app, "run");
        default:
          return openPopover(app, "get");
      }
    },
    [installed, openPopover],
  );

  const confirm = useCallback(() => {
    if (!popover) return;
    const app = byId[popover.appId];
    const target = viaOf(app) ?? app;
    setPopover(null);
    if (popover.mode === "run") {
      const it = itemFor(queue, target.id);
      if (it?.token)
        runRelease(it.token).then(
          () => dispatch({ type: "finished", appId: target.id, ok: true }),
          (e) => dispatch({ type: "finished", appId: target.id, ok: false, message: String(e) }),
        );
      return;
    }
    const op: QueueOp = popover.mode === "update" ? "upgrade" : popover.mode === "uninstall" ? "uninstall" : "install";
    dispatch({ type: "enqueue", appId: target.id, op });
  }, [popover, byId, queue, viaOf]);

  const cancelId = useCallback(
    (appId: string) => {
      const it = itemFor(queue, appId);
      if (it?.jobId) cancelJob(it.jobId);
      if (it?.token) discardRelease(it.token);
      dispatch({ type: "cancel", appId });
    },
    [queue],
  );

  const targetOf = (app: CatalogApp) => viaOf(app) ?? app;

  const popoverProps = (app: CatalogApp): PopoverProps | null => {
    if (!popover || popover.appId !== app.id) return null;
    const via = viaOf(app);
    const target = via ?? app;
    const s = shows[target.id];
    return {
      app,
      mode: popover.mode,
      via,
      show: s && !("error" in s) ? s : null,
      showError: s && "error" in s ? s.error : null,
      prepared: prepared[target.id] ?? null,
      onConfirm: confirm,
      onClose: () => setPopover(null),
    };
  };

  const pill = (app: CatalogApp) => pillFor(app, installed[app.id], itemFor(queue, targetOf(app).id));

  return {
    installed,
    queue,
    jobs,
    recipes,
    byId,
    popoverOpen: !!popover,
    pill,
    item: (app: CatalogApp) => itemFor(queue, targetOf(app).id),
    job: (app: CatalogApp) => jobs[targetOf(app).id] ?? null,
    primary,
    cancel: (app: CatalogApp) => cancelId(targetOf(app).id),
    cancelId,
    get: (app: CatalogApp) => primary(app, pill(app)),
    uninstall: (app: CatalogApp) => openPopover(app, "uninstall"),
    popoverProps,
    runId: (appId: string) => byId[appId] && openPopover(byId[appId], "run"),
    dismiss: (appId: string) => dispatch({ type: "dismiss", appId }),
    applySetup: (appId: string, chosen: number[]) => {
      applyRecipe(appId, chosen).catch(() => undefined);
      dispatch({ type: "setupDone", appId });
    },
    skipSetup: (appId: string) => dispatch({ type: "setupDone", appId }),
  };
}

type Ctl = ReturnType<typeof useAppsController>;

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

function Pill({ app, ctl, onDetails, compact }: { app: CatalogApp; ctl: Ctl; onDetails?: () => void; compact?: boolean }) {
  const kind = ctl.pill(app);
  return (
    <ActionPill
      app={app}
      kind={kind}
      job={ctl.job(app)}
      item={ctl.item(app)}
      installed={!!ctl.installed[app.id]}
      popover={ctl.popoverProps(app)}
      onPrimary={() => ctl.primary(app, kind)}
      onCancel={() => ctl.cancel(app)}
      onDetails={onDetails}
      onUninstall={() => ctl.uninstall(app)}
      onReveal={() => revealApp(app.id).catch(() => undefined)}
      compact={compact}
    />
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
          <span className="la-card-pitch">{hero && app.replaces.length ? `Instead of ${app.replaces[0]} · ${app.license}` : app.pitch}</span>
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
        <div className="la-suite-lead" onClick={() => onOpen(launcher.id)}>
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
          <button key={a.id} className="la-suite-app" role="listitem" onClick={() => onOpen(a.id)} aria-label={`${a.name}: ${a.pitch}`}>
            <AppIcon app={a} size={40} installed={!!ctl.installed[a.id]} live={live} />
            <span className="la-suite-name">{a.name.replace(/Craft$/, "")}</span>
            <span className="la-suite-sub">{a.replaces[0] ?? ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, subtitle, count, children }: { title: string; subtitle?: string; count?: number; children: ReactNode }) {
  return (
    <section className="la-block">
      <div className="la-block-head">
        <span className="la-block-title">{title}</span>
        {subtitle && <span className="la-block-sub">{subtitle}</span>}
        {count != null && <span className="la-mono la-muted">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function Detail({ app, catalog, ctl, live, onBack, onOpen }: { app: CatalogApp; catalog: Catalog; ctl: Ctl; live: boolean; onBack: () => void; onOpen: (id: string) => void }) {
  const inst = ctl.installed[app.id];
  const link = (url: string) => openLink(app.id, url).catch(() => window.open(url, "_blank", "noopener"));
  const howLens: string[] = [];
  if (app.integration.fileTypes.length) howLens.push(`"Open in ${app.name}" for ${app.integration.fileTypes.slice(0, 4).join(", ")} in Lens right-click menus`);
  if (app.integration.voice.length) howLens.push(`Voice: ${app.integration.voice.slice(0, 2).map((v) => `"Lens, ${v}"`).join(", ")}`);
  if (app.integration.mcp) howLens.push("Has an MCP server, so Lens AI and Claude can use its tools (each action still asks first)");
  if (app.recipe.some((r) => r.kind === "localModelProvider")) howLens.push("Can become Lens AI's local model, so answers stay on your PC");
  howLens.push("Pinned to the Dock if you choose, and searchable from Lens Command");
  const via = app.install.method === "via" ? catalog.apps.find((a) => a.id === (app.install as { via: string }).via) : null;
  return (
    <div className="la-detail" onKeyDown={(e) => e.key === "Escape" && !ctl.popoverOpen && onBack()}>
      <button className="la-back" onClick={onBack}>
        ← All apps <kbd>Esc</kbd>
      </button>
      <div className="la-detail-top">
        <AppIcon app={app} size={72} installed={!!inst} live={live} />
        <div className="la-detail-head">
          <div className="la-detail-name">{app.name}</div>
          <div className="la-detail-pitch">{app.pitch}</div>
          <div className="la-chips">
            <span className="la-chip">{catalog.categories.find((c) => c.id === app.category)?.title}</span>
            <span className="la-chip">{STATUS_LABEL[app.status]}</span>
            <span className="la-chip">{app.openSource ? app.license : "Free, not open source"}</span>
            {app.replaces.slice(0, 2).map((r) => (
              <span key={r} className="la-chip la-chip-dim">
                instead of {r}
              </span>
            ))}
          </div>
        </div>
        <div className="la-detail-pill">
          <Pill app={app} ctl={ctl} />
          {inst && (
            <button className="la-link la-fine" onClick={() => revertRecipe(app.id)}>
              Undo Lens setup
            </button>
          )}
        </div>
      </div>
      {(app.media.screenshots.length > 0 || app.media.loop) && (
        <div className="la-gallery">
          <AppThumb app={app} live={live} large />
        </div>
      )}
      <div className="la-detail-grid">
        <section className="la-section">
          <div className="la-label">Why we picked it</div>
          <p className="la-p">{app.why}</p>
          {app.notes && <p className="la-fine">{app.notes}</p>}
          <div className="la-label">How Lens works with it</div>
          <ul className="la-list">
            {howLens.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </section>
        <section className="la-section">
          <dl className="la-facts">
            <dt>Licence</dt>
            <dd>{app.license}</dd>
            <dt>Publisher</dt>
            <dd>{app.publisher}</dd>
            <dt>Install</dt>
            <dd>
              {via ? `Through ${via.name}` : METHOD_LABEL[app.install.method]}
              {app.install.method === "winget" && <span className="la-mono la-muted"> {app.install.wingetId}</span>}
            </dd>
            {app.stars && (
              <>
                <dt>Stars</dt>
                <dd className="la-mono">{app.stars}</dd>
              </>
            )}
            {inst && (
              <>
                <dt>Installed</dt>
                <dd className="la-mono">{inst.version}</dd>
              </>
            )}
            {app.repo && (
              <>
                <dt>Source</dt>
                <dd>
                  <button className="la-link" onClick={() => link(app.repo!)}>
                    {app.repo.replace("https://", "")}
                  </button>
                </dd>
              </>
            )}
          </dl>
          <div className="la-fine">{app.media.noMedia ?? `Official media from ${app.media.credit}`}</div>
        </section>
      </div>
      {via && (
        <button className="la-link la-fine" onClick={() => onOpen(via.id)}>
          About {via.name} →
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

export function LensApps({ initialApp, initialQuery = "", demo }: LensAppsProps) {
  const [catalog, setCatalog] = useState<Catalog | null>(demo?.catalog ?? null);
  const [settings, setSettings] = useState<AppsSettings>(DEFAULT_SETTINGS);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(demo?.category ?? null);
  const [openSourceOnly, setOpenSourceOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialApp ?? null);
  const searchRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const ctl = useAppsController(catalog, demo);

  useEffect(() => {
    loadSettings().then(setSettings);
    if (demo?.catalog) return;
    loadCatalog().then(setCatalog);
  }, [demo]);

  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "/" && (e.target as HTMLElement).tagName !== "INPUT") {
      searchRef.current?.focus();
      e.preventDefault();
    }
  }, []);

  const results = useMemo(
    () => (catalog ? filterApps(catalog.apps, { query, category, openSourceOnly, showNonOpenSource: settings.showNonOpenSource }) : []),
    [catalog, query, category, openSourceOnly, settings.showNonOpenSource],
  );
  const home = useMemo(() => (catalog ? homeSections(catalog, settings.showNonOpenSource) : null), [catalog, settings.showNonOpenSource]);

  if (!catalog || !home) return <div className="la la-loading"><Skeleton label="Loading apps…" shape="grid" rows={3} /></div>;
  const live = settings.liveThumbnails;
  const app = selected ? catalog.apps.find((a) => a.id === selected) : null;
  const browsing = !!query.trim() || !!category || openSourceOnly;
  const open = (id: string) => {
    setSelected(id);
    topRef.current?.scrollIntoView({ block: "start" });
  };
  const card = (a: CatalogApp, hero = false) => <AppCard key={a.id} app={a} ctl={ctl} live={live} hero={hero} hovered={demo?.hover === a.id} onOpen={() => open(a.id)} />;

  return (
    <div className="la" onKeyDown={onKey} ref={topRef}>
      {app ? (
        <Detail app={app} catalog={catalog} ctl={ctl} live={live} onBack={() => setSelected(null)} onOpen={open} />
      ) : (
        <>
          <div className="la-head">
            <div className="la-title">Apps</div>
            <div className="la-sub">
              Free and open-source tools, picked for Lens.{" "}
              <span className="la-mono la-muted">
                {catalog.apps.length} apps · {catalog.updated}
              </span>
            </div>
          </div>
          <div className="la-searchbar">
            <input
              ref={searchRef}
              className="la-search"
              placeholder={`Search ${catalog.apps.length} apps, or what they replace…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              aria-label="Search apps"
            />
            <kbd className="la-search-kbd">/</kbd>
          </div>
          <div className="la-filters" role="toolbar" aria-label="Filter apps">
            <button className={`la-filter${!category ? " active" : ""}`} onClick={() => setCategory(null)} aria-pressed={!category}>
              All
            </button>
            {catalog.categories.map((c) => (
              <button key={c.id} className={`la-filter${category === c.id ? " active" : ""}`} onClick={() => setCategory(category === c.id ? null : c.id)} aria-pressed={category === c.id}>
                {c.title}
              </button>
            ))}
            <label className="la-filter la-filter-toggle">
              <input type="checkbox" checked={openSourceOnly} onChange={(e) => setOpenSourceOnly(e.target.checked)} /> Open source only
            </label>
          </div>
          {browsing ? (
            <div className="la-grid" role="list" aria-label="Results">
              {results.length === 0 && <div className="la-empty">No apps match. Try what you want to do, like "edit video" or "slides".</div>}
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
                    <button key={c.id} className="la-cat" onClick={() => setCategory(c.id)}>
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

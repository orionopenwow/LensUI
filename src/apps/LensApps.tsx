// Lens Apps: a calm catalogue of free and open-source tools with one-click install, live
// thumbnails, a detail page and setup recipes. Mounted as Settings › Apps (docs/LENS_APPS.md §1)
// and as the standalone `apps` surface. Keyboard: "/" focuses search, Esc goes back, arrows move
// between cards in a rail.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { auditLog, installedApps, lensInstalled, loadCatalog, loadSettings, onProgress, openApp, openLink, revertRecipe } from "./api";
import { InstallSheet, type SheetOp } from "./InstallSheet";
import { reduceJobs, type Jobs } from "./jobs";
import { LiveThumb } from "./LiveThumb";
import { filterApps, heroApps, rails } from "./search";
import type { AppsSettings, Catalog, CatalogApp, InstalledInfo } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import "./apps.css";

const METHOD_LABEL: Record<string, string> = {
  winget: "winget",
  githubRelease: "GitHub release",
  via: "Craft Launcher",
  officialSite: "Official site",
  web: "Web app",
};

const STATUS_LABEL: Record<string, string> = { stable: "Stable", beta: "Beta", alpha: "Early alpha" };

export interface LensAppsProps {
  /** Start on an app's page (used by voice "install …" / "what does … do" and screenshots). */
  initialApp?: string;
  initialQuery?: string;
  /** Screenshot/test hooks. */
  demo?: {
    catalog?: Catalog;
    installed?: Record<string, InstalledInfo>;
    jobs?: Jobs;
    sheet?: { appId: string; op: SheetOp; phase: "confirm" | "progress" | "releaseConfirm" | "recipe" | "done" | "error"; data?: any };
  };
}

function ArrowRail({ children, label }: { children: ReactNode; label: string }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const cards = [...(e.currentTarget.querySelectorAll<HTMLElement>(".la-card"))];
    const i = cards.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const next = cards[Math.max(0, Math.min(cards.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))];
    next?.focus();
    next?.scrollIntoView({ block: "nearest", inline: "nearest" });
    e.preventDefault();
  };
  return (
    <div className="la-rail" role="list" aria-label={label} onKeyDown={onKey}>
      {children}
    </div>
  );
}

function Badge({ app, installed }: { app: CatalogApp; installed?: InstalledInfo }) {
  if (installed?.available) return <span className="la-badge la-badge-update">Update</span>;
  if (installed) return <span className="la-badge la-badge-ok">Installed</span>;
  if (app.status !== "stable") return <span className="la-badge">{STATUS_LABEL[app.status]}</span>;
  if (!app.openSource) return <span className="la-badge">Free</span>;
  return null;
}

function AppCard({ app, installed, live, hero, onOpen }: { app: CatalogApp; installed?: InstalledInfo; live: boolean; hero?: boolean; onOpen: () => void }) {
  return (
    <button className={`la-card${hero ? " la-card-hero" : ""}`} role="listitem" onClick={onOpen} aria-label={`${app.name}. ${app.pitch}`}>
      <LiveThumb app={app} live={live} large={hero} />
      <div className="la-card-body">
        <div className="la-card-title">
          <span className="la-card-name">{app.name}</span>
          <Badge app={app} installed={installed} />
        </div>
        {hero && app.replaces.length > 0 && <div className="la-mono la-muted la-replaces">replaces {app.replaces.slice(0, 2).join(", ")}</div>}
        <div className="la-card-pitch">{app.pitch}</div>
      </div>
    </button>
  );
}

function Detail({
  app,
  catalog,
  installed,
  live,
  onBack,
  onAction,
}: {
  app: CatalogApp;
  catalog: Catalog;
  installed?: InstalledInfo;
  live: boolean;
  onBack: () => void;
  onAction: (op: SheetOp) => void;
}) {
  const via = app.install.method === "via" ? catalog.apps.find((a) => a.id === (app.install as any).via) : null;
  const link = (url: string) => openLink(app.id, url).catch(() => window.open(url, "_blank", "noopener"));
  const primary = (() => {
    switch (app.install.method) {
      case "winget":
      case "githubRelease":
        return installed ? null : (
          <button className="la-btn la-btn-primary" onClick={() => onAction("install")} autoFocus>
            Install <kbd>⏎</kbd>
          </button>
        );
      case "via":
        return (
          <button className="la-btn la-btn-primary" onClick={() => onAction("install")} autoFocus>
            Get {via?.name ?? "the launcher"} <kbd>⏎</kbd>
          </button>
        );
      case "web":
        return (
          <button className="la-btn la-btn-primary" onClick={() => openApp(app.id).catch(() => link((app.install as any).url))} autoFocus>
            Open web app <kbd>⏎</kbd>
          </button>
        );
      case "officialSite":
        return (
          <button className="la-btn la-btn-primary" onClick={() => link((app.install as any).url)} autoFocus>
            Get it from the official site ↗
          </button>
        );
    }
  })();
  const howLens: string[] = [];
  if (app.integration.fileTypes.length) howLens.push(`"Open in ${app.name}" for ${app.integration.fileTypes.slice(0, 4).join(", ")} in Lens right-click menus`);
  if (app.integration.voice.length) howLens.push(`Voice: ${app.integration.voice.slice(0, 2).map((v) => `"Lens, ${v}"`).join(", ")}`);
  if (app.integration.mcp) howLens.push("Has an MCP server, so Lens AI and Claude can use its tools (each action still asks first)");
  if (app.recipe.some((r) => r.kind === "localModelProvider")) howLens.push("Becomes Lens AI's local model, so answers stay on your PC");
  if (app.integration.cli) howLens.push(`Command line: ${app.integration.cli}`);
  howLens.push("Pinned to the Dock if you choose, and searchable from Lens Command");

  return (
    <div className="la-detail" onKeyDown={(e) => e.key === "Escape" && onBack()}>
      <button className="la-back" onClick={onBack}>
        ← All apps <kbd>Esc</kbd>
      </button>
      <div className="la-detail-top">
        <LiveThumb app={app} live={live} large />
        <div className="la-detail-head">
          <div className="la-detail-name">{app.name}</div>
          <div className="la-detail-pitch">{app.pitch}</div>
          <div className="la-chips">
            <span className="la-chip">{catalog.categories.find((c) => c.id === app.category)?.title}</span>
            <span className="la-chip">{STATUS_LABEL[app.status]}</span>
            <span className="la-chip">{app.openSource ? "Open source" : "Free, not open source"}</span>
            {app.replaces.slice(0, 2).map((r) => (
              <span key={r} className="la-chip la-chip-dim">
                instead of {r}
              </span>
            ))}
          </div>
          <div className="la-actions la-actions-left">
            {primary}
            {installed && (
              <button className="la-btn la-btn-primary" onClick={() => openApp(app.id)}>
                Open
              </button>
            )}
            {installed?.available && (
              <button className="la-btn" onClick={() => onAction("upgrade")}>
                Update to {installed.available}
              </button>
            )}
            {installed && app.install.method === "winget" && (
              <button className="la-btn" onClick={() => onAction("uninstall")}>
                Uninstall
              </button>
            )}
            {installed && (
              <button className="la-btn la-btn-ghost" onClick={() => revertRecipe(app.id)}>
                Undo Lens setup
              </button>
            )}
            <button className="la-btn la-btn-ghost" onClick={() => link(app.homepage)}>
              Website ↗
            </button>
          </div>
        </div>
      </div>
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
            <dd>
              {app.license}
              {!app.licenseVerified && <span className="la-muted"> · confirmed at install</span>}
            </dd>
            <dt>Publisher</dt>
            <dd>{app.publisher}</dd>
            <dt>Install</dt>
            <dd>
              {METHOD_LABEL[app.install.method]}
              {app.install.method === "winget" && <span className="la-mono la-muted"> {app.install.wingetId}</span>}
            </dd>
            {app.stars && (
              <>
                <dt>Stars</dt>
                <dd className="la-mono">{app.stars}</dd>
              </>
            )}
            {installed && (
              <>
                <dt>Installed</dt>
                <dd className="la-mono">{installed.version}</dd>
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
            <dt>Changes</dt>
            <dd>{app.install.method === "web" ? "Nothing on your PC" : "Installs an app for your user; uninstall any time"}</dd>
          </dl>
          <div className="la-fine">Official media from {app.media.credit}</div>
        </section>
      </div>
    </div>
  );
}

export function LensApps({ initialApp, initialQuery = "", demo }: LensAppsProps) {
  const [catalog, setCatalog] = useState<Catalog | null>(demo?.catalog ?? null);
  const [installed, setInstalled] = useState<Record<string, InstalledInfo>>(demo?.installed ?? {});
  const [settings, setSettings] = useState<AppsSettings>(DEFAULT_SETTINGS);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [openSourceOnly, setOpenSourceOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialApp ?? demo?.sheet?.appId ?? null);
  const [sheet, setSheet] = useState<{ appId: string; op: SheetOp } | null>(demo?.sheet ? { appId: demo.sheet.appId, op: demo.sheet.op } : null);
  const [jobs, setJobs] = useState<Jobs>(demo?.jobs ?? {});
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
    if (demo?.catalog) return;
    loadCatalog().then(setCatalog);
    installedApps().then(setInstalled);
  }, [demo]);

  useEffect(() => {
    let un: (() => void) | undefined;
    onProgress((e) => {
      setJobs((j) => reduceJobs(j, e));
      if (e.stage === "done") installedApps().then(setInstalled);
    }).then((u) => (un = u));
    return () => un?.();
  }, []);

  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.key === "/" && t.tagName !== "INPUT") {
      searchRef.current?.focus();
      e.preventDefault();
    }
  }, []);

  const results = useMemo(
    () => (catalog ? filterApps(catalog.apps, { query, category, openSourceOnly, showNonOpenSource: settings.showNonOpenSource }) : []),
    [catalog, query, category, openSourceOnly, settings.showNonOpenSource],
  );

  if (!catalog) return <div className="la la-loading">Loading apps…</div>;
  const app = selected ? catalog.apps.find((a) => a.id === selected) : null;
  const sheetApp = sheet ? catalog.apps.find((a) => a.id === sheet.appId) : null;
  const live = settings.liveThumbnails;
  const browsing = !!query.trim() || !!category || openSourceOnly;

  const startAction = (a: CatalogApp, op: SheetOp) => {
    if (a.install.method === "via") {
      const v = catalog.apps.find((x) => x.id === (a.install as any).via);
      if (v) {
        setSelected(v.id);
        setSheet({ appId: v.id, op: "install" });
      }
      return;
    }
    setSheet({ appId: a.id, op });
  };

  return (
    <div className="la" onKeyDown={onKey}>
      {app ? (
        <Detail app={app} catalog={catalog} installed={installed[app.id]} live={live} onBack={() => setSelected(null)} onAction={(op) => startAction(app, op)} />
      ) : (
        <>
          <div className="la-head">
            <div>
              <div className="la-title">Apps</div>
              <div className="la-sub">
                Free and open-source tools, picked for Lens. One click to install, nothing without your OK.{" "}
                <span className="la-mono la-muted">
                  {catalog.apps.length} apps · {catalog.updated}
                </span>
              </div>
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
              {results.map((a) => (
                <AppCard key={a.id} app={a} installed={installed[a.id]} live={live} onOpen={() => setSelected(a.id)} />
              ))}
            </div>
          ) : (
            <>
              <section className="la-block">
                <div className="la-block-head">
                  <span className="la-block-title">{catalog.collections.find((c) => c.id === "rewrites")?.title}</span>
                  <span className="la-block-sub">{catalog.collections.find((c) => c.id === "rewrites")?.subtitle}</span>
                </div>
                <ArrowRail label="Open-source rewrites">
                  {heroApps(catalog).map((a) => (
                    <AppCard key={a.id} app={a} installed={installed[a.id]} live={live} hero onOpen={() => setSelected(a.id)} />
                  ))}
                </ArrowRail>
              </section>
              {rails(catalog, settings.showNonOpenSource).map((r) => (
                <section key={r.id} className="la-block">
                  <div className="la-block-head">
                    <span className="la-block-title">{r.title}</span>
                    {r.subtitle && <span className="la-block-sub">{r.subtitle}</span>}
                    <span className="la-mono la-muted">{r.apps.length}</span>
                  </div>
                  <ArrowRail label={r.title}>
                    {r.apps.map((a) => (
                      <AppCard key={a.id} app={a} installed={installed[a.id]} live={live} onOpen={() => setSelected(a.id)} />
                    ))}
                  </ArrowRail>
                </section>
              ))}
            </>
          )}
        </>
      )}
      {sheet && sheetApp && (
        <InstallSheet
          app={sheetApp}
          op={sheet.op}
          job={jobs[sheetApp.id] ?? null}
          onClose={() => setSheet(null)}
          demo={demo?.sheet ? { phase: demo.sheet.phase, ...(demo.sheet.data ?? {}) } : undefined}
        />
      )}
    </div>
  );
}

/** Lens-installed apps and the audit log, for the AppsCard settings. */
export { auditLog, lensInstalled };

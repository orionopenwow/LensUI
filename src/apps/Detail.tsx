// One app's page: what it is, real screenshots, how Lens works with it, and (the part a store for
// other people's work owes them) who made it, where the source is and what its licence means.
import { useEffect, useRef, type CSSProperties } from "react";
import { oops } from "../ui/oops";
import { openLink } from "./api";
import { Gallery } from "./Gallery";
import { creditFor, licenceInfo, NOT_AFFILIATED } from "./licence";
import { LicenceChip, Pill } from "./pieces";
import type { Catalog, CatalogApp } from "./types";
import type { Ctl } from "./useAppsController";
import { AppIcon } from "./visuals";

const STATUS_LABEL: Record<string, string> = { stable: "Stable", beta: "Beta", alpha: "Early alpha" };
const METHOD_LABEL: Record<string, string> = { winget: "winget", githubRelease: "GitHub release, verified", via: "Craft Launcher", officialSite: "Official site", web: "Web app" };

/** What Lens does with an app once it's installed, in plain lines. */
export function howLensWorksWith(app: CatalogApp): string[] {
  const out: string[] = [];
  if (app.integration.fileTypes.length) out.push(`"Open in ${app.name}" for ${app.integration.fileTypes.slice(0, 4).join(", ")} in Lens right-click menus`);
  if (app.integration.voice.length) out.push(`Voice: ${app.integration.voice.slice(0, 2).map((v) => `"Lens, ${v}"`).join(", ")}`);
  if (app.integration.mcp) out.push("Has an MCP server, so Lens AI and Claude can use its tools (each action still asks first)");
  if (app.recipe.some((r) => r.kind === "localModelProvider")) out.push("Can become Lens AI's local model, so answers stay on your PC");
  out.push("Pinned to the Dock if you choose, and searchable from Lens Command");
  return out;
}

export function Detail({
  app,
  catalog,
  ctl,
  live,
  origin,
  shot,
  backLabel,
  onBack,
  onOpen,
}: {
  app: CatalogApp;
  catalog: Catalog;
  ctl: Ctl;
  live: boolean;
  /** Where the page grows from (the card that opened it), as a share of the page's box. */
  origin?: { x: number; y: number } | null;
  shot?: number;
  backLabel: string;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const inst = ctl.installed[app.id];
  const back = useRef<HTMLButtonElement>(null);
  const link = (url: string, what: string) => void openLink(app.id, url).catch(oops(`open ${what}`));
  const via = app.install.method === "via" ? catalog.apps.find((a) => a.id === (app.install as { via: string }).via) : null;
  const licence = licenceInfo(app);
  const credit = creditFor(app);

  // The page takes focus when it opens, so Esc and Tab start here (the card that opened it is gone).
  useEffect(() => {
    back.current?.focus({ preventScroll: true });
  }, [app.id]);

  // Esc goes back from anywhere on the page, unless a confirmation or menu took the key first.
  const popoverOpen = ctl.popoverOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || popoverOpen) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".la-floating")) return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, popoverOpen]);

  const style = origin ? ({ ["--la-origin-x"]: `${Math.round(origin.x * 100)}%`, ["--la-origin-y"]: `${Math.round(origin.y * 100)}%` } as CSSProperties) : undefined;
  return (
    <div className="la-detail" style={style} data-app-id={app.id}>
      <button ref={back} className="la-back" data-weight="light" onClick={onBack}>
        ← {backLabel} <kbd>Esc</kbd>
      </button>
      <div className="la-detail-top">
        <AppIcon app={app} size={72} installed={!!inst} live={live} />
        <div className="la-detail-head">
          <h2 className="la-detail-name">{app.name}</h2>
          <div className="la-detail-by">
            by{" "}
            <button className="la-link" data-weight="light" onClick={() => link(credit.sourceUrl, `${app.name}'s source`)} aria-label={`${credit.by}: open ${credit.source}`}>
              {credit.by}
            </button>
          </div>
          <div className="la-detail-pitch">{app.pitch}</div>
          <div className="la-chips">
            <span className="la-chip">{catalog.categories.find((c) => c.id === app.category)?.title}</span>
            <span className="la-chip">{STATUS_LABEL[app.status]}</span>
            <LicenceChip app={app} />
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
            <button className="la-link la-fine" data-weight="light" onClick={() => ctl.undoSetup(app)}>
              Undo Lens setup
            </button>
          )}
        </div>
      </div>
      <Gallery app={app} live={live} start={shot} />
      <div className="la-detail-grid">
        <section className="la-section">
          <div className="la-label">Why we picked it</div>
          <p className="la-p">{app.why}</p>
          {app.notes && <p className="la-fine">{app.notes}</p>}
          <div className="la-label">How Lens works with it</div>
          <ul className="la-list">
            {howLensWorksWith(app).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </section>
        <section className="la-section la-credits" aria-label={`Credits and licence for ${app.name}`}>
          <div className="la-label">Credits and licence</div>
          <dl className="la-facts">
            <dt>Made by</dt>
            <dd>{credit.by}</dd>
            {app.publisher && app.publisher !== credit.by && (
              <>
                <dt>Publisher</dt>
                <dd>{app.publisher}</dd>
              </>
            )}
            <dt>{app.repo ? "Source" : "Website"}</dt>
            <dd>
              <button className="la-link" data-weight="light" onClick={() => link(credit.sourceUrl, `${app.name}'s ${app.repo ? "source" : "website"}`)}>
                {credit.source}
              </button>
            </dd>
            <dt>Licence</dt>
            <dd>
              {licence.label}
              {licence.kind !== licence.label && <span className="la-muted"> · {licence.kind}</span>}
            </dd>
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
                <dd className="la-mono">{inst.available ? `${inst.version} → ${inst.available}` : inst.version}</dd>
              </>
            )}
          </dl>
          <p className="la-licence-plain">{licence.plain}</p>
          {licence.caveat && <p className="la-fine la-licence-caveat">{licence.caveat}</p>}
          <div className="la-fine">{credit.media}</div>
          <div className="la-fine">{NOT_AFFILIATED}</div>
        </section>
      </div>
      {via && (
        <button className="la-link la-fine" data-weight="light" onClick={() => onOpen(via.id)}>
          About {via.name} →
        </button>
      )}
    </div>
  );
}

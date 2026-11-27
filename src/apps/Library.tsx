// Library: everything from the catalogue that's on this PC, what has an update, and one
// "Update all" that asks once. Every row names who made the app and its licence, because a store
// for other people's work owes them that. Nothing here updates by itself.
import { Check, RefreshCw } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { Floating } from "./ActionPill";
import { librarySummary, sourceOf, versionLine, type LibraryRow } from "./libraryModel";
import { creditFor, NOT_AFFILIATED } from "./licence";
import { LicenceChip, Pill, Section } from "./pieces";
import type { Ctl } from "./useAppsController";
import { AppIcon } from "./visuals";

function Row({ row, ctl, live, onOpen }: { row: LibraryRow; ctl: Ctl; live: boolean; onOpen: (id: string) => void }) {
  const { app } = row;
  const item = ctl.item(app);
  const justDone = item?.status === "done" && item.op === "upgrade";
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) ctl.get(app);
      else onOpen(app.id);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const rows = [...(e.currentTarget.closest(".la-lib")?.querySelectorAll<HTMLElement>("[data-lib-row]") ?? [])];
      const to = rows[rows.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1)];
      if (to) {
        to.focus();
        e.preventDefault();
      }
    }
  };
  return (
    <div
      className={`la-lib-row${ctl.popoverProps(app) ? " la-card-pop" : ""}`}
      role="listitem"
      tabIndex={0}
      data-lib-row
      data-app-id={app.id}
      data-weight="light"
      aria-label={`${app.name}, ${row.available ? `update from ${row.version} to ${row.available}` : `version ${row.version}, up to date`}. By ${creditFor(app).by}.`}
      onClick={() => onOpen(app.id)}
      onKeyDown={onKey}
    >
      <AppIcon app={app} size={36} installed live={live} />
      <div className="la-lib-text">
        <span className="la-lib-name">
          {app.name}
          <span className="la-lib-by"> by {creditFor(app).by}</span>
        </span>
        <span className="la-lib-meta">
          <span className={`la-mono la-lib-version${row.available ? " has-update" : ""}`}>{versionLine(row)}</span>
          <LicenceChip app={app} />
        </span>
      </div>
      {justDone && (
        <span className="la-lib-done" aria-hidden="true">
          <Check size={13} strokeWidth={2.6} />
        </span>
      )}
      <Pill app={app} ctl={ctl} onDetails={() => onOpen(app.id)} />
    </div>
  );
}

function UpdateAllCard({ rows, onConfirm, onClose }: { rows: LibraryRow[]; onConfirm: () => void; onClose: () => void }) {
  return (
    <div
      className="la-pop la-pop-bulk"
      role="dialog"
      aria-label={rows.length === 1 ? `Update ${rows[0].app.name}` : `Update ${rows.length} apps`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="la-pop-title">
        <span>{rows.length === 1 ? `Update ${rows[0].app.name}` : `Update ${rows.length} apps`}</span>
        <span className="la-mono la-muted">via winget · hash-checked before each one runs</span>
      </div>
      <ul className="la-bulk-list">
        {rows.map((r) => (
          <li key={r.app.id}>
            <AppIcon app={r.app} size={20} installed />
            <span className="la-bulk-name">{r.app.name}</span>
            <span className="la-mono la-muted">{versionLine(r)}</span>
            <span className="la-mono la-muted la-bulk-src">{sourceOf(r.app)}</span>
          </li>
        ))}
      </ul>
      <div className="la-fine">They run one at a time. You can cancel any that hasn't started.</div>
      <div className="la-pop-actions">
        <button className="la-btn" data-weight="medium" onClick={onClose}>
          Cancel <kbd>Esc</kbd>
        </button>
        <button className="la-btn la-btn-primary" data-weight="heavy" autoFocus onClick={onConfirm}>
          {rows.length === 1 ? "Update" : `Update ${rows.length}`} <kbd>⏎</kbd>
        </button>
      </div>
    </div>
  );
}

export function Library({ ctl, live, total, onOpen, onDiscover }: { ctl: Ctl; live: boolean; total: number; onOpen: (id: string) => void; onDiscover: () => void }) {
  const m = ctl.library;
  const anchor = useRef<HTMLDivElement>(null);
  const can = ctl.updatable.length;
  return (
    <div className="la-lib">
      <div className="la-lib-head">
        <div className="la-lib-summary" role="status">
          {librarySummary(m)}
        </div>
        <div className="la-lib-actions" ref={anchor}>
          <button className="la-btn" data-weight="medium" data-pending={ctl.checking ? "" : undefined} aria-busy={ctl.checking} disabled={ctl.checking} onClick={() => void ctl.refresh(true)}>
            <RefreshCw size={12} strokeWidth={2.4} className={ctl.checking ? "la-spin-slow" : ""} aria-hidden="true" /> {ctl.checking ? "Checking" : "Check again"}
          </button>
          {m.updateCount > 0 && (
            <button className="la-btn la-btn-primary" data-weight="heavy" disabled={!can} aria-haspopup="dialog" aria-expanded={!!ctl.bulk} onClick={ctl.askUpdateAll}>
              {can === 1 ? "Update 1 app" : can ? `Update all ${can}` : "Updating"}
            </button>
          )}
          {ctl.bulk && (
            <Floating anchor={anchor} width={360} onClose={ctl.cancelUpdateAll}>
              <UpdateAllCard rows={ctl.bulk} onConfirm={ctl.confirmUpdateAll} onClose={ctl.cancelUpdateAll} />
            </Floating>
          )}
        </div>
      </div>
      {ctl.installedError && (
        <div className="la-note" role="status">
          <span>Lens couldn't ask winget what's installed, so this list may be missing apps. Nothing was changed.</span>
          <span className="la-fine">{ctl.installedError.length <= 140 ? ctl.installedError : "winget didn't answer."}</span>
        </div>
      )}
      {m.total === 0 && !ctl.installedError && (
        <div className="la-lib-empty">
          <div className="la-lib-empty-title">A clean shelf</div>
          <p className="la-p">
            Nothing from the catalogue is on this PC yet. Discover has {total} free tools, and each one says who made it and under which licence before you get it.
          </p>
          <button className="la-btn la-btn-primary" data-weight="heavy" onClick={onDiscover}>
            Browse Discover
          </button>
        </div>
      )}
      {m.updates.length > 0 && (
        <Section title="Updates" subtitle="Nothing updates until you say so" count={m.updates.length}>
          <div className="la-lib-list" role="list" aria-label="Apps with an update">
            {m.updates.map((r) => (
              <Row key={r.app.id} row={r} ctl={ctl} live={live} onOpen={onOpen} />
            ))}
          </div>
        </Section>
      )}
      {m.current.length > 0 && (
        <Section title="Up to date" count={m.current.length}>
          <div className="la-lib-list" role="list" aria-label="Apps that are up to date">
            {m.current.map((r) => (
              <Row key={r.app.id} row={r} ctl={ctl} live={live} onOpen={onOpen} />
            ))}
          </div>
        </Section>
      )}
      {m.total > 0 && (
        <div className="la-fine la-lib-foot">
          Lens checks when you open Lens Apps or press Check again (one <span className="la-mono">winget list</span>). Apps you installed another way show here too when winget knows them. {NOT_AFFILIATED}
        </div>
      )}
    </div>
  );
}

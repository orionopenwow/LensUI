// Small pieces shared by Discover, the Library and the detail page.
import type { ReactNode } from "react";
import { ActionPill } from "./ActionPill";
import { digitsOf } from "./libraryModel";
import { licenceInfo } from "./licence";
import type { CatalogApp } from "./types";
import type { Ctl } from "./useAppsController";

/** The action pill for one app, wired to the controller. */
export function Pill({ app, ctl, onDetails, compact }: { app: CatalogApp; ctl: Ctl; onDetails?: () => void; compact?: boolean }) {
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
      onReveal={() => ctl.reveal(app)}
      compact={compact}
    />
  );
}

export function Section({ title, subtitle, count, children }: { title: string; subtitle?: string; count?: number; children: ReactNode }) {
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

/** A licence chip: the short name, with a quiet mark when Lens hasn't checked it. The plain-words
 *  meaning is the chip's accessible description (and is written out on the detail page). */
export function LicenceChip({ app }: { app: CatalogApp }) {
  const l = licenceInfo(app);
  return (
    <span className={`la-chip la-licence la-licence-${l.family}`} aria-label={`Licence: ${l.label}. ${l.kind}.${l.verified ? "" : " Not checked by Lens yet."}`}>
      {l.label}
      {!l.verified && <span className="la-licence-unchecked" aria-hidden="true">?</span>}
    </span>
  );
}

/** A count whose digits roll into place when it changes (transform only; instant with reduced
 *  motion). The whole number is read as one value. */
export function RollingCount({ value, label }: { value: number; label: string }) {
  return (
    <span className="la-roll" role="status" aria-label={label}>
      {digitsOf(value).map((d, i, all) => (
        // Keyed by place and digit, so only a digit that changed is replaced and rolls in.
        <span key={`${all.length - i}:${d}`} className="la-roll-digit" aria-hidden="true">
          {d}
        </span>
      ))}
    </span>
  );
}

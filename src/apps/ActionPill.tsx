// App Store-style action pill: Get → progress ring (tap to cancel) → Open; Update when one is
// available; Run once a GitHub release is downloaded and verified. The one confirmation is a compact
// popover anchored to the pill. The "⋯" button holds Details, Uninstall and Show in folder.
import { Ellipsis, ExternalLink, FolderOpen, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { STAGE_LABEL, type JobState } from "./jobs";
import type { QueueItem } from "./queue";
import type { AppShow, CatalogApp, InstalledInfo, PreparedRelease } from "./types";
import { AppIcon } from "./visuals";

export type PillKind = "get" | "getExternal" | "open" | "update" | "queued" | "running" | "run" | "retry";
export type PopoverMode = "get" | "update" | "uninstall" | "run";

/** What the pill shows for an app right now. Pure: also used by tests. */
export function pillFor(app: CatalogApp, installed: InstalledInfo | undefined, item: QueueItem | undefined): PillKind {
  if (item) {
    if (item.status === "queued") return "queued";
    if (item.status === "running") return "running";
    if (item.status === "verified") return "run";
    if (item.status === "failed") return "retry";
  }
  if (installed) return installed.available ? "update" : "open";
  if (app.install.method === "web") return "open";
  if (app.install.method === "officialSite") return "getExternal";
  return "get";
}

const PILL_LABEL: Record<PillKind, string> = {
  get: "Get",
  getExternal: "Get",
  open: "Open",
  update: "Update",
  queued: "Queued",
  running: "",
  run: "Run",
  retry: "Retry",
};

function Ring({ pct }: { pct: number | null }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`la-ring${pct == null ? " la-ring-spin" : ""}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r={r} className="la-ring-track" />
      <circle cx="12" cy="12" r={r} className="la-ring-fill" strokeDasharray={c} strokeDashoffset={pct == null ? c * 0.7 : c * (1 - pct / 100)} />
      <rect x="9" y="9" width="6" height="6" rx="1" className="la-ring-stop" />
    </svg>
  );
}

function mb(n: number | null | undefined): string | null {
  if (!n) return null;
  return n > 1024 * 1024 * 1024 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`;
}

function hostOf(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

export interface PopoverProps {
  app: CatalogApp;
  mode: PopoverMode;
  show?: AppShow | null;
  showError?: string | null;
  prepared?: PreparedRelease | null;
  via?: CatalogApp | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** The single confirmation, anchored to the pill. */
export function ConfirmPopover({ app, mode, show, showError, prepared, via, onConfirm, onClose }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>(".la-btn-primary:not(:disabled)")?.focus();
  }, [show, prepared]);
  const isWinget = app.install.method === "winget";
  const target = via ?? app;
  const repo = target.install.method === "githubRelease" ? target.install.repo : null;
  const signed = prepared?.signatureStatus === "Valid";
  const rows: [string, string][] = [];
  if (mode === "run" && prepared) {
    rows.push(["File", prepared.fileName], ["Size", mb(prepared.size) ?? "—"], ["Checksum", prepared.checksum === "verified" ? "matches published SHA-256" : "none published"], ["Signature", signed ? `signed · ${prepared.publisher ?? "trusted"}` : prepared.signatureStatus === "NotSigned" ? "not signed · SmartScreen may warn" : prepared.signatureStatus]);
  } else if (isWinget) {
    rows.push(["Source", `winget · ${(app.install as any).wingetId}`]);
    rows.push(["Licence", show?.license || app.license]);
    rows.push(["Size", mb(show?.installerSize) ?? (show ? "—" : "checking…")]);
    if (show?.installerUrl) rows.push(["From", hostOf(show.installerUrl)]);
  } else {
    rows.push(["Source", repo ? `github.com/${repo}` : hostOf(target.homepage)]);
    rows.push(["Licence", target.license]);
    if (repo) rows.push(["Size", "shown once it's downloaded and checked"]);
  }
  const verb = mode === "run" ? "Run installer" : mode === "uninstall" ? "Uninstall" : mode === "update" ? `Update${show?.version ? ` to ${show.version}` : ""}` : via ? `Get ${via.name}` : "Get";
  const method =
    mode === "run"
      ? "GitHub release, verified"
      : mode === "uninstall"
        ? "Runs the app's own uninstaller"
        : isWinget
          ? "via winget · hash-checked before it runs"
          : "GitHub release · checked before it runs";
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };
  return (
    <div ref={ref} className="la-pop" role="dialog" aria-label={`${verb} ${app.name}`} onKeyDown={keys} onClick={(e) => e.stopPropagation()}>
      <div className="la-pop-head">
        <AppIcon app={target} size={28} />
        <div className="la-pop-title">
          <span>{target.name}</span>
          <span className="la-mono la-muted">
            {mode === "run" ? <ShieldCheck size={11} style={{ verticalAlign: -1 }} /> : null} {method}
          </span>
        </div>
      </div>
      {via && <div className="la-fine">{app.name} installs through {via.name}, which manages the whole suite.</div>}
      <dl className="la-pop-facts">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={k === "Source" || k === "File" || k === "From" ? "la-mono" : ""}>{v}</dd>
          </div>
        ))}
      </dl>
      {isWinget && mode !== "uninstall" && !!show?.agreements.length && (
        <div className="la-fine">By installing you accept {show.agreements.map((a) => a.label).join(", ")}.</div>
      )}
      {showError && <div className="la-fine la-warn-inline">{showError}</div>}
      <div className="la-pop-actions">
        <button className="la-btn" onClick={onClose}>
          Cancel <kbd>Esc</kbd>
        </button>
        <button className={`la-btn la-btn-primary${mode === "uninstall" ? " la-btn-danger" : ""}`} onClick={onConfirm} disabled={isWinget && mode === "get" && !show && !showError}>
          {verb} <kbd>⏎</kbd>
        </button>
      </div>
    </div>
  );
}

/** Renders `children` in a layer on <body>, fixed below-right of the anchor (so rails that scroll
 *  horizontally never clip it). Closes on scroll or resize. */
function Floating({ anchor, children, width, onClose }: { anchor: RefObject<HTMLElement | null>; children: ReactNode; width: number; onClose: () => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!layer.current?.contains(t) && !anchor.current?.contains(t)) closeRef.current();
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [anchor]);
  useEffect(() => {
    let raf = 0;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) {
        raf = requestAnimationFrame(place);
        return;
      }
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width));
      setPos({ top: r.bottom + 8, left });
    };
    place();
    // Follow the anchor when anything scrolls; close only when it leaves the window.
    const close = (e: Event) => {
      if (e.type === "scroll" && (e.target as HTMLElement)?.closest?.(".la-floating")) return;
      const r = anchor.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) closeRef.current();
      else place();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [anchor, width]);
  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <div ref={layer} className="la-floating" style={{ position: "fixed", top: pos.top, left: pos.left, width, zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

export interface PillProps {
  app: CatalogApp;
  kind: PillKind;
  job?: JobState | null;
  item?: QueueItem;
  popover?: PopoverProps | null;
  menu?: boolean;
  installed?: boolean;
  onPrimary: () => void;
  onCancel: () => void;
  onDetails?: () => void;
  onUninstall?: () => void;
  onReveal?: () => void;
  compact?: boolean;
}

/** The pill plus its "⋯" menu, with the popover anchored beneath. */
export function ActionPill({ app, kind, job, item, popover, menu = true, installed, onPrimary, onCancel, onDetails, onUninstall, onReveal, compact }: PillProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const busy = kind === "running" || kind === "queued";
  const label = kind === "running" ? (job ? STAGE_LABEL[job.stage] : "Starting") : PILL_LABEL[kind];
  const pct = kind === "running" ? (job && !job.finished ? (job.stage === "installing" && job.overall >= 99 ? null : job.overall) : null) : kind === "queued" ? 0 : null;
  return (
    <div ref={wrap} className={`la-pill-wrap${compact ? " compact" : ""}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        className={`la-pill la-pill-${kind}`}
        onClick={busy ? onCancel : onPrimary}
        aria-label={busy ? `Cancel ${app.name} (${label})` : `${label} ${app.name}`}
      >
        {busy ? (
          <>
            <Ring pct={pct} />
            <span className="la-sr">{label}</span>
          </>
        ) : (
          <>
            {kind === "run" && <span className="la-pill-dot" />}
            {label}
            {kind === "getExternal" && <ExternalLink size={11} />}
          </>
        )}
      </button>
      {menu && (
        <button className="la-pill-more" aria-label={`More for ${app.name}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Ellipsis size={14} />
        </button>
      )}
      {open && (
        <Floating anchor={wrap} width={180} onClose={() => setOpen(false)}>
        <div className="la-menu" role="menu" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          {onDetails && (
            <button role="menuitem" onClick={() => (setOpen(false), onDetails())}>
              Details
            </button>
          )}
          {installed && onReveal && (
            <button role="menuitem" onClick={() => (setOpen(false), onReveal())}>
              <FolderOpen size={13} /> Show in folder
            </button>
          )}
          {installed && onUninstall && app.install.method === "winget" && (
            <button role="menuitem" className="la-menu-danger" onClick={() => (setOpen(false), onUninstall())}>
              <Trash2 size={13} /> Uninstall
            </button>
          )}
        </div>
        </Floating>
      )}
      {item?.status === "failed" && item.message && <span className="la-sr">{item.message}</span>}
      {popover && (
        <Floating anchor={wrap} width={300} onClose={popover.onClose}>
          <ConfirmPopover {...popover} />
        </Floating>
      )}
    </div>
  );
}

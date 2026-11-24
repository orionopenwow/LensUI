// Site permissions in Lens Browser: the bar a page's request opens under the address bar, the
// site strip behind the address bar's site button, and the full list in Settings. The rules live
// in src-tauri/src/browser/permissions.rs; this file only shows them.
import React from "react";
import { Bell, Camera, ClipboardPaste, Download, MapPin, Mic, X } from "lucide-react";
import { Key } from "./ApprovalCard";
import { hostOf } from "./model";
import "./sitePermissions.css";
import { PERMISSION_KINDS, type PermissionAnswer, type PermissionAsk, type PermissionKind, type SitePermissions } from "./api";

export const KIND_TEXT: Record<PermissionKind, { verb: string; name: string; Icon: React.ComponentType<{ size?: number }> }> = {
  camera: { verb: "use your camera", name: "Camera", Icon: Camera },
  microphone: { verb: "use your microphone", name: "Microphone", Icon: Mic },
  location: { verb: "know your location", name: "Location", Icon: MapPin },
  notifications: { verb: "show notifications", name: "Notifications", Icon: Bell },
  clipboard: { verb: "see what you copied", name: "Clipboard", Icon: ClipboardPaste },
  downloads: { verb: "download several files", name: "Several downloads", Icon: Download },
};

/** The request for the active tab, oldest first; other tabs' requests wait for their tab. */
export function askFor(asks: PermissionAsk[], tabId: string | undefined): PermissionAsk | undefined {
  return tabId ? asks.filter((a) => a.tab === tabId && a.kind in KIND_TEXT).sort((a, b) => a.id - b.id)[0] : undefined;
}

/** The kinds remembered for one origin, in the order Settings lists them. */
export function sitesKinds(saved: SitePermissions | undefined, origin: string): [PermissionKind, boolean][] {
  const m = saved?.[origin] ?? {};
  return PERMISSION_KINDS.filter((k) => typeof m[k] === "boolean").map((k) => [k, m[k] as boolean]);
}

/** The bar under the address bar. It sits above the page, so the page moves down to make room. */
export function PermissionBar({ ask, more, onAnswer }: { ask: PermissionAsk; more: number; onAnswer(a: PermissionAnswer): void }) {
  const t = KIND_TEXT[ask.kind];
  return (
    <div className="lb-perm-bar" role="alertdialog" aria-label={`${hostOf(ask.origin)} wants to ${t.verb}`}>
      <span className="lb-perm-icon" aria-hidden><t.Icon size={14} /></span>
      <span className="lb-perm-text">
        <strong>{hostOf(ask.origin)}</strong> wants to {t.verb}
        {more ? <span className="lb-dim"> · {more} more waiting</span> : null}
      </span>
      <span className="lb-push" />
      <button className="lb-btn lb-btn-sm" onClick={() => onAnswer("block")}>Block <Key k="Esc" /></button>
      <button className="lb-btn lb-btn-sm" onClick={() => onAnswer("once")}>Allow once</button>
      <button className="lb-btn lb-btn-sm lb-btn-primary" autoFocus onClick={() => onAnswer("site")}>Allow on this site <Key k="⏎" /></button>
    </div>
  );
}

/** What this site may do, with a way to forget each answer. */
export function SiteStrip({ origin, saved, onForget, onClose }: { origin: string; saved: SitePermissions | undefined; onForget(kind: PermissionKind | null): void; onClose(): void }) {
  const kinds = sitesKinds(saved, origin);
  return (
    <div className="lb-perm-bar lb-perm-site" role="region" aria-label={`Permissions for ${hostOf(origin)}`}>
      <span className="lb-perm-text"><strong>{hostOf(origin)}</strong></span>
      {kinds.length ? (
        kinds.map(([k, allowed]) => {
          const t = KIND_TEXT[k];
          return (
            <span key={k} className={`lb-perm-chip${allowed ? " is-on" : ""}`}>
              <t.Icon size={12} /> {t.name} · {allowed ? "Allowed" : "Blocked"}
              <button className="lb-perm-x" aria-label={`Forget ${t.name} for ${hostOf(origin)}`} onClick={() => onForget(k)}><X size={11} /></button>
            </span>
          );
        })
      ) : (
        <span className="lb-dim">Nothing allowed or blocked. This site asks before using your camera, microphone, location and more.</span>
      )}
      <span className="lb-push" />
      {kinds.length > 1 ? <button className="lb-btn lb-btn-sm" onClick={() => onForget(null)}>Forget all</button> : null}
      <button className="lb-icon-btn sm" aria-label="Close site permissions" onClick={onClose}><X size={12} /></button>
    </div>
  );
}

/** Settings › AI & Command › Lens Browser: every remembered answer. */
export function SitePermissionsList({ saved, onForget }: { saved: SitePermissions; onForget(origin: string, kind: PermissionKind | null): void }) {
  const origins = Object.keys(saved).filter((o) => sitesKinds(saved, o).length).sort();
  if (!origins.length) return <div className="cc-desc">No site has been allowed or blocked yet. Sites ask before using your camera, microphone, location, notifications, clipboard or several downloads.</div>;
  return (
    <ul className="lb-perm-list" aria-label="Site permissions">
      {origins.map((o) => (
        <li key={o}>
          <span className="lb-perm-site-name">{hostOf(o)}</span>
          {sitesKinds(saved, o).map(([k, allowed]) => (
            <span key={k} className={`lb-perm-chip${allowed ? " is-on" : ""}`}>
              {KIND_TEXT[k].name} · {allowed ? "Allowed" : "Blocked"}
              <button className="lb-perm-x" aria-label={`Forget ${KIND_TEXT[k].name} for ${hostOf(o)}`} onClick={() => onForget(o, k)}><X size={11} /></button>
            </span>
          ))}
          <button className="cc-btn-ghost" onClick={() => onForget(o, null)}>Forget site</button>
        </li>
      ))}
    </ul>
  );
}

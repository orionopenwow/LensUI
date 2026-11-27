// Shared pieces for Mission Control's pages: data loading with a session cache, sections, status
// pills, the two-step confirm for every write, and small helpers. Token-only styling (mission.css).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button, toast } from "../ui";
import { apply, cancel, plan } from "./api";
import type { Plan, WriteAction } from "./model/types";

// ── data ──────────────────────────────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; value: unknown }>();

export interface Load<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
  at: number;
}

/** Loads once per session (shared across pages by `key`); `reload()` asks again. */
export function useLoad<T>(key: string, fn: () => Promise<T>): Load<T> {
  const hit = cache.get(key);
  const [data, setData] = useState<T | undefined>(hit?.value as T | undefined);
  const [at, setAt] = useState(hit?.at ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!hit);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(
    (force: boolean) => {
      if (!force && cache.has(key)) return;
      setLoading(true);
      fnRef
        .current()
        .then((v) => {
          const now = Date.now();
          cache.set(key, { at: now, value: v });
          setData(v);
          setAt(now);
          setError(null);
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    },
    [key]
  );
  useEffect(() => run(false), [run]);
  useEffect(() => {
    const onRefresh = () => run(true);
    window.addEventListener("mc-refresh", onRefresh);
    return () => window.removeEventListener("mc-refresh", onRefresh);
  }, [run]);
  return { data, error, loading, reload: () => run(true), at };
}

export function refreshAll() {
  window.dispatchEvent(new Event("mc-refresh"));
}

// ── layout ────────────────────────────────────────────────────────────────────────────────────

export function Page({ title, sub, actions, children }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mc-page">
      <header className="mc-page-head">
        <div>
          <h1 className="mc-page-title">{title}</h1>
          {sub ? <p className="mc-page-sub">{sub}</p> : null}
        </div>
        {actions ? <div className="mc-page-actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function Section({ title, sub, actions, children, id }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section className="mc-section" id={id} aria-label={title}>
      <div className="mc-section-head">
        <h2 className="mc-section-title">{title}</h2>
        {sub ? <span className="mc-section-sub">{sub}</span> : null}
        {actions ? <div className="mc-section-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export type Tone = "ok" | "warn" | "bad" | "muted" | "info";

export function Pill({ tone = "muted", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`mc-pill is-${tone}`}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone }) {
  return (
    <div className={`mc-stat ${tone ? `is-${tone}` : ""}`}>
      <div className="mc-stat-label">{label}</div>
      <div className="mc-stat-value">{value}</div>
      {sub ? <div className="mc-stat-sub">{sub}</div> : null}
    </div>
  );
}

export function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={`mc-grid is-${cols}`}>{children}</div>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span className="mc-muted">{children}</span>;
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <code className="mc-mono">{children}</code>;
}

export function LoadState<T>({ load, empty, children }: { load: Load<T>; empty?: string; children: (d: T) => React.ReactNode }) {
  if (load.data !== undefined) return <>{children(load.data)}</>;
  if (load.error) return <div className="mc-error" role="alert">{load.error}</div>;
  if (load.loading) return <div className="mc-skeleton" aria-busy="true" aria-label="Loading" />;
  return <div className="mc-empty">{empty ?? "Nothing here yet."}</div>;
}

/** Weighted buttons (DESIGN.md §5.2): light rows, medium buttons, heavy primaries/destructive. */
export function Btn({
  weight = "medium",
  variant,
  children,
  ...rest
}: { weight?: "light" | "medium" | "heavy"; variant?: "default" | "primary" | "ghost" | "danger"; children: React.ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title" | "type">) {
  return (
    <Button size="sm" variant={variant} data-weight={weight} {...rest}>
      {children}
    </Button>
  );
}

export function copyText(text: string, what = "Copied") {
  navigator.clipboard
    .writeText(text)
    .then(() => toast(what, { kind: "success" }))
    .catch(() => toast("Couldn't copy to the clipboard.", { kind: "error" }));
}

// ── writes: plan → show → confirm → apply ──────────────────────────────────────────────────────

type Confirm = (action: WriteAction, done?: (msg: string) => void) => void;
const ConfirmCtx = createContext<Confirm>(() => {});

export const useConfirm = () => useContext(ConfirmCtx);

/** Hosts the one confirm sheet. Heavy actions (merge, tag, close, relaunch) need two presses:
 * "Continue" and then the named final button. Esc or Cancel cancels the plan on the Rust side. */
export function ConfirmHost({ children }: { children: React.ReactNode }) {
  const [p, setP] = useState<Plan | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const doneRef = useRef<((m: string) => void) | undefined>(undefined);

  const ask: Confirm = useCallback((action, done) => {
    plan(action)
      .then((pl) => {
        doneRef.current = done;
        setArmed(false);
        setP(pl);
      })
      .catch((e) => toast(String(e), { kind: "error" }));
  }, []);

  const close = useCallback(() => {
    if (p) cancel(p.id).catch(() => {});
    setP(null);
    setBusy(false);
  }, [p]);

  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [p, close]);

  const go = () => {
    if (!p) return;
    if (p.heavy && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    apply(p.id)
      .then((r) => {
        toast(r.message, { kind: "success" });
        doneRef.current?.(r.message);
        setP(null);
      })
      .catch((e) => toast(String(e), { kind: "error" }))
      .finally(() => setBusy(false));
  };

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {p ? (
        <div className="mc-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="mc-confirm" role="dialog" aria-modal="true" aria-label={`Confirm ${p.action}`}>
            <div className="mc-confirm-title">
              {p.heavy ? "This can't be undone from here" : "Check before it runs"} · <span className="mc-muted">{p.target}</span>
            </div>
            <ol className="mc-confirm-steps">
              {p.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <p className="mc-confirm-note">Recorded in .dev/mission-control/audit.jsonl. Nothing has been sent yet.</p>
            <div className="mc-confirm-actions">
              <Btn weight="medium" variant="ghost" onClick={close} disabled={busy} autoFocus>
                Cancel
              </Btn>
              <Btn weight="heavy" variant={p.heavy ? "danger" : "primary"} onClick={go} disabled={busy} aria-label={p.heavy && armed ? `Yes, ${p.action}` : "Continue"}>
                {busy ? "Working…" : p.heavy && armed ? `Yes, ${p.action}` : p.heavy ? "Continue…" : "Run it"}
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmCtx.Provider>
  );
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}

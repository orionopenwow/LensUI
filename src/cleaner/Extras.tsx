// The standout panels: per-app storage, "Where did my space go?" and the Downloads review.

import React, { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, FolderOpen, Sparkles, TrendingUp, Trash2 } from "lucide-react";
import { ageLabel, driveName, fmtSize, sparkPath } from "./model";
import type { AppUsage, HistoryView, Verdict } from "./types";
import { Check3, FillBar, Spinner } from "./ui";

const Skeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <ul className="cl-skel-list" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <li key={i} className="cl-skel-row" style={{ ["--i" as string]: i }}>
        <span className="cl-skel sq" />
        <span className="cl-skel w40" />
        <span className="cl-skel bar" />
        <span className="cl-skel w20" />
      </li>
    ))}
  </ul>
);

export const AppsPanel: React.FC<{ apps: AppUsage[] | null; error: string | null; onUninstall: (a: AppUsage) => void; onReveal: (p: string) => void; onRetry: () => void }> = ({ apps, error, onUninstall, onReveal, onRetry }) => {
  const [confirm, setConfirm] = useState<string | null>(null);
  const max = useMemo(() => Math.max(1, ...(apps ?? []).map((a) => a.size + a.dataSize)), [apps]);
  return (
    <section className="cl-panel" aria-labelledby="cl-apps-title">
      <header className="cl-panel-head">
        <h1 id="cl-apps-title" className="cl-h2">
          Apps by size
        </h1>
        <p className="cl-sub">What each installed app takes, including its caches and data. Removing an app always uses its own uninstaller.</p>
      </header>
      {error && (
        <div className="cl-error" role="alert">
          <span>{error}</span>
          <button type="button" className="cl-btn is-ghost is-sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {!apps && !error && <Skeleton />}
      {apps && (
        <ul className="cl-apps">
          {apps.map((a, i) => (
            <li key={a.key} className="cl-approw" style={{ ["--i" as string]: Math.min(i, 12) }}>
              <span className="cl-app-icon" aria-hidden>
                {a.icon ? <img src={a.icon} alt="" width={28} height={28} /> : <span className="cl-app-letter">{a.name.slice(0, 1)}</span>}
              </span>
              <span className="cl-app-text">
                <span className="cl-app-name">{a.name}</span>
                <span className="cl-meta">
                  {a.publisher || "Unknown publisher"} · app <span className="cl-num">{fmtSize(a.size)}</span>
                  {a.dataSize > 0 && (
                    <>
                      {" "}
                      · caches & data <span className="cl-num">{fmtSize(a.dataSize)}</span>
                    </>
                  )}
                </span>
              </span>
              <span className="cl-app-bar">
                <span className="cl-split" role="img" aria-label={`${fmtSize(a.size)} app, ${fmtSize(a.dataSize)} data`}>
                  <span className="a" style={{ width: `${(a.size / max) * 100}%` }} />
                  <span className="b" style={{ width: `${(a.dataSize / max) * 100}%` }} />
                </span>
              </span>
              <span className="cl-num cl-app-size">{fmtSize(a.size + a.dataSize)}</span>
              <span className="cl-app-act">
                {a.dataDirs[0] && (
                  <button type="button" className="cl-icon-btn" aria-label={`Open ${a.name}'s data folder`} onClick={() => onReveal(a.dataDirs[0])}>
                    <FolderOpen size={13} />
                  </button>
                )}
                {a.canUninstall &&
                  (confirm === a.key ? (
                    <button type="button" className="cl-btn is-danger is-sm" onClick={() => (setConfirm(null), onUninstall(a))} autoFocus>
                      Open its uninstaller
                    </button>
                  ) : (
                    <button type="button" className="cl-btn is-ghost is-sm" onClick={() => setConfirm(a.key)}>
                      Uninstall…
                    </button>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export const TimelinePanel: React.FC<{ root: string; data: HistoryView | null; total: number; onEnable: () => void; onReveal: (p: string) => void }> = ({ root, data, total, onEnable, onReveal }) => {
  const W = 560;
  const H = 120;
  const used = (data?.series ?? []).map((p) => p.used);
  const path = sparkPath(used, W, H, 6);
  const area = path ? `${path} L${W - 6} ${H} L6 ${H} Z` : "";
  const first = data?.series[0];
  const last = data?.series[data.series.length - 1];
  const delta = first && last ? last.used - first.used : 0;
  return (
    <section className="cl-panel" aria-labelledby="cl-tl-title">
      <header className="cl-panel-head">
        <h1 id="cl-tl-title" className="cl-h2">
          Where did my space go?
        </h1>
        <p className="cl-sub">A small daily snapshot of {driveName(root)}, kept on this PC only.</p>
      </header>
      {!data && <Skeleton rows={3} />}
      {data && !data.enabled && (
        <div className="cl-optin">
          <TrendingUp size={20} aria-hidden />
          <div>
            <strong>Turn on daily snapshots</strong>
            <p className="cl-sub">Lens notes how full each drive is once a day, and the size of your biggest folders when you map a drive. Nothing leaves your PC.</p>
          </div>
          <button type="button" className="cl-btn is-primary" onClick={onEnable}>
            Turn on
          </button>
        </div>
      )}
      {data?.enabled && (
        <>
          {data.sudden != null && data.sudden > 0 && (
            <div className="cl-alert" role="alert">
              <AlertTriangle size={15} aria-hidden /> {driveName(root)} grew by <strong className="cl-num">{fmtSize(data.sudden)}</strong> since yesterday. The folders below are the usual suspects.
            </div>
          )}
          <div className="cl-spark-card">
            <div className="cl-spark-head">
              <span className="cl-meta">USED · LAST {data.series.length} DAYS</span>
              <span className="cl-num cl-strong">{last ? fmtSize(last.used) : "—"}</span>
              {delta !== 0 && <span className={`cl-delta cl-num ${delta > 0 ? "is-up" : "is-down"}`}>{(delta > 0 ? "+" : "−") + fmtSize(Math.abs(delta))}</span>}
            </div>
            {data.series.length >= 2 ? (
              <svg viewBox={`0 0 ${W} ${H}`} className="cl-spark" role="img" aria-label={`Used space over ${data.series.length} days`}>
                <path d={area} className="cl-spark-area" />
                <path d={path} className="cl-spark-line" />
              </svg>
            ) : (
              <p className="cl-meta cl-pad">The first snapshot is in. Come back tomorrow to see the trend.</p>
            )}
            {total > 0 && <FillBar value={last?.used ?? 0} max={total} size="sm" label="Used now" />}
          </div>
          <h2 className="cl-h3">Biggest growth this week</h2>
          {data.growth.length ? (
            <ul className="cl-growth">
              {data.growth.map((g) => (
                <li key={g.path}>
                  <span className="cl-mono cl-ellipsis">{g.path}</span>
                  <span className="cl-num cl-delta is-up">+{fmtSize(g.delta)}</span>
                  <button type="button" className="cl-icon-btn" aria-label={`Open ${g.path}`} onClick={() => onReveal(g.path)}>
                    <FolderOpen size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cl-meta">Map the drive a couple of times this week and the folders that grew show up here.</p>
          )}
        </>
      )}
    </section>
  );
};

export const DownloadsPanel: React.FC<{ items: Verdict[] | null; picked: string[]; onToggle: (p: string) => void; onBin: () => void; onReveal: (p: string) => void }> = ({ items, picked, onToggle, onBin, onReveal }) => {
  const size = (items ?? []).filter((v) => picked.includes(v.path)).reduce((a, v) => a + v.size, 0);
  return (
    <section className="cl-panel" aria-labelledby="cl-dl-title">
      <header className="cl-panel-head">
        <h1 id="cl-dl-title" className="cl-h2">
          <Sparkles size={18} aria-hidden /> What's safe to delete in Downloads?
        </h1>
        <p className="cl-sub">Lens checked each file on this PC by type, age and when you last opened it. These are suggestions: you confirm everything, and picks go to the Recycle Bin.</p>
      </header>
      {!items && (
        <div className="cl-pad cl-row-center">
          <Spinner /> <span className="cl-meta">Reading Downloads…</span>
        </div>
      )}
      {items && !items.length && <p className="cl-sub">Your Downloads folder is empty.</p>}
      {items && items.length > 0 && (
        <ul className="cl-review">
          {items.map((v, i) => (
            <li key={v.path} className={`cl-rv${v.suggest ? " is-suggest" : ""}`} style={{ ["--i" as string]: Math.min(i, 12) }}>
              <Check3 state={picked.includes(v.path) ? "checked" : "unchecked"} label={`Pick ${v.name}`} onToggle={() => onToggle(v.path)} />
              <span className="cl-rv-text">
                <span className="cl-rv-name">
                  {v.name} <span className="cl-chip is-static">{v.kind}</span>
                </span>
                <span className="cl-rv-reason">{v.reason}</span>
              </span>
              <span className="cl-meta">{ageLabel(v.ageDays)}</span>
              <span className="cl-num">{fmtSize(v.size)}</span>
              <button type="button" className="cl-icon-btn" aria-label={`Show ${v.name} in File Explorer`} onClick={() => onReveal(v.path)}>
                <ExternalLink size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 && (
        <footer className="cl-bar-sticky">
          <span className="cl-sel">
            <span className="cl-meta">{picked.length} PICKED</span>
            <span className="cl-num cl-strong">{fmtSize(size)}</span>
          </span>
          <button type="button" className="cl-btn is-primary" onClick={onBin}>
            <Trash2 size={14} aria-hidden /> Move to Recycle Bin
          </button>
        </footer>
      )}
    </section>
  );
};

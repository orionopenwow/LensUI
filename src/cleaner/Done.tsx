import React, { useEffect, useState } from "react";
import { Share2, X } from "lucide-react";
import { COPY, driveName, fmtScanTime, fmtSize } from "./model";
import { Ambient, CountSize, FillBar, Key } from "./ui";

export interface DoneInfo {
  freed: number;
  root: string;
  total: number;
  freeBefore: number;
  freeAfter: number;
  binned: number;
  skipped: [string, string][];
  /** How long the scan before this clean took, measured in Rust. */
  scanMs?: number;
}

/** Draws the "Share my result" card (1200×630 PNG) from the pack's own colours. Local only. */
export function drawShareCard(d: DoneInfo): string {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const g = c.getContext("2d");
  if (!g) return "";
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue("--lens-pack-base").trim() || "#09090b";
  const fg = cs.getPropertyValue("--lens-fg").trim() || "#fafafa";
  const muted = cs.getPropertyValue("--lens-fg-secondary").trim() || "#a1a1aa";
  const good = cs.getPropertyValue("--lens-positive").trim() || "#4ade80";
  const bad = cs.getPropertyValue("--lens-danger").trim() || "#fb7185";
  g.fillStyle = bg;
  g.fillRect(0, 0, 1200, 630);
  const glow = g.createRadialGradient(980, 80, 20, 980, 80, 520);
  glow.addColorStop(0, `${good}33`);
  glow.addColorStop(1, "transparent");
  g.fillStyle = glow;
  g.fillRect(0, 0, 1200, 630);
  const font = (w: number, px: number) => `${w} ${px}px "Segoe UI Variable Display", "Segoe UI", Arial, sans-serif`;
  g.fillStyle = muted;
  g.font = font(600, 26);
  g.fillText("LENS CLEANER", 80, 110);
  g.fillStyle = fg;
  g.font = font(700, 76);
  g.fillText(`I just freed ${fmtSize(d.freed)}`, 80, 220);
  g.fillStyle = muted;
  g.font = font(400, 32);
  g.fillText(`${driveName(d.root)} now has ${fmtSize(d.freeAfter)} free of ${fmtSize(d.total)}.`, 80, 280);
  const bar = (y: number, label: string, used: number, color: string) => {
    g.fillStyle = muted;
    g.font = font(600, 22);
    g.fillText(label, 80, y - 14);
    g.fillStyle = `${fg}1f`;
    g.beginPath();
    g.roundRect(80, y, 1040, 36, 18);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(80, y, Math.max(36, 1040 * (used / Math.max(1, d.total))), 36, 18);
    g.fill();
  };
  bar(380, "BEFORE", d.total - d.freeBefore, bad);
  bar(470, "AFTER", d.total - d.freeAfter, good);
  g.fillStyle = muted;
  g.font = font(400, 22);
  g.fillText("Nothing was deleted until I said so.", 80, 570);
  return c.toDataURL("image/png");
}

export const Done: React.FC<{ info: DoneInfo; onShare: (png: string) => void; onDone: () => void; showShare?: boolean }> = ({ info, onShare, onDone, showShare }) => {
  const [card, setCard] = useState<string | null>(null);
  // Bars start at the old value and glide to the new one.
  const [after, setAfter] = useState(info.freeBefore);
  useEffect(() => {
    const t = window.setTimeout(() => setAfter(info.freeAfter), 120);
    return () => window.clearTimeout(t);
  }, [info.freeAfter]);
  useEffect(() => {
    if (showShare) setCard(drawShareCard(info));
  }, [showShare, info]);
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCard(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card]);
  return (
    <section className="cl-done" aria-labelledby="cl-done-title">
      <Ambient mood="good" />
      <div className="cl-home-col is-center">
        <svg className="cl-done-check" viewBox="0 0 72 72" aria-hidden>
          <circle cx="36" cy="36" r="32" className="ring" />
          <path d="M22 37 l10 10 l19 -21" className="tick" />
        </svg>
        <h1 id="cl-done-title" className="cl-h1">
          You just freed <CountSize bytes={info.freed} className="cl-strong" duration={1100} />
        </h1>
        <p className="cl-sub" aria-live="polite">
          Your {driveName(info.root)} drive now has <span className="cl-num cl-strong">{fmtSize(info.freeAfter)}</span> free.
        </p>
        <div className="cl-ba">
          <div className="cl-ba-row">
            <span className="cl-meta">BEFORE</span>
            <FillBar value={info.total - info.freeBefore} max={info.total} tone="danger" size="md" label="Used before" />
            <span className="cl-num cl-muted">{fmtSize(info.freeBefore)} free</span>
          </div>
          <div className="cl-ba-row">
            <span className="cl-meta">AFTER</span>
            <FillBar value={info.total - after} max={info.total} tone="ok" size="md" label="Used now" />
            <span className="cl-num">{fmtSize(info.freeAfter)} free</span>
          </div>
        </div>
        {(info.binned > 0 || info.skipped.length > 0) && (
          <div className="cl-meta cl-done-notes">
            {info.binned > 0 && <>{info.binned} item{info.binned === 1 ? "" : "s"} went to the Recycle Bin. </>}
            {info.skipped.length > 0 && (
              <details className="cl-skipped">
                <summary>
                  {info.skipped.length} skipped (in use or changed since the scan)
                </summary>
                <ul>
                  {info.skipped.slice(0, 20).map(([p, why]) => (
                    <li key={p} className="cl-mono">
                      {p} — {why}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {info.scanMs !== undefined && info.scanMs > 0 && (
          <p className="cl-meta cl-done-scan">
            Scanned your PC in <span className="cl-num">{fmtScanTime(info.scanMs)}</span>
          </p>
        )}
        <div className="cl-home-actions">
          <button data-weight="medium" type="button" className="cl-btn is-ghost" onClick={() => setCard(drawShareCard(info))}>
            <Share2 size={15} aria-hidden /> Share my result
          </button>
          <button data-weight="heavy" type="button" className="cl-btn is-primary" onClick={onDone} autoFocus>
            Done <Key>Enter</Key>
          </button>
        </div>
      </div>
      {card && (
        <div className="cl-sheet-scrim" role="presentation" onClick={() => setCard(null)}>
          <div className="cl-sheet is-share" role="dialog" aria-modal="true" aria-label="Share my result" onClick={(e) => e.stopPropagation()}>
            <header className="cl-sheet-head">
              <span className="cl-h3">Share my result</span>
              <button data-weight="medium" type="button" className="cl-icon-btn" aria-label="Close" onClick={() => setCard(null)}>
                <X size={16} />
              </button>
            </header>
            <img className="cl-share-img" src={card} alt={`${COPY.doneTitle(fmtSize(info.freed))}. Before and after bars.`} />
            <p className="cl-meta">Made on this PC. Lens doesn't upload it; Windows' share sheet lets you pick where it goes.</p>
            <footer className="cl-sheet-foot">
              <button data-weight="heavy" type="button" className="cl-btn is-primary" onClick={() => onShare(card)}>
                <Share2 size={15} aria-hidden /> Share…
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
};

import React from "react";
import { HardDrive, Map as MapIcon, ScanSearch, ShieldCheck } from "lucide-react";
import { COPY, driveName, driveTone, fmtSize } from "./model";
import type { Overview } from "./types";
import { Ambient, FillBar, Key } from "./ui";

export const Home: React.FC<{ overview: Overview | null; error: string | null; onScan: () => void; onSpace: () => void; onOpen: (uri: string) => void }> = ({ overview, error, onScan, onSpace, onOpen }) => {
  const drives = overview?.drives ?? [];
  const sys = drives.find((d) => d.root.toUpperCase().startsWith("C")) ?? drives[0];
  const others = drives.filter((d) => d !== sys);
  const tone = sys ? driveTone(sys.total, sys.free) : "ok";
  return (
    <section className="cl-home" aria-labelledby="cl-home-title">
      <Ambient mood={tone === "danger" ? "warn" : "calm"} />
      <div className="cl-home-col">
        <h1 id="cl-home-title" className="cl-h1 cl-enter">
          {COPY.homeTitle}
        </h1>
        <p className="cl-sub cl-enter d1">{COPY.homeSub}</p>

        <div className="cl-drives cl-enter d2">
          {!overview && (
            <div className="cl-drive is-primary" aria-busy="true">
              <span className="cl-skel w40" />
              <span className="cl-skel w60" />
              <span className="cl-skel bar" />
            </div>
          )}
          {sys && (
            <div className={`cl-drive is-primary is-${driveTone(sys.total, sys.free)}`}>
              <div className="cl-drive-head">
                <span className="cl-drive-icon" aria-hidden>
                  <HardDrive size={18} strokeWidth={2.2} />
                </span>
                <span className="cl-drive-name">Local Disk ({driveName(sys.root)})</span>
                {tone === "danger" && <span className="cl-pill is-danger">Almost full</span>}
                {tone === "warn" && <span className="cl-pill is-warn">Getting full</span>}
              </div>
              <div className="cl-drive-free">
                <span className="cl-num cl-big">{fmtSize(sys.free)}</span>
                <span className="cl-muted"> free of {fmtSize(sys.total)}</span>
              </div>
              <FillBar value={sys.total - sys.free} max={sys.total} tone={tone === "ok" ? "ink" : tone} size="lg" label={`${driveName(sys.root)} used`} />
            </div>
          )}
          {others.map((d) => (
            <div key={d.root} className={`cl-drive is-row is-${driveTone(d.total, d.free)}`}>
              <span className="cl-drive-name">
                <HardDrive size={14} strokeWidth={2.2} aria-hidden /> {driveName(d.root)}
              </span>
              <FillBar value={d.total - d.free} max={d.total} tone={driveTone(d.total, d.free) === "ok" ? "ink" : driveTone(d.total, d.free)} size="sm" label={`${driveName(d.root)} used`} />
              <span className="cl-num cl-muted">
                {fmtSize(d.free)} free of {fmtSize(d.total)}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="cl-error cl-enter" role="alert">
            <span>{error}</span>
            <button type="button" className="cl-btn is-ghost" onClick={onScan}>
              Try again
            </button>
          </div>
        )}

        <div className="cl-home-actions cl-enter d3">
          <button type="button" className="cl-btn is-primary is-xl" onClick={onScan} autoFocus>
            <ScanSearch size={17} strokeWidth={2.4} aria-hidden /> Scan my PC <Key>Enter</Key>
          </button>
          <button type="button" className="cl-btn is-ghost" onClick={onSpace}>
            <MapIcon size={15} aria-hidden /> Space map
          </button>
        </div>
        <p className="cl-note cl-enter d3">
          <ShieldCheck size={13} aria-hidden /> {COPY.scanNote}
        </p>
        {overview?.storageSense != null && (
          <p className="cl-meta cl-enter d4">
            Windows Storage Sense is {overview.storageSense ? "on" : "off"} ·{" "}
            <button type="button" className="cl-link" onClick={() => onOpen("ms-settings:storagesense")}>
              Storage Sense settings
            </button>
          </p>
        )}
      </div>
    </section>
  );
};

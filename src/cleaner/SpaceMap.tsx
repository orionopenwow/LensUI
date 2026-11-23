// Space map: drill down folder by folder as a list, a squarified treemap or a DaisyDisk-style
// sunburst, with "Biggest files" on the side. Everything is keyboard navigable; locked system
// items are dimmed and can't be selected. Picks go to the Recycle Bin (via the approval card).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, ChevronRight, File, Folder, FolderOpen, HardDrive, LayoutGrid, List, Lock, PieChart, RotateCw, Trash2 } from "lucide-react";
import { arcPath, driveName, fmtSize, neighbour, pct, ringSiblings, squarify, sunburst, type Arc } from "./model";
import type { DriveUsage, SpaceNode, SpaceProgress, SpaceSummary, SpaceView } from "./types";
import { Check3, CountSize, FillBar, Key, Ring, Spinner } from "./ui";

export type MapView = "list" | "treemap" | "sunburst";
export const TYPE_FILTERS: [string, string][] = [
  ["all", "All"],
  ["video", "Videos"],
  ["archive", "Archives"],
  ["installer", "Installers"],
  ["disk", "Disk images"],
  ["image", "Pictures"],
  ["other", "Other"],
];

export interface SpaceProps {
  drives: DriveUsage[];
  root: string;
  summary: SpaceSummary | null;
  progress: SpaceProgress | null;
  view: SpaceView | null;
  nested: SpaceNode[] | null;
  biggest: SpaceNode[];
  filter: string;
  mode: MapView;
  selected: string[];
  moving: { path: string; done: number; total: number } | null;
  onRoot: (root: string) => void;
  onRescan: () => void;
  onOpenNode: (id: number) => void;
  onMode: (m: MapView) => void;
  onFilter: (f: string) => void;
  onToggle: (path: string) => void;
  onReveal: (path: string) => void;
  onBin: (paths: string[], permanent: boolean) => void;
  onMove: (path: string, destRoot: string) => void;
  onCancel: () => void;
}

const NodeIcon: React.FC<{ n: SpaceNode }> = ({ n }) =>
  n.kind === "locked" || n.kind === "denied" ? <Lock size={14} aria-hidden /> : n.kind === "dir" ? <Folder size={14} aria-hidden /> : <File size={14} aria-hidden />;

const selectable = (n: SpaceNode) => n.kind !== "locked" && n.kind !== "denied" && n.note !== "smaller" && n.id >= 0;

const ListView: React.FC<SpaceProps & { parentSize: number }> = (p) => {
  const kids = p.view?.children ?? [];
  const [focus, setFocus] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => setFocus(0), [p.view?.node.id]);
  const onKey = (e: React.KeyboardEvent, n: SpaceNode, i: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const j = Math.max(0, Math.min(kids.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      setFocus(j);
      refs.current[j]?.focus();
    } else if ((e.key === "Enter" || e.key === "ArrowRight") && n.kind === "dir" && n.hasChildren) {
      p.onOpenNode(n.id);
    } else if (e.key === " " && selectable(n)) {
      e.preventDefault();
      p.onToggle(n.path);
    }
  };
  return (
    <div className="cl-list" role="grid" aria-label="Folders and files, biggest first">
      {kids.map((n, i) => (
        <div
          key={`${n.id}-${n.name}`}
          ref={(el) => (refs.current[i] = el)}
          role="row"
          tabIndex={focus === i ? 0 : -1}
          className={`cl-lrow is-${n.kind}${n.note === "smaller" ? " is-smaller" : ""}${p.selected.includes(n.path) ? " is-on" : ""}`}
          onKeyDown={(e) => onKey(e, n, i)}
          onFocus={() => setFocus(i)}
          onDoubleClick={() => n.kind === "dir" && n.hasChildren && p.onOpenNode(n.id)}
          draggable={n.kind === "file" && n.size > 100_000_000}
          onDragStart={(e) => e.dataTransfer.setData("text/lens-path", n.path)}
          style={{ ["--i" as string]: Math.min(i, 12) }}
        >
          <span role="gridcell" className="cl-lcheck">
            {selectable(n) ? <Check3 state={p.selected.includes(n.path) ? "checked" : "unchecked"} label={`Select ${n.name}`} onToggle={() => p.onToggle(n.path)} /> : <span className="cl-check-spacer" />}
          </span>
          <span role="gridcell" className="cl-lname">
            <NodeIcon n={n} />
            {n.kind === "dir" && n.hasChildren ? (
              <button type="button" className="cl-lname-btn" onClick={() => p.onOpenNode(n.id)}>
                {n.name}
              </button>
            ) : (
              <span>{n.name}</span>
            )}
            {n.note && n.note !== "smaller" && <span className="cl-lnote cl-meta">hard links · real use is smaller</span>}
            {n.kind === "locked" && <span className="cl-lnote cl-meta">Windows</span>}
          </span>
          <span role="gridcell" className="cl-lbar">
            <FillBar value={n.size} max={p.parentSize} size="sm" label={`${n.name} share`} />
          </span>
          <span role="gridcell" className="cl-num cl-lsize">
            {fmtSize(n.size)}
          </span>
          <span role="gridcell" className="cl-num cl-lpct cl-meta">
            {pct(n.size, p.parentSize).toFixed(1)}%
          </span>
          <span role="gridcell" className="cl-lact">
            {n.path && (
              <button type="button" className="cl-icon-btn" aria-label={`Open ${n.name} in File Explorer`} onClick={() => p.onReveal(n.path)}>
                <FolderOpen size={13} />
              </button>
            )}
          </span>
        </div>
      ))}
      {!kids.length && <div className="cl-meta cl-pad">This folder is empty.</div>}
    </div>
  );
};

const TreemapView: React.FC<SpaceProps> = (p) => {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 420 });
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth || 640, h: el.clientHeight || 420 });
    return () => ro.disconnect();
  }, []);
  const kids = p.view?.children ?? [];
  const cells = useMemo(() => squarify<SpaceNode>(kids, (n: SpaceNode) => n.size, { x: 0, y: 0, w: size.w, h: size.h }), [kids, size]);
  const [focus, setFocus] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => setFocus(0), [p.view?.node.id]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const)[e.key as "ArrowLeft"];
    if (dir) {
      e.preventDefault();
      const j = neighbour(cells, i, dir);
      setFocus(j);
      refs.current[j]?.focus();
    }
  };
  const max = cells[0]?.item.size ?? 1;
  return (
    <div className="cl-treemap" ref={box} role="group" aria-label="Treemap: area is size. Arrow keys move, Enter opens.">
      {cells.map((c, i) => {
        const n = c.item;
        const shade = 0.08 + 0.32 * Math.sqrt(n.size / max);
        const big = c.w > 84 && c.h > 40;
        return (
          <button
            key={`${n.id}-${n.name}`}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            tabIndex={focus === i ? 0 : -1}
            className={`cl-tm is-${n.kind}${n.note === "smaller" ? " is-smaller" : ""}${p.selected.includes(n.path) ? " is-on" : ""}`}
            style={{ left: c.x, top: c.y, width: Math.max(0, c.w - 3), height: Math.max(0, c.h - 3), ["--shade" as string]: shade, ["--i" as string]: Math.min(i, 14) }}
            aria-label={`${n.name}, ${fmtSize(n.size)}`}
            onKeyDown={(e) => onKey(e, i)}
            onFocus={() => setFocus(i)}
            onClick={() => (n.kind === "dir" && n.hasChildren ? p.onOpenNode(n.id) : selectable(n) && p.onToggle(n.path))}
          >
            {big && (
              <>
                <span className="cl-tm-name">{n.name}</span>
                <span className="cl-tm-size cl-num">{fmtSize(n.size)}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
};

const SunburstView: React.FC<SpaceProps> = (p) => {
  const S = 420;
  const node = p.view?.node;
  const arcs = useMemo(() => (node ? sunburst(p.nested ?? p.view?.children ?? [], node.size, { inner: 62, ring: 46, depth: 3, minAngle: 0.014 }) : []), [p.nested, p.view, node]);
  const [hover, setHover] = useState<Arc | null>(null);
  const [focus, setFocus] = useState<number>(-1);
  const refs = useRef<(SVGPathElement | null)[]>([]);
  useEffect(() => {
    setFocus(-1);
    setHover(null);
  }, [node?.id]);
  const shown = hover?.node ?? node;
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const a = arcs[i];
    const sib = ringSiblings(arcs, a);
    const k = sib.indexOf(a);
    let next: Arc | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = sib[(k + 1) % sib.length];
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = sib[(k - 1 + sib.length) % sib.length];
    if (e.key === "Enter" && a.node.kind === "dir" && a.node.id >= 0) p.onOpenNode(a.node.id);
    if (next) {
      e.preventDefault();
      const j = arcs.indexOf(next);
      setFocus(j);
      setHover(next);
      refs.current[j]?.focus();
    }
  };
  const c = S / 2;
  return (
    <div className="cl-sun">
      <svg viewBox={`0 0 ${S} ${S}`} className="cl-sun-svg" role="group" aria-label="Sunburst: each ring is one level deeper. Arrow keys move around a ring, Enter opens, Backspace goes up.">
        {arcs.map((a, i) => {
          const depthShade = a.small ? 0.1 : 0.62 - a.depth * 0.16;
          return (
            <path
              key={`${a.depth}-${a.node.id}-${a.a0.toFixed(4)}`}
              ref={(el) => (refs.current[i] = el)}
              d={arcPath(c, c, a.r0, a.r1, a.a0, a.a1)}
              className={`cl-arc is-${a.node.kind}${a.small ? " is-small" : ""}${hover === a ? " is-hot" : ""}`}
              style={{ ["--shade" as string]: depthShade, ["--d" as string]: a.depth }}
              tabIndex={a.depth === 0 && (focus === i || (focus < 0 && i === 0)) ? 0 : focus === i ? 0 : -1}
              role="button"
              aria-label={`${a.node.name}, ${fmtSize(a.node.size)}`}
              onMouseEnter={() => setHover(a)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => {
                setFocus(i);
                setHover(a);
              }}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => a.node.kind === "dir" && a.node.id >= 0 && p.onOpenNode(a.node.id)}
            />
          );
        })}
        <circle
          cx={c}
          cy={c}
          r={56}
          className="cl-sun-core"
          role="button"
          tabIndex={0}
          aria-label="Up one level"
          onClick={() => {
            const crumbs = p.view?.crumbs ?? [];
            if (crumbs.length > 1) p.onOpenNode(crumbs[crumbs.length - 2].id);
          }}
        />
        <text x={c} y={c - 4} textAnchor="middle" className="cl-sun-label">
          {(shown?.name ?? "").slice(0, 18)}
        </text>
        <text x={c} y={c + 16} textAnchor="middle" className="cl-sun-size">
          {shown ? fmtSize(shown.size) : ""}
        </text>
      </svg>
    </div>
  );
};

export const SpaceMap: React.FC<SpaceProps> = (p) => {
  const node = p.view?.node;
  const crumbs = p.view?.crumbs ?? [];
  const others = p.drives.filter((d) => d.root !== p.root);
  const selSize = useMemo(() => {
    const all = [...(p.view?.children ?? []), ...p.biggest];
    return p.selected.reduce((a, path) => a + (all.find((n) => n.path === path)?.size ?? 0), 0);
  }, [p.selected, p.view, p.biggest]);
  const [dropHot, setDropHot] = useState(false);
  const back = useCallback(() => {
    if (crumbs.length > 1) p.onOpenNode(crumbs[crumbs.length - 2].id);
  }, [crumbs, p]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Backspace" && !/INPUT|TEXTAREA/.test((e.target as HTMLElement)?.tagName ?? "")) {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  const scanning = !p.summary || (p.progress && !p.view);
  return (
    <section className="cl-space" aria-labelledby="cl-space-title">
      <header className="cl-space-head">
        <h1 id="cl-space-title" className="cl-sr">
          Space map
        </h1>
        <div className="cl-pills" role="tablist" aria-label="Drive">
          {p.drives.map((d) => (
            <button key={d.root} type="button" role="tab" aria-selected={d.root === p.root} className={`cl-dpill${d.root === p.root ? " is-on" : ""}`} onClick={() => p.onRoot(d.root)}>
              <HardDrive size={13} aria-hidden /> {driveName(d.root)} <span className="cl-meta cl-num">{fmtSize(d.total - d.free)}</span>
            </button>
          ))}
        </div>
        <div className="cl-seg" role="tablist" aria-label="View">
          {(
            [
              ["list", List, "List"],
              ["treemap", LayoutGrid, "Treemap"],
              ["sunburst", PieChart, "Sunburst"],
            ] as const
          ).map(([m, I, label]) => (
            <button key={m} type="button" role="tab" aria-selected={p.mode === m} className={p.mode === m ? "is-on" : ""} onClick={() => p.onMode(m)}>
              <I size={13} aria-hidden /> {label}
            </button>
          ))}
        </div>
        <button type="button" className="cl-btn is-ghost is-sm" onClick={p.onRescan}>
          <RotateCw size={13} aria-hidden /> Rescan
        </button>
      </header>

      {scanning ? (
        <div className="cl-space-scan" aria-busy="true" aria-live="polite">
          <Spinner size={22} />
          <p className="cl-h3">Mapping {driveName(p.root)}…</p>
          <p className="cl-sub">
            <CountSize bytes={p.progress?.bytes ?? 0} duration={200} /> in <span className="cl-num">{(p.progress?.files ?? 0).toLocaleString()}</span> files so far
          </p>
          <p className="cl-meta cl-mono cl-ellipsis">{p.progress?.current ?? ""}</p>
          <button type="button" className="cl-btn is-ghost is-sm" onClick={p.onCancel}>
            Stop <Key>Esc</Key>
          </button>
        </div>
      ) : (
        <div className="cl-space-body">
          <div className="cl-space-main">
            <nav className="cl-crumbs" aria-label="Folder path">
              {crumbs.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 && <ChevronRight size={12} aria-hidden />}
                  <button type="button" className={`cl-crumb${i === crumbs.length - 1 ? " is-here" : ""}`} aria-current={i === crumbs.length - 1 ? "location" : undefined} onClick={() => p.onOpenNode(c.id)}>
                    {i === 0 ? driveName(c.name) : c.name}
                  </button>
                </React.Fragment>
              ))}
              <span className="cl-crumb-size cl-num cl-meta">{node ? fmtSize(node.size) : ""}</span>
            </nav>
            {p.mode === "list" && <ListView {...p} parentSize={node?.size ?? 1} />}
            {p.mode === "treemap" && <TreemapView {...p} />}
            {p.mode === "sunburst" && <SunburstView {...p} />}
            {p.summary && (
              <p className="cl-meta cl-space-foot">
                Mapped <span className="cl-num">{p.summary.files.toLocaleString()}</span> files in <span className="cl-num">{(p.summary.elapsedMs / 1000).toFixed(1)} s</span>
                {p.summary.cloudOnly > 0 ? ` · ${fmtSize(p.summary.cloudOnly)} in the cloud (takes no space here)` : ""}
              </p>
            )}
          </div>

          <aside className="cl-biggest" aria-labelledby="cl-big-title">
            <h2 id="cl-big-title" className="cl-h3">
              Biggest files
            </h2>
            <p className="cl-meta">THE SINGLE FILES TAKING UP THE MOST ROOM</p>
            <div className="cl-chips" role="radiogroup" aria-label="File type">
              {TYPE_FILTERS.map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={p.filter === id} className={`cl-chip${p.filter === id ? " is-on" : ""}`} onClick={() => p.onFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <ul className="cl-big-list">
              {p.biggest.map((n) => (
                <li key={n.path} className={`cl-big-row${p.selected.includes(n.path) ? " is-on" : ""}`} draggable onDragStart={(e) => e.dataTransfer.setData("text/lens-path", n.path)}>
                  <Check3 state={p.selected.includes(n.path) ? "checked" : "unchecked"} label={`Select ${n.name}`} onToggle={() => p.onToggle(n.path)} />
                  <span className="cl-big-text">
                    <span className="cl-big-name">{n.name}</span>
                    <span className="cl-big-path cl-mono">{n.path.replace(/[\\/][^\\/]*$/, "")}</span>
                  </span>
                  <span className="cl-num cl-big-size">{fmtSize(n.size)}</span>
                  <button type="button" className="cl-icon-btn" aria-label={`Show ${n.name} in File Explorer`} onClick={() => p.onReveal(n.path)}>
                    <FolderOpen size={13} />
                  </button>
                </li>
              ))}
              {!p.biggest.length && <li className="cl-meta cl-pad">No files of this type over 1 MB.</li>}
            </ul>
            {others.length > 0 && (
              <div
                className={`cl-tray${dropHot ? " is-hot" : ""}${p.moving ? " is-busy" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropHot(true);
                }}
                onDragLeave={() => setDropHot(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropHot(false);
                  const path = e.dataTransfer.getData("text/lens-path");
                  if (path) p.onMove(path, others[0].root);
                }}
                aria-label={`Drop a big file here to move it to ${driveName(others[0].root)}`}
              >
                {p.moving ? (
                  <>
                    <Ring value={p.moving.total ? p.moving.done / p.moving.total : 0} label="Moving" />
                    <span>
                      Moving <strong>{p.moving.path.split(/[\\/]/).pop()}</strong> · <span className="cl-num">{fmtSize(p.moving.done)}</span> of <span className="cl-num">{fmtSize(p.moving.total)}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <ArrowRightLeft size={16} aria-hidden />
                    <span>
                      Drag a big file here to <strong>move it to {driveName(others[0].root)}</strong>
                      <span className="cl-meta"> · {fmtSize(others[0].free)} free there</span>
                    </span>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {p.selected.length > 0 && (
        <footer className="cl-bar-sticky is-space">
          <span className="cl-sel">
            <span className="cl-meta">{p.selected.length} SELECTED</span>
            <span className="cl-num cl-strong">{fmtSize(selSize)}</span>
          </span>
          {others.length > 0 && p.selected.length === 1 && (
            <button type="button" className="cl-btn is-ghost" onClick={() => p.onMove(p.selected[0], others[0].root)}>
              <ArrowRightLeft size={14} aria-hidden /> Move to {driveName(others[0].root)}
            </button>
          )}
          <button type="button" className="cl-btn is-ghost is-danger-text" onClick={() => p.onBin(p.selected, true)}>
            Delete for good…
          </button>
          <button type="button" className="cl-btn is-primary" onClick={() => p.onBin(p.selected, false)}>
            <Trash2 size={14} aria-hidden /> Move to Recycle Bin
          </button>
        </footer>
      )}
    </section>
  );
};

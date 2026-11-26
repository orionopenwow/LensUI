// Lens Monitor: live CPU / memory / GPU / disk / network, processes grouped by app, and
// plain-English "What's slowing my PC" hints. Samples once a second, only while visible.
import React, { useCallback, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppGroup, CoreMonitorSample, LensConfig } from "../../types/generated";
import { AppShell, isKey, usePresence } from "../shell/AppShell";
import { AppIcon } from "../shell/AppIcon";
import { Button, Card, Confirm, ErrorNote, Hero, Pill, Search, Skeleton, Sparkline, Toast, cx } from "../shell/ui";
import { useVisiblePoll } from "../shell/hooks";
import { bitsPerSec, bytes, pct, plural } from "../shell/format";
import { cpuShare, filled, headlineCpu, processLine, push, slowHints, sortApps, type SortKey } from "../models/monitor";
import { friendlyError } from "../models/load";
import { coreApp } from "../registry";

interface Hist {
  cpu: (number | null)[];
  mem: (number | null)[];
  gpu: (number | null)[];
  disk: (number | null)[];
  net: (number | null)[];
}
const H0: Hist = { cpu: [], mem: [], gpu: [], disk: [], net: [] };

export const Monitor: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void>; demo?: { sample: CoreMonitorSample; hist: Hist } }> = ({ config, updateConfig, demo }) => {
  const app = coreApp("monitor")!;
  const [sample, setSample] = useState<CoreMonitorSample | null>(demo?.sample ?? null);
  const [hist, setHist] = useState<Hist>(demo?.hist ?? H0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("cpu");
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AppGroup | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);
  const presence = usePresence();

  const tick = useCallback(() => {
    if (demo) return;
    invoke<CoreMonitorSample>("coreapp_monitor_sample")
      .then((s) => {
        setSample(s);
        setError(null);
        setHist((h) => ({
          cpu: push(h.cpu, s.telemetry.cpuUsage),
          mem: push(h.mem, s.telemetry.memPercent),
          gpu: push(h.gpu, s.perf.gpuPct),
          disk: push(h.disk, s.perf.diskReadBps != null ? (s.perf.diskReadBps ?? 0) + (s.perf.diskWriteBps ?? 0) : null),
          net: push(h.net, s.perf.netRxBps != null ? (s.perf.netRxBps ?? 0) + (s.perf.netTxBps ?? 0) : null),
        }));
      })
      .catch((e) => setError(friendlyError(String(e))));
  }, [demo]);
  useVisiblePoll(tick, 1000, !demo);

  const apps = useMemo(() => (sample ? sortApps(sample.apps, sort, query) : []), [sample, sort, query]);
  const hints = useMemo(() => (sample ? slowHints(sample, hist.cpu) : []), [sample, hist.cpu]);
  const selected = apps.find((a) => a.name === sel) ?? null;
  const cores = sample?.cpuCount ?? 1;
  const cpuNow = headlineCpu(hist.cpu);
  const top = hints[0];

  const endTask = async (a: AppGroup) => {
    const res = await presence.run(`Ending ${a.name}`, endRef.current, () => invoke<string>("coreapp_end_task", { name: a.name, pids: a.pids }));
    if (res) setToast({ text: res, tone: "ok" });
  };

  const move = (d: number) => {
    if (!apps.length) return;
    const i = Math.max(0, apps.findIndex((a) => a.name === sel));
    const n = Math.max(0, Math.min(apps.length - 1, (sel ? i + d : 0)));
    setSel(apps[n].name);
    document.getElementById(`mon-row-${n}`)?.scrollIntoView({ block: "nearest" });
  };

  const copySelected = () => {
    if (!selected) return;
    const line = processLine({ name: selected.name, pids: selected.pids, cpu: cpuShare(selected.cpu, cores), memMb: selected.memoryMb, path: selected.exe });
    navigator.clipboard
      .writeText(line)
      .then(() => setToast({ text: `Copied: ${line}`, tone: "ok" }))
      .catch(() => setToast({ text: "Couldn't copy to the clipboard.", tone: "bad" }));
  };

  const keys = [
    { keys: "Ctrl+F", label: "Search apps", match: (e: KeyboardEvent) => isKey(e, "f", { ctrl: true }), run: () => searchRef.current?.focus() },
    { keys: "↑+↓", label: "Move through apps (in the list)" },
    { keys: "Ctrl+C", label: "Copy the selected app's line (name, PID, usage)", match: (e: KeyboardEvent) => isKey(e, "c", { ctrl: true }) && !window.getSelection()?.toString() && !(e.target as HTMLElement | null)?.closest?.("input, textarea"), run: () => copySelected() },
    { keys: "Delete", label: "End the selected app (asks first)", match: (e: KeyboardEvent) => e.key === "Delete", run: () => selected && !selected.protected && setConfirm(selected) },
    { keys: "1+2+3+4", label: "Sort by CPU, memory, disk, name (in the list)" },
  ];
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    }
    const k = ({ "1": "cpu", "2": "memory", "3": "disk", "4": "name" } as Record<string, SortKey>)[e.key];
    if (k) setSort(k);
  };

  const stat = (label: string, value: string, sub: string, series: (number | null)[], max?: number, unknown?: boolean) => (
    <Card className="ca-stat-card">
      <div className="ca-stat">
        <div className="ca-stat-label">
          <span>{label}</span>
          <span className="ca-mono">{sub}</span>
        </div>
        <div className="ca-stat-value">{unknown ? <span className="ca-muted">—</span> : value}</div>
        <Sparkline values={filled(series)} max={max} label={`${label} over the last minute`} />
      </div>
    </Card>
  );

  const sortBtn = (k: SortKey, label: string) => (
    <button type="button" aria-sort={sort === k ? "descending" : "none"} onClick={() => setSort(k)}>
      {label}
      {sort === k ? " ↓" : ""}
    </button>
  );

  return (
    <AppShell
      app={app}
      config={config}
      updateConfig={updateConfig}
      keys={keys}
      working={presence.busy}
      meta={sample ? `${plural(sample.processCount, "process", "processes")} · ${cores} cores · sampled every second · paused while hidden` : "Starting…"}
      actions={
        <>
          <button type="button" className="ca-btn" disabled={!selected} onClick={copySelected}>
            Copy line
          </button>
        <button
          ref={endRef}
          type="button"
          className="ca-btn ca-btn-primary"
          disabled={!selected || selected.protected}
          onClick={() => selected && setConfirm(selected)}
          aria-describedby={selected?.protected ? "mon-protected" : undefined}
        >
          {selected ? `End ${selected.name}` : "End task"}
        </button>
        </>
      }
    >
      {error && !sample && <ErrorNote onRetry={tick}>{error}</ErrorNote>}
      {!sample && !error && <Skeleton rows={6} />}
      {sample && (
        <>
          <Hero
            title="Processor"
            value={`${cpuNow}`}
            valueText={`${cpuNow}%`}
            unit="%"
            tone={cpuNow >= 85 ? "bad" : cpuNow >= 60 ? "warn" : undefined}
            subtitle={top ? (top.id === "ok" ? top.title + "." : `${top.title}. ${top.body}`) : undefined}
            aside={<Pill tone={top?.tone === "ok" ? "ok" : top?.tone}>{top?.tone === "ok" ? "All good" : top?.tone === "bad" ? "Slow" : "Busy"}</Pill>}
          />
          {error && <ErrorNote onRetry={tick}>{error}</ErrorNote>}
          <div className="ca-grid stats">
            {stat("CPU", pct(sample.telemetry.cpuUsage), `${cores} cores`, hist.cpu, 100)}
            {stat("Memory", `${sample.telemetry.memUsedGb.toFixed(1)} GB`, `of ${sample.telemetry.memTotalGb.toFixed(0)} GB`, hist.mem, 100)}
            {stat("GPU", pct(sample.perf.gpuPct), "busiest engine", hist.gpu, 100, sample.perf.gpuPct == null)}
            {stat("Disk", `${bytes((sample.perf.diskReadBps ?? 0) + (sample.perf.diskWriteBps ?? 0))}/s`, sample.perf.diskBusyPct != null ? `${Math.round(sample.perf.diskBusyPct)}% busy` : "all disks", hist.disk, undefined, sample.perf.diskReadBps == null)}
            {stat("Network", bitsPerSec((sample.perf.netRxBps ?? 0) + (sample.perf.netTxBps ?? 0)), `↓ ${bitsPerSec(sample.perf.netRxBps)}`, hist.net, undefined, sample.perf.netRxBps == null)}
          </div>
          <Card title="What's slowing my PC" meta="last 10 seconds" guide="coreapp.monitor.hints">
            <ul className="ca-list">
              {hints.map((h) => (
                <li key={h.id} className="ca-item">
                  <Pill tone={h.tone}>{h.tone === "ok" ? "OK" : h.tone === "bad" ? "Now" : "Tip"}</Pill>
                  <div className="ca-item-main">
                    <div className="ca-item-title">{h.title}</div>
                    <div className="ca-item-sub" style={{ whiteSpace: "normal" }}>
                      {h.body}
                    </div>
                  </div>
                  {h.app && (
                    <Button small onClick={() => (setQuery(""), setSel(h.app!))}>
                      Show
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Apps and background processes" meta={`${apps.length} shown`} actions={<Search value={query} onChange={setQuery} placeholder="Search apps or PID" inputRef={searchRef} />}>
            <div className="ca-table-head" role="presentation">
              <span style={{ flex: 1 }}>{sortBtn("name", "Name")}</span>
              {sortBtn("cpu", "CPU")}
              {sortBtn("memory", "Memory")}
              {sortBtn("disk", "Disk")}
            </div>
            {apps.length === 0 ? (
              <p className="ca-muted" style={{ padding: 8 }}>
                Nothing matches “{query}”.
              </p>
            ) : (
              <ul className="ca-list" role="listbox" aria-label="Apps" tabIndex={0} onKeyDown={onListKey} aria-activedescendant={sel ? `mon-row-${apps.findIndex((a) => a.name === sel)}` : undefined}>
                {apps.slice(0, 200).map((a, i) => (
                  <li
                    key={a.name}
                    id={`mon-row-${i}`}
                    role="option"
                    aria-selected={a.name === sel}
                    aria-disabled={a.protected}
                    className={cx("ca-item", a.name === sel && "selected", a.protected && "disabled")}
                    onClick={() => setSel(a.name)}
                    onDoubleClick={() => !a.protected && setConfirm(a)}
                  >
                    <AppIcon exe={a.exe} name={a.name} />
                    <div className="ca-item-main">
                      <div className="ca-item-title">{a.name}</div>
                      <div className="ca-item-sub">
                        {a.pids.length > 1 ? `${a.pids.length} processes` : `PID ${a.pids[0]}`}
                        {a.protected ? " · part of Windows or Lens" : ""}
                      </div>
                    </div>
                    <span className="ca-item-num">{cpuShare(a.cpu, cores).toFixed(1)}%</span>
                    <span className="ca-item-num">{a.memoryMb >= 1024 ? `${(a.memoryMb / 1024).toFixed(1)} GB` : `${Math.round(a.memoryMb)} MB`}</span>
                    <span className="ca-item-num">{a.diskBps > 0 ? `${bytes(a.diskBps)}/s` : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
            {selected?.protected && (
              <p id="mon-protected" className="ca-note" style={{ marginTop: 8 }}>
                <strong>{selected.name}</strong> is part of Windows or Lens. Ending it could log you out or crash Windows, so Lens doesn't offer it.
              </p>
            )}
          </Card>
        </>
      )}
      {confirm && (
        <Confirm
          title={`End ${confirm.name}?`}
          body={
            <>
              <p>
                This closes {confirm.pids.length > 1 ? `all ${confirm.pids.length} of its processes` : "it"} straight away. Anything unsaved in {confirm.name} will be lost.
              </p>
              <p className="ca-mono">PID {confirm.pids.slice(0, 8).join(", ")}{confirm.pids.length > 8 ? "…" : ""}</p>
            </>
          }
          confirmLabel="End task"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const a = confirm;
            setConfirm(null);
            endTask(a).catch((e) => setToast({ text: friendlyError(String(e)), tone: "bad" }));
          }}
        />
      )}
      <Toast text={toast?.text ?? null} tone={toast?.tone} onDone={() => setToast(null)} />
    </AppShell>
  );
};

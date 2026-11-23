// Lens Monitor: history buffers, sorting and the plain-English "What's slowing my PC" hints. Pure.
import type { AppGroup, CoreMonitorSample } from "../../types/generated";

export const HISTORY = 60;

/** Appends to a fixed-length history (oldest first). `null` (unknown) is kept as a gap. */
export function push(hist: (number | null)[], v: number | null | undefined, max = HISTORY): (number | null)[] {
  const next = [...hist, v ?? null];
  return next.length > max ? next.slice(next.length - max) : next;
}

export const filled = (h: (number | null)[]) => h.map((v) => v ?? 0);

export type SortKey = "cpu" | "memory" | "disk" | "name";

export function sortApps(apps: AppGroup[], key: SortKey, query = ""): AppGroup[] {
  const q = query.trim().toLowerCase();
  const list = q ? apps.filter((a) => a.name.toLowerCase().includes(q) || a.pids.some((p) => String(p) === q)) : apps.slice();
  const by: Record<SortKey, (a: AppGroup, b: AppGroup) => number> = {
    cpu: (a, b) => b.cpu - a.cpu || b.memoryMb - a.memoryMb,
    memory: (a, b) => b.memoryMb - a.memoryMb,
    disk: (a, b) => b.diskBps - a.diskBps || b.cpu - a.cpu,
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  };
  return list.sort(by[key]);
}

/** Per-process CPU from sysinfo is "% of one core"; show it as a share of the whole PC. */
export const cpuShare = (cpu: number, cores: number) => Math.min(100, cpu / Math.max(1, cores));

export interface Hint {
  id: string;
  tone: "ok" | "warn" | "bad";
  title: string;
  body: string;
  /** The app the hint is about, when there is one (the row gets highlighted). */
  app?: string;
}

const avg = (h: (number | null)[], n: number) => {
  const xs = h.slice(-n).filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
};

/**
 * Plain-English reasons the PC may feel slow, worst first. Based on the last ~10 samples so a
 * one-second spike doesn't raise an alarm.
 */
export function slowHints(s: CoreMonitorSample, cpuHist: (number | null)[], now = Date.now()): Hint[] {
  void now;
  const out: Hint[] = [];
  const cores = s.cpuCount || 1;
  const top = (key: (a: AppGroup) => number) => s.apps.filter((a) => !a.protected).sort((a, b) => key(b) - key(a))[0];
  const cpu = avg(cpuHist, 10);
  if (cpu >= 85) {
    const t = top((a) => a.cpu);
    out.push({
      id: "cpu",
      tone: "bad",
      title: "The processor is flat out",
      body: t ? `${t.name} is using about ${Math.round(cpuShare(t.cpu, cores))}% of it. Closing it will help most.` : "Something is keeping every core busy.",
      app: t?.name,
    });
  } else if (cpu >= 60) {
    const t = top((a) => a.cpu);
    out.push({ id: "cpu", tone: "warn", title: "The processor is busy", body: t ? `${t.name} is the busiest app right now.` : "Several apps are busy at once.", app: t?.name });
  }
  const mem = s.telemetry.memPercent;
  if (mem >= 90) {
    const t = top((a) => a.memoryMb);
    out.push({
      id: "mem",
      tone: "bad",
      title: "Memory is almost full",
      body: `Windows is moving things to disk, which feels slow.${t ? ` ${t.name} holds ${(t.memoryMb / 1024).toFixed(1)} GB.` : ""}`,
      app: t?.name,
    });
  } else if (mem >= 80) {
    const t = top((a) => a.memoryMb);
    out.push({ id: "mem", tone: "warn", title: "Memory is getting full", body: t ? `${t.name} uses the most (${t.memoryMb >= 1024 ? `${(t.memoryMb / 1024).toFixed(1)} GB` : `${Math.round(t.memoryMb)} MB`}).` : "Close apps you aren't using.", app: t?.name });
  }
  const busy = s.perf.diskBusyPct;
  if (busy != null && busy >= 90) {
    const t = top((a) => a.diskBps);
    out.push({ id: "disk", tone: "warn", title: "The disk is busy", body: t && t.diskBps > 0 ? `${t.name} is reading and writing the most.` : "Updates, indexing or a scan may be running.", app: t?.name });
  }
  if (s.perf.gpuPct != null && s.perf.gpuPct >= 95) {
    out.push({ id: "gpu", tone: "warn", title: "The graphics card is maxed out", body: "A game, video or 3D app is using all of it." });
  }
  const days = s.telemetry.uptimeMinutes / 1440;
  if (days >= 7) {
    out.push({ id: "uptime", tone: "warn", title: `Not restarted in ${Math.floor(days)} days`, body: "A restart clears memory leaks and finishes pending updates." });
  }
  const tabs = s.apps.find((a) => /^(chrome|msedge|firefox|brave|opera|vivaldi)$/i.test(a.name) && a.pids.length >= 25);
  if (tabs && !out.some((h) => h.app === tabs.name)) {
    out.push({ id: "tabs", tone: "warn", title: `${tabs.name} is running ${tabs.pids.length} processes`, body: "Every tab and extension is its own process. Closing tabs frees memory.", app: tabs.name });
  }
  if (!out.length) out.push({ id: "ok", tone: "ok", title: "Nothing is slowing your PC down", body: "Processor, memory and disk all have room to spare." });
  const rank = { bad: 0, warn: 1, ok: 2 } as const;
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/** The headline: average CPU over the last few samples, rounded. */
export const headlineCpu = (h: (number | null)[]) => Math.round(avg(h, 3));

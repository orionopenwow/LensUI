// Number and time formatting shared by the core apps. Pure; tested in coreapps.test.ts.

export function bytes(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = Math.abs(n);
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${n < 0 ? "-" : ""}${i === 0 ? Math.round(v) : v.toFixed(v >= 100 ? 0 : digits)} ${u[i]}`;
}

/** Bytes per second as bits per second ("12.4 Mbps"), the way networks are usually measured. */
export function bitsPerSec(bps: number | null | undefined): string {
  if (bps == null || !isFinite(bps)) return "—";
  const b = bps * 8;
  if (b < 1000) return `${Math.round(b)} bps`;
  if (b < 1e6) return `${(b / 1e3).toFixed(b < 1e4 ? 1 : 0)} Kbps`;
  if (b < 1e9) return `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} Mbps`;
  return `${(b / 1e9).toFixed(1)} Gbps`;
}

export const pct = (v: number | null | undefined, digits = 0) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(digits)}%`);

/** "just now", "5 min ago", "3 h ago", "2 days ago", "Mar 4". */
export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "—";
  const d = Math.max(0, now - ms);
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h ago`;
  if (d < 30 * 86_400_000) {
    const n = Math.floor(d / 86_400_000);
    return `${n} day${n === 1 ? "" : "s"} ago`;
  }
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: d > 300 * 86_400_000 ? "numeric" : undefined });
}

/** 754_000 → "12:34", 3_723_000 → "1:02:03"; `tenths` adds ".4". */
export function clock(ms: number, tenths = false): string {
  const neg = ms < 0;
  const t = Math.abs(ms);
  const s = Math.floor(t / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  return `${neg ? "-" : ""}${body}${tenths ? `.${Math.floor((t % 1000) / 100)}` : ""}`;
}

/** Countdown display: rounds up so a timer shows 0:01 until it really ends. */
export const countdown = (ms: number) => clock(Math.ceil(Math.max(0, ms) / 1000) * 1000);

/** YYYYMMDD → Date-ish label. */
export function ymd(s: string | null | undefined): string {
  if (!s || !/^\d{8}$/.test(s)) return "—";
  const d = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

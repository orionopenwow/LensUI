// Lens Power: battery health in plain English, the charge graph and tips. Pure.
import type { BatteryReport, BatteryStatus } from "../../types/generated";

export function healthVerdict(pct: number | null | undefined): { tone: "ok" | "warn" | "bad"; text: string } {
  if (pct == null) return { tone: "warn", text: "Windows doesn't report this battery's capacity." };
  if (pct >= 90) return { tone: "ok", text: "Like new. It holds almost all the charge it was built for." };
  if (pct >= 80) return { tone: "ok", text: "Healthy. Normal wear for a battery that's been used a while." };
  if (pct >= 60) return { tone: "warn", text: "Worn. Expect noticeably shorter time on battery than when new." };
  return { tone: "bad", text: "Heavily worn. Consider a replacement if unplugged time matters to you." };
}

/** Charge % over time for the graph, with plugged-in stretches marked. */
export function usageSeries(r: BatteryReport | null): { t: string; pct: number; ac: boolean }[] {
  if (!r) return [];
  return r.usage.filter((u) => u.percent != null).map((u) => ({ t: u.localTime, pct: Math.min(100, u.percent as number), ac: u.ac }));
}

/** Full-charge capacity as % of design over the report's history (wear over time). */
export function wearSeries(r: BatteryReport | null): { t: string; pct: number }[] {
  if (!r) return [];
  return r.capacityHistory.filter((h) => h.designMwh > 0 && h.fullMwh > 0).map((h) => ({ t: h.end || h.start, pct: Math.round((h.fullMwh / h.designMwh) * 1000) / 10 }));
}

export function tips(b: BatteryStatus | null, healthPct: number | null | undefined): string[] {
  const out: string[] = [];
  if (!b) return out;
  if (!b.hasBattery) return ["This PC runs on mains power. Best performance costs nothing extra in battery life here."];
  if (b.powerMode === "performance" && !b.pluggedIn) out.push("Best performance drains the battery fastest. Balanced is usually just as quick for everyday work.");
  if ((b.percent ?? 100) <= 20 && !b.charging && !b.batterySaver) out.push("Battery is low. Battery saver dims the screen and pauses background sync.");
  if (b.pluggedIn && (b.percent ?? 0) >= 95) out.push("Staying at 100% while plugged in all day wears a battery faster. Many laptops have a charge limit in the maker's app.");
  if (healthPct != null && healthPct < 80) out.push("A worn battery can't hold a full day. Lower screen brightness gives back the most time.");
  out.push("Screen brightness and background apps cost the most battery. Lens Monitor shows what's busy.");
  return out;
}

export const mwh = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} Wh` : `${v} mWh`);

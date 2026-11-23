// Lens Network: connection summary and list helpers. Read-only. Pure.
import type { NetAppRow, WifiState } from "../../types/generated";

export function signalWords(pct: number | null | undefined): string {
  if (pct == null) return "—";
  if (pct >= 80) return "Excellent";
  if (pct >= 60) return "Good";
  if (pct >= 40) return "Fair";
  if (pct > 0) return "Weak";
  return "No signal";
}

export function connectionSummary(wifi: WifiState | null, online: boolean | null): { headline: string; sub: string; tone: "ok" | "warn" | "bad" } {
  if (wifi?.connectedSsid) {
    const n = wifi.networks.find((x) => x.connected);
    return { headline: wifi.connectedSsid, sub: `Wi-Fi · ${signalWords(n?.signal)} signal${n?.secured === false ? " · open network" : ""}`, tone: n && n.signal < 40 ? "warn" : "ok" };
  }
  if (online) return { headline: "Wired", sub: "Connected by cable or another adapter", tone: "ok" };
  if (online === false) return { headline: "Offline", sub: wifi?.radioOn === false ? "Wi-Fi is turned off" : "No network connection", tone: "bad" };
  return { headline: "Checking…", sub: "", tone: "warn" };
}

export function filterApps(rows: NetAppRow[], q: string, internetOnly: boolean): NetAppRow[] {
  const t = q.trim().toLowerCase();
  return rows.filter((r) => (!internetOnly || r.internet > 0) && (!t || r.name.toLowerCase().includes(t) || r.peers.some((p) => p.includes(t))));
}

/** "Who's using my internet right now": apps with internet connections, busiest first. */
export const onlineApps = (rows: NetAppRow[]) => rows.filter((r) => r.internet > 0).sort((a, b) => b.internet - a.internet);

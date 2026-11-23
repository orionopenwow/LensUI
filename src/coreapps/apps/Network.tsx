// Lens Network (read-only): current connection, addresses, Wi-Fi details and "Who's using my
// internet right now" from live connections. The speed test only runs when you press it, against
// the server you pick.
import React, { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LensConfig, NetSnapshot, SpeedEndpoint, SpeedResult, WifiState } from "../../types/generated";
import { AppShell, isKey } from "../shell/AppShell";
import { AppIcon } from "../shell/AppIcon";
import { Button, Card, Confirm, Empty, ErrorNote, Hero, Meter, Mono, Pill, Search, Skeleton, Switch, Toast } from "../shell/ui";
import { useLoad } from "../shell/hooks";
import { plural } from "../shell/format";
import { connectionSummary, filterApps, onlineApps, signalWords } from "../models/network";
import { friendlyError } from "../models/load";
import { coreApp } from "../registry";

export interface NetworkDemo {
  wifi: WifiState;
  snap: NetSnapshot;
  endpoints: SpeedEndpoint[];
  speed?: SpeedResult;
}

export const Network: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void>; demo?: NetworkDemo }> = ({ config, updateConfig, demo }) => {
  const app = coreApp("network")!;
  const wifiL = useLoad<WifiState>("get_wifi_cmd", {}, { enabled: !demo, pollMs: 15_000 });
  const snapL = useLoad<NetSnapshot>("coreapp_net_snapshot", {}, { enabled: !demo, pollMs: 3_000 });
  const epL = useLoad<SpeedEndpoint[]>("coreapp_speed_endpoints", {}, { enabled: !demo });
  const wifi = demo?.wifi ?? wifiL.data;
  const snap = demo?.snap ?? snapL.data;
  const endpoints = demo?.endpoints ?? epL.data ?? [];
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [endpoint, setEndpoint] = useState<string>("");
  const [confirmSpeed, setConfirmSpeed] = useState(false);
  const [speed, setSpeed] = useState<SpeedResult | null>(demo?.speed ?? null);
  const [speedBusy, setSpeedBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);

  const online = snap ? snap.internetConnections > 0 || !!snap.localIpv4 : null;
  const sum = connectionSummary(wifi ?? null, online);
  const users = useMemo(() => (snap ? onlineApps(snap.apps) : []), [snap]);
  const rows = useMemo(() => (snap ? filterApps(snap.apps, query, !all) : []), [snap, query, all]);
  const connected = wifi?.networks.find((n) => n.connected);

  const runSpeed = () => {
    setSpeedBusy(true);
    invoke<SpeedResult>("coreapp_speed_test", { endpoint })
      .then(setSpeed)
      .catch((e) => setToast({ text: friendlyError(String(e)), tone: "bad" }))
      .finally(() => setSpeedBusy(false));
  };

  const keys = [
    { keys: "Ctrl+F", label: "Search apps", match: (e: KeyboardEvent) => isKey(e, "f", { ctrl: true }), run: () => document.querySelector<HTMLInputElement>(".ca-search input")?.focus() },
    { keys: "F5", label: "Refresh now", match: (e: KeyboardEvent) => e.key === "F5", run: () => (snapL.reload(), wifiL.reload()) },
  ];

  return (
    <AppShell
      app={app}
      config={config}
      updateConfig={updateConfig}
      keys={keys}
      meta={snap ? `${plural(snap.totalConnections, "connection")} · refreshed every 3 s while open · read-only` : "Reading connections…"}
      actions={
        <Button variant="primary" disabled={!endpoint || speedBusy} onClick={() => setConfirmSpeed(true)}>
          {speedBusy ? "Testing…" : "Run speed test"}
        </Button>
      }
    >
      <Hero title="Connection" value={sum.headline} subtitle={sum.sub} tone={sum.tone === "ok" ? undefined : sum.tone} aside={snap && <Pill tone={users.length ? "info" : undefined}>{plural(users.length, "app")} online</Pill>} />
      {snapL.status === "error" && !demo && <ErrorNote onRetry={snapL.reload}>{snapL.error}</ErrorNote>}
      <div className="ca-grid nw-grid">
        <Card title="This PC">
          <dl className="nw-dl">
            <dt>IPv4</dt>
            <dd>
              <Mono>{snap?.localIpv4 ?? "—"}</Mono>
            </dd>
            <dt>IPv6</dt>
            <dd>
              <Mono>{snap?.localIpv6 ?? "—"}</Mono>
            </dd>
            <dt>Public IP</dt>
            <dd className="ca-muted">Not looked up (that would contact a server)</dd>
          </dl>
        </Card>
        <Card title="Wi-Fi">
          {!wifi ? (
            <Skeleton rows={3} />
          ) : !wifi.available ? (
            <p className="ca-muted" style={{ margin: 0 }}>
              {wifi.reason || "No Wi-Fi adapter."}
            </p>
          ) : (
            <dl className="nw-dl">
              <dt>Network</dt>
              <dd>{wifi.connectedSsid ?? (wifi.radioOn === false ? "Wi-Fi is off" : "Not connected")}</dd>
              <dt>Signal</dt>
              <dd>
                {connected ? (
                  <span className="ca-row">
                    <Meter value={connected.signal} label="Wi-Fi signal" tone={connected.signal < 40 ? "warn" : "ok"} />
                    <span>
                      {signalWords(connected.signal)} · {connected.signal}%
                    </span>
                  </span>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Security</dt>
              <dd>{connected ? (connected.secured ? "Password protected" : "Open network") : "—"}</dd>
              <dt>Adapter</dt>
              <dd>{wifi.adapter || "—"}</dd>
              <dt>Nearby</dt>
              <dd>{plural(wifi.networks.length, "network")}</dd>
            </dl>
          )}
        </Card>
        <Card title="Speed test" meta="off until you run it" guide="coreapp.network.speed">
          {speed ? (
            <div className="ca-stat">
              <div className="ca-stat-value">
                {speed.mbps}
                <small>Mbps down</small>
              </div>
              <span className="ca-mono">
                {(speed.bytes / 1e6).toFixed(1)} MB in {speed.seconds}s · {speed.endpoint}
              </span>
            </div>
          ) : (
            <p className="ca-muted" style={{ margin: "0 0 12px", fontSize: 12 }}>
              Downloads up to 25 MB from the server you pick. Nothing runs until you press the button.
            </p>
          )}
          <select className="ca-input" style={{ width: "100%", marginTop: 8 }} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} aria-label="Speed test server">
            <option value="">Choose a server…</option>
            {endpoints.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label} ({e.host})
              </option>
            ))}
          </select>
        </Card>
      </div>

      <Card
        title="Who's using my internet right now"
        meta="open connections, not bandwidth"
        actions={
          <>
            <Search value={query} onChange={setQuery} placeholder="Search apps or addresses" />
          </>
        }
        guide="coreapp.network.apps"
      >
        <div className="ca-row" style={{ marginBottom: 8 }}>
          <Switch checked={all} label="Also show local and listening apps" onChange={setAll} />
          <span className="ca-secondary">Also show apps talking only to this PC or your network</span>
        </div>
        {!snap && snapL.status === "loading" && <Skeleton rows={5} />}
        {snap && rows.length === 0 && <Empty title={query ? `Nothing matches “${query}”` : "No app is online right now"} config={query ? undefined : config} />}
        {rows.length > 0 && (
          <ul className="ca-list">
            {rows.map((r) => (
              <li key={r.name} className="ca-item">
                <AppIcon exe={r.exe} name={r.name} />
                <div className="ca-item-main">
                  <div className="ca-item-title">{r.name}</div>
                  <div className="ca-item-sub">
                    {r.peers.length ? r.peers.slice(0, 3).join(" · ") : r.listening.length ? `listening on ${r.listening.slice(0, 5).join(", ")}` : "local only"}
                  </div>
                </div>
                {r.internet > 0 && <Pill tone="info">{plural(r.internet, "connection")}</Pill>}
                {r.local > 0 && <Pill>{r.local} local</Pill>}
              </li>
            ))}
          </ul>
        )}
        <p className="ca-muted" style={{ margin: "12px 0 0", fontSize: 12 }}>
          Lens counts open connections per app from Windows' connection table. Measuring each app's traffic needs admin rights, so Lens doesn't.
        </p>
      </Card>
      {confirmSpeed && (
        <Confirm
          title="Run a speed test?"
          body={<p>Lens will download up to 25 MB from {endpoints.find((e) => e.id === endpoint)?.label ?? "the server"} for about 10 seconds. On a metered connection that uses data.</p>}
          confirmLabel="Run test"
          onCancel={() => setConfirmSpeed(false)}
          onConfirm={() => (setConfirmSpeed(false), runSpeed())}
        />
      )}
      <Toast text={toast?.text ?? null} tone={toast?.tone} onDone={() => setToast(null)} />
    </AppShell>
  );
};

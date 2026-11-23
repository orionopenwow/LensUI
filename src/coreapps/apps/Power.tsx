// Lens Power: battery health from Windows' own battery report (powercfg, no admin), design vs
// full-charge capacity, cycle count, recent charge graph, power mode and plain tips.
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BatteryReport, BatteryStatus, LensConfig } from "../../types/generated";
import { AppShell, isKey } from "../shell/AppShell";
import { Button, Card, Empty, ErrorNote, Hero, Meter, Pill, Skeleton, Sparkline, Tabs, Toast } from "../shell/ui";
import { useLoad } from "../shell/hooks";
import { healthVerdict, mwh, tips, usageSeries, wearSeries } from "../models/power";
import { friendlyError } from "../models/load";
import { coreApp } from "../registry";

type Mode = "efficiency" | "balanced" | "performance";

export interface PowerDemo {
  status: BatteryStatus;
  report: BatteryReport | null;
}

export const Power: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void>; demo?: PowerDemo }> = ({ config, updateConfig, demo }) => {
  const app = coreApp("power")!;
  const st = useLoad<BatteryStatus>("get_battery_cmd", {}, { enabled: !demo, pollMs: 30_000 });
  const status = demo?.status ?? st.data;
  const rep = useLoad<BatteryReport>("coreapp_battery_report", {}, { enabled: !demo && !!status?.hasBattery });
  const report = demo ? demo.report : rep.data;
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const b = report?.batteries[0] ?? null;
  const health = healthVerdict(b?.healthPct);
  const usage = usageSeries(report);
  const wear = wearSeries(report);
  const mode = (["efficiency", "balanced", "performance"].includes(status?.powerMode ?? "") ? status!.powerMode : "balanced") as Mode;

  const setMode = (m: Mode) => {
    if (demo || !status) return;
    st.set({ ...status, powerMode: m });
    invoke<BatteryStatus>("set_power_mode_cmd", { mode: m })
      .then((s) => (st.set(s), setToast({ text: `Power mode: ${m === "efficiency" ? "best efficiency" : m === "performance" ? "best performance" : "balanced"}.`, tone: "ok" })))
      .catch((e) => (st.set(status), setToast({ text: friendlyError(String(e)), tone: "bad" })));
  };

  const keys = [
    { keys: "Ctrl+R", label: "Read the battery report again", match: (e: KeyboardEvent) => isKey(e, "r", { ctrl: true }), run: () => rep.reload() },
    { keys: "Ctrl+1", label: "Best efficiency", match: (e: KeyboardEvent) => isKey(e, "1", { ctrl: true }), run: () => setMode("efficiency") },
    { keys: "Ctrl+2", label: "Balanced", match: (e: KeyboardEvent) => isKey(e, "2", { ctrl: true }), run: () => setMode("balanced") },
    { keys: "Ctrl+3", label: "Best performance", match: (e: KeyboardEvent) => isKey(e, "3", { ctrl: true }), run: () => setMode("performance") },
  ];

  const timeLeft = (s: number | null) => (s && s > 0 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min left` : null);

  return (
    <AppShell
      app={app}
      config={config}
      updateConfig={updateConfig}
      keys={keys}
      meta={report ? `From Windows' battery report · ${report.computer || "this PC"} · read ${report.scanTime.replace("T", " ")}` : "Battery report: powercfg, no admin needed"}
      actions={
        status?.hasBattery ? (
          <Button variant="primary" onClick={() => rep.reload()} disabled={!demo && rep.status === "loading"}>
            {!demo && rep.status === "loading" ? "Reading report…" : "Read report again"}
          </Button>
        ) : undefined
      }
    >
      {!status && st.status === "loading" && <Skeleton rows={5} />}
      {st.status === "error" && !demo && <ErrorNote onRetry={st.reload}>{st.error}</ErrorNote>}
      {status && !status.hasBattery && (
        <Empty title="No battery" config={config}>
          This PC runs on mains power, so there's no battery health to show. You can still pick a power mode below.
        </Empty>
      )}
      {status?.hasBattery && (
        <>
          <Hero
            title="Battery health"
            value={b?.healthPct != null ? Math.round(b.healthPct) : "—"}
            valueText={b?.healthPct != null ? `${Math.round(b.healthPct)}%` : undefined}
            unit={b?.healthPct != null ? "%" : undefined}
            tone={b ? health.tone : undefined}
            subtitle={rep.status === "loading" && !demo ? "Reading Windows' battery report…" : health.text}
            aside={
              <div className="pw-now">
                <strong>{status.percent ?? "?"}%</strong>
                <span className="ca-muted">{status.charging ? "Charging" : status.pluggedIn ? "Plugged in" : timeLeft(status.secondsLeft) ?? "On battery"}</span>
              </div>
            }
          />
          {rep.status === "error" && !demo && <ErrorNote onRetry={rep.reload}>{rep.error}</ErrorNote>}
          {b && (
            <div className="ca-grid">
              <Card title="Capacity">
                <div className="ca-stat">
                  <div className="ca-stat-value">
                    {mwh(b.fullMwh)}
                    <small>of {mwh(b.designMwh)}</small>
                  </div>
                  <Meter value={b.fullMwh} max={b.designMwh || 1} label="Full charge compared with design capacity" tone={health.tone} />
                  <span className="ca-muted" style={{ fontSize: 12 }}>
                    Holds now · built to hold
                  </span>
                </div>
              </Card>
              <Card title="Charge cycles">
                <div className="ca-stat">
                  <div className="ca-stat-value">{b.cycles ?? "—"}</div>
                  <span className="ca-muted" style={{ fontSize: 12 }}>
                    {b.cycles == null ? "This battery doesn't report cycles." : "Most laptop batteries are rated for 500–1000."}
                  </span>
                </div>
              </Card>
              <Card title="Battery">
                <div className="ca-stat">
                  <div className="ca-stat-value" style={{ fontSize: 16 }}>
                    {b.manufacturer || "Unknown maker"}
                  </div>
                  <span className="ca-mono">
                    {b.chemistry || "?"} · {b.id}
                  </span>
                </div>
              </Card>
            </div>
          )}
          {usage.length > 1 && (
            <Card title="Recent charge" meta={`${usage[0].t.replace("T", " ").slice(0, 16)} → now`}>
              <div className="pw-usage" role="img" aria-label={`Charge over the last ${usage.length} periods, from ${Math.round(usage[0].pct)}% to ${Math.round(usage[usage.length - 1].pct)}%`}>
                {usage.slice(-48).map((u, i) => (
                  <span key={i} className={u.ac ? "ac" : undefined} style={{ height: `${Math.max(4, u.pct)}%` }} />
                ))}
              </div>
              <div className="ca-row" style={{ marginTop: 8 }}>
                <Pill>On battery</Pill>
                <Pill tone="ok">Plugged in</Pill>
              </div>
            </Card>
          )}
          {wear.length > 1 && (
            <Card title="Wear over time" meta={`${wear[0].pct}% → ${wear[wear.length - 1].pct}%`}>
              <Sparkline values={wear.map((w) => w.pct)} min={Math.max(0, Math.min(...wear.map((w) => w.pct)) - 4)} max={100} label={`Capacity fell from ${wear[0].pct}% to ${wear[wear.length - 1].pct}% of design`} height={48} />
            </Card>
          )}
        </>
      )}
      {status && (
        <Card title="Power mode" meta={status.powerModeSupported ? undefined : "Not changeable on this PC"}>
          <Tabs
            label="Power mode"
            value={mode}
            onChange={setMode}
            options={[
              { id: "efficiency", label: "Best efficiency" },
              { id: "balanced", label: "Balanced" },
              { id: "performance", label: "Best performance" },
            ]}
          />
        </Card>
      )}
      {status && (
        <Card title="Tips">
          <ul className="pw-tips">
            {tips(status, b?.healthPct).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Card>
      )}
      <Toast text={toast?.text ?? null} tone={toast?.tone} onDone={() => setToast(null)} />
    </AppShell>
  );
};

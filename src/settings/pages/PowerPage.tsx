import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Zap, BatteryCharging, Leaf } from "lucide-react";
import type { BatteryStatus } from "../../types/generated";
import { Hero, HeroTile, LinkRow, Row, Section, Segmented, Select, StateNote, WinLink } from "../ui/primitives";
import { optimistic, useResource } from "../useResource";
import type { PageProps } from "./common";

type Mode = "efficiency" | "balanced" | "performance";
const MODES: { id: Mode; label: string }[] = [
  { id: "efficiency", label: "Best efficiency" },
  { id: "balanced", label: "Balanced" },
  { id: "performance", label: "Best performance" },
];

const timeLeft = (s: number | null) => {
  if (!s || s <= 0) return null;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min left` : `${m} min left`;
};

export const PowerPage: React.FC<PageProps> = ({ section }) => {
  const bat = useResource<BatteryStatus>("get_battery_cmd", {}, { pollMs: 30000 });
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const b = bat.data;
  const mode = (["efficiency", "balanced", "performance"].includes(b?.powerMode ?? "") ? b?.powerMode : "balanced") as Mode;

  const setMode = (m: Mode) =>
    b &&
    optimistic(b, { ...b, powerMode: m }, bat.set, () => invoke<BatteryStatus>("set_power_mode_cmd", { mode: m }), setErr, "the power mode");

  const action = (a: string) => {
    if (confirm !== a) return setConfirm(a);
    setConfirm(null);
    invoke("power_action_cmd", { action: a }).catch((e) => setErr(String(e)));
  };

  return (
    <>
      <Hero>
        <HeroTile icon={<Zap size={15} aria-hidden />} label="Power mode" sub={b && !b.powerModeSupported ? "Not changeable on this PC" : undefined}>
          <Select label="Power mode" value={mode} options={MODES} disabled={!b?.powerModeSupported} onChange={(v) => setMode(v as Mode)} />
        </HeroTile>
        <HeroTile
          icon={<BatteryCharging size={15} aria-hidden />}
          label="Battery"
          value={b?.hasBattery ? `${b.percent ?? "?"}%` : "—"}
          sub={!b ? "" : !b.hasBattery ? "No battery (plugged in)" : b.charging ? "Charging" : b.pluggedIn ? "Plugged in" : timeLeft(b.secondsLeft) ?? "On battery"}
        />
        <HeroTile
          icon={<Leaf size={15} aria-hidden />}
          label="Battery saver"
          value={b?.batterySaver ? "On" : "Off"}
          active={!!b?.batterySaver}
          sub={b?.hasBattery ? "Changed in Windows" : "Needs a battery"}
        >
          <WinLink uri="ms-settings:batterysaver" label="Open" compact />
        </HeroTile>
      </Hero>
      {bat.loading && !b && <StateNote kind="loading">Reading power status…</StateNote>}
      {(err || bat.error) && <StateNote kind="error" action={<WinLink uri="ms-settings:powersleep" compact label="Windows Settings" />}>{err ?? bat.error}</StateNote>}

      <Section id="mode" title="Power mode" summary={MODES.find((m) => m.id === mode)?.label} forceOpen={section === "mode"}>
        <Row label="When plugged in and on battery" desc="Windows applies this to the current power source.">
          <Segmented label="Power mode" value={mode} options={MODES} disabled={!b?.powerModeSupported} onChange={setMode} />
        </Row>
        {b && !b.powerModeSupported && <StateNote kind="unavailable">This PC's power plan doesn't allow apps to change the mode.</StateNote>}
      </Section>

      <Section id="sleep" title="Screen & sleep" summary="In Windows Settings" defaultOpen={false} forceOpen={section === "sleep"}>
        <StateNote kind="info">Timeouts are part of your Windows power plan; Lens opens the exact page instead of editing the plan.</StateNote>
        <LinkRow>
          <WinLink uri="ms-settings:powersleep" label="Screen and sleep" />
          <WinLink uri="ms-settings:batterysaver-usagedetails" label="Battery usage by app" />
        </LinkRow>
      </Section>

      <Section id="actions" title="Power actions" summary="Lock, sleep, restart" defaultOpen={false} forceOpen={section === "actions"}>
        <div className="sh-actions">
          {[
            ["lock", "Lock"],
            ["sleep", "Sleep"],
            ["signout", "Sign out"],
            ["restart", "Restart"],
            ["shutdown", "Shut down"],
          ].map(([id, label]) => (
            <button key={id} type="button" className={`cc-btn ${confirm === id ? "sh-danger" : ""}`} onClick={() => action(id)}>
              {confirm === id ? `Click again to ${label.toLowerCase()}` : label}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
};

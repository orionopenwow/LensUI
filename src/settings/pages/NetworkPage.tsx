import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Wifi, Bluetooth, Plane, Lock, RefreshCw } from "lucide-react";
import type { BluetoothState, WifiState } from "../../types/generated";
import { Hero, HeroTile, LinkRow, Row, Section, StateNote, Toggle, WinLink } from "../ui/primitives";
import { optimistic, useResource } from "../useResource";
import type { PageProps } from "./common";

export const NetworkPage: React.FC<PageProps> = ({ section }) => {
  const wifi = useResource<WifiState>("get_wifi_cmd", {}, { pollMs: 15000 });
  const bt = useResource<BluetoothState>("get_bluetooth_cmd", {}, { pollMs: 15000 });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const w = wifi.data;
  const b = bt.data;

  const setRadio = (kind: "wifi" | "bluetooth", on: boolean) => {
    if (kind === "wifi" && w)
      return optimistic(w, { ...w, radioOn: on }, wifi.set, () => invoke("set_radio_cmd", { kind, on }), setErr, "Wi-Fi").then(() => wifi.reload());
    if (kind === "bluetooth" && b)
      return optimistic(b, { ...b, radioOn: on }, bt.set, () => invoke("set_radio_cmd", { kind, on }), setErr, "Bluetooth").then(() => bt.reload());
  };

  const connect = (ssid: string) => {
    setBusy(ssid);
    setErr(null);
    invoke<string>("wifi_connect_cmd", { ssid })
      .then(() => wifi.reload())
      .catch((e) => setErr(`Couldn't connect to ${ssid}: ${e}`))
      .finally(() => setBusy(null));
  };

  return (
    <>
      <Hero>
        <HeroTile
          icon={<Wifi size={15} aria-hidden />}
          label="Wi-Fi"
          value={w?.radioOn === false ? "Off" : w?.connectedSsid ? "Connected" : w ? "On" : "—"}
          sub={w?.connectedSsid ?? (w && !w.available ? w.reason : "Not connected")}
          active={!!w?.radioOn}
        >
          <Toggle label="Wi-Fi" checked={!!w?.radioOn} disabled={!w?.available || w.radioOn === null} onChange={(v) => setRadio("wifi", v)} />
        </HeroTile>
        <HeroTile
          icon={<Bluetooth size={15} aria-hidden />}
          label="Bluetooth"
          value={b?.radioOn ? "On" : b ? "Off" : "—"}
          sub={b && !b.available ? b.reason : `${b?.devices.filter((d) => d.connected).length ?? 0} connected`}
          active={!!b?.radioOn}
        >
          <Toggle label="Bluetooth" checked={!!b?.radioOn} disabled={!b?.available || b.radioOn === null} onChange={(v) => setRadio("bluetooth", v)} />
        </HeroTile>
        <HeroTile icon={<Plane size={15} aria-hidden />} label="Airplane mode" sub="Switched in Windows">
          <WinLink uri="ms-settings:network-airplanemode" label="Open" compact />
        </HeroTile>
      </Hero>
      {err && <StateNote kind="error" action={<WinLink uri="ms-settings:network" compact label="Windows Settings" />}>{err}</StateNote>}

      <Section
        id="wifi"
        title="Wi-Fi networks"
        summary={w?.connectedSsid ? `Connected to ${w.connectedSsid}` : w ? `${w.networks.length} nearby` : "—"}
        forceOpen={section === "wifi"}
        actions={
          <button
            type="button"
            className="cc-chip compact"
            aria-label="Scan for networks"
            onClick={() => invoke("wifi_scan_cmd").then(() => window.setTimeout(wifi.reload, 2500)).catch((e) => setErr(String(e)))}
          >
            <RefreshCw size={12} aria-hidden /> Scan
          </button>
        }
      >
        {wifi.loading && !w && <StateNote kind="loading">Looking for networks…</StateNote>}
        {w && !w.available && <StateNote kind="unavailable">{w.reason || "No Wi-Fi adapter."}</StateNote>}
        {w?.networks.slice(0, 12).map((n) => (
          <Row
            key={n.ssid}
            label={
              <>
                <span className={`sh-bars b${n.bars}`} role="img" aria-label={`Signal: ${n.bars} of 4 bars`} />
                {n.ssid || "(hidden network)"}
                {n.secured && <Lock size={11} aria-label="Secured" />}
              </>
            }
            desc={n.connected ? "Connected" : n.hasProfile ? "Saved" : n.secured ? "Needs a password" : "Open network"}
          >
            {n.connected ? (
              <button type="button" className="cc-btn" onClick={() => invoke("wifi_disconnect_cmd").then(() => wifi.reload()).catch((e) => setErr(String(e)))}>
                Disconnect
              </button>
            ) : n.hasProfile || !n.secured ? (
              <button type="button" className="cc-btn" disabled={busy === n.ssid} onClick={() => connect(n.ssid)}>
                {busy === n.ssid ? "Connecting…" : "Connect"}
              </button>
            ) : (
              // Passwords are only ever typed into Windows' own prompt.
              <WinLink uri="ms-settings:network-wifi" label="Connect in Windows" compact />
            )}
          </Row>
        ))}
        <LinkRow>
          <WinLink uri="ms-settings:network-wifisettings" label="Saved networks" />
          <WinLink uri="ms-settings:network-vpn" label="VPN" />
          <WinLink uri="ms-settings:network-proxy" label="Proxy" />
        </LinkRow>
      </Section>

      <Section id="bluetooth" title="Bluetooth devices" summary={b ? `${b.devices.length} paired` : "—"} forceOpen={section === "bluetooth"}>
        {b && !b.available && <StateNote kind="unavailable">{b.reason || "No Bluetooth radio."}</StateNote>}
        {b?.available && !b.devices.length && <StateNote kind="info">No paired devices.</StateNote>}
        {b?.devices.map((d) => (
          <Row key={d.address} label={d.name} desc={`${d.kind} · ${d.connected ? "Connected" : "Not connected"}`}>
            <span className={`sh-dot ${d.connected ? "on" : ""}`} aria-hidden />
          </Row>
        ))}
        <StateNote kind="info">Connect, disconnect and pair new devices in Windows Settings.</StateNote>
        <LinkRow>
          <WinLink uri="ms-settings:bluetooth" label="Bluetooth & devices" />
        </LinkRow>
      </Section>
    </>
  );
};

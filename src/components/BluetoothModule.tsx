import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bluetooth, BluetoothOff, Headphones, Keyboard, Smartphone, Laptop } from "lucide-react";
import { SysSwitch, openSetting, usePolled, type BluetoothDevice, type BluetoothState } from "./SystemModuleShared";

function KindIcon({ kind }: { kind: BluetoothDevice["kind"] }) {
  const p = { size: 15, strokeWidth: 2.3 };
  switch (kind) {
    case "audio":
      return <Headphones {...p} />;
    case "input":
      return <Keyboard {...p} />;
    case "phone":
      return <Smartphone {...p} />;
    case "computer":
      return <Laptop {...p} />;
    default:
      return <Bluetooth {...p} />;
  }
}

/** Bluetooth radio switch and the paired-device list Windows reports. */
export const BluetoothModule: React.FC = () => {
  const [state, refresh, , setState] = usePolled<BluetoothState>("get_bluetooth_cmd", undefined, 10000);
  const [message, setMessage] = useState<string | null>(null);

  const toggleRadio = () => {
    if (!state || state.radioOn === null) return;
    const next = !state.radioOn;
    setState({ ...state, radioOn: next });
    setMessage(null);
    invoke("set_radio_cmd", { kind: "bluetooth", on: next })
      .then(() => window.setTimeout(refresh, 1500))
      .catch((e) => {
        setMessage(String(e));
        refresh();
      });
  };

  const radioOff = state?.radioOn === false;
  const connected = state?.devices.filter((d) => d.connected) ?? [];
  const status = !state
    ? "Checking…"
    : radioOff
      ? "Off"
      : !state.available
        ? state.reason || "Unavailable"
        : connected.length > 0
          ? `${connected.length} connected`
          : state.devices.length > 0
            ? "On · nothing connected"
            : "On";

  return (
    <div className="sysmod-card">
      <div className="sysmod-head">
        <div className="sysmod-head-left">
          {radioOff || (state && !state.available) ? (
            <BluetoothOff size={16} strokeWidth={2.4} color="var(--lens-fg-secondary)" />
          ) : (
            <Bluetooth size={16} strokeWidth={2.4} color="#818CF8" />
          )}
          <div style={{ minWidth: 0 }}>
            <div className="sysmod-title">Bluetooth</div>
            <div className="sysmod-sub">{status}</div>
          </div>
        </div>
        {state && state.radioOn !== null && (
          <SysSwitch on={!!state.radioOn} label="Bluetooth radio" onToggle={toggleRadio} />
        )}
      </div>

      {state?.available && !radioOff && state.devices.length > 0 && (
        <div className="sysmod-list" role="list">
          {state.devices.map((d) => (
            <div key={d.address} role="listitem" className={`sysmod-row ${d.connected ? "is-active" : ""}`}>
              <span className="sysmod-row-icon">
                <KindIcon kind={d.kind} />
              </span>
              <span className="sysmod-row-text">
                <span className="sysmod-row-name">{d.name}</span>
                <span className="sysmod-row-meta">{d.connected ? "Connected" : "Paired"}</span>
              </span>
              {d.connected && <span className="sysmod-badge is-good">On</span>}
            </div>
          ))}
        </div>
      )}

      {message && <div className="sysmod-error">{message}</div>}

      <div className="sysmod-footer" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" className="sysmod-link" onClick={() => openSetting("ms-settings:bluetooth")}>
          Pair or connect a device
        </button>
      </div>
      {state?.available && !radioOff && (
        <div className="sysmod-note">Some low-energy devices only appear in Windows Settings.</div>
      )}
    </div>
  );
};

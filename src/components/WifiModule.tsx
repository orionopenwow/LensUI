import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Wifi, WifiHigh, WifiLow, WifiZero, WifiOff, Lock, RefreshCw } from "lucide-react";
import { SysSwitch, openSetting, usePolled, type WifiNetwork, type WifiState } from "./SystemModuleShared";

function BarsIcon({ bars, size = 15 }: { bars: number; size?: number }) {
  const props = { size, strokeWidth: 2.4 };
  if (bars >= 4) return <Wifi {...props} />;
  if (bars === 3) return <WifiHigh {...props} />;
  if (bars === 2) return <WifiLow {...props} />;
  return <WifiZero {...props} />;
}

/**
 * Real Wi-Fi networks from Windows (wlanapi). Lens only connects through a network's saved
 * Windows profile; networks without one open Windows Settings, where the password is entered.
 */
export const WifiModule: React.FC<{ maxRows?: number }> = ({ maxRows = 8 }) => {
  const [state, refresh, , setState] = usePolled<WifiState>("get_wifi_cmd", undefined, 8000);
  const [scanning, setScanning] = useState(false);
  const [openSsid, setOpenSsid] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const scan = () => {
    setScanning(true);
    setMessage(null);
    invoke("wifi_scan_cmd")
      .catch((e) => setMessage(String(e)))
      .finally(() => {
        // Windows needs a few seconds to finish a scan.
        window.setTimeout(() => {
          refresh().finally(() => setScanning(false));
        }, 3500);
      });
  };

  const toggleRadio = () => {
    if (!state || state.radioOn === null) return;
    const next = !state.radioOn;
    setState({ ...state, radioOn: next });
    invoke("set_radio_cmd", { kind: "wifi", on: next })
      .then(() => window.setTimeout(refresh, 1500))
      .catch((e) => {
        setMessage(String(e));
        refresh();
      });
  };

  const connect = (n: WifiNetwork) => {
    setBusy(n.ssid);
    setMessage(null);
    invoke<string>("wifi_connect_cmd", { ssid: n.ssid })
      .then((m) => setMessage(m))
      .catch((e) => setMessage(String(e)))
      .finally(() => {
        window.setTimeout(() => {
          refresh().finally(() => setBusy(null));
        }, 2500);
      });
  };

  const disconnect = () => {
    setBusy("__disconnect");
    invoke("wifi_disconnect_cmd")
      .catch((e) => setMessage(String(e)))
      .finally(() => {
        window.setTimeout(() => {
          refresh().finally(() => setBusy(null));
        }, 1200);
      });
  };

  const radioOff = state?.radioOn === false;
  const status = !state
    ? "Checking…"
    : radioOff
      ? "Off"
      : !state.available
        ? state.reason || "Unavailable"
        : state.connectedSsid
          ? `Connected · ${state.connectedSsid}`
          : "Not connected";

  const networks = state?.available && !radioOff ? state.networks.slice(0, maxRows) : [];

  return (
    <div className="sysmod-card">
      <div className="sysmod-head">
        <div className="sysmod-head-left">
          {radioOff || (state && !state.available) ? (
            <WifiOff size={16} strokeWidth={2.4} color="var(--lens-fg-secondary)" />
          ) : (
            <Wifi size={16} strokeWidth={2.4} color="#60A5FA" />
          )}
          <div style={{ minWidth: 0 }}>
            <div className="sysmod-title">Wi-Fi</div>
            <div className="sysmod-sub">{status}</div>
          </div>
        </div>
        <div className="sysmod-head-actions">
          {state?.available && !radioOff && (
            <button
              type="button"
              className={`sysmod-icon-btn ${scanning ? "is-busy" : ""}`}
              aria-label="Scan for networks"
              onClick={scan}
              disabled={scanning}
            >
              <RefreshCw size={13} strokeWidth={2.5} />
            </button>
          )}
          {state && state.radioOn !== null && (
            <SysSwitch on={!!state.radioOn} label="Wi-Fi radio" onToggle={toggleRadio} />
          )}
        </div>
      </div>

      {networks.length > 0 && (
        <div className="sysmod-list" role="list">
          {networks.map((n) => {
            const isOpen = openSsid === n.ssid;
            const meta = n.connected
              ? "Connected"
              : n.hasProfile
                ? n.secured
                  ? "Saved · Secured"
                  : "Saved"
                : n.secured
                  ? "Secured"
                  : "Open";
            return (
              <div
                key={n.ssid}
                role="listitem"
                className={`sysmod-row is-clickable ${n.connected ? "is-active" : ""} ${isOpen ? "is-open" : ""}`}
                onClick={() => setOpenSsid(isOpen ? null : n.ssid)}
              >
                <span className="sysmod-row-icon">
                  <BarsIcon bars={n.bars} />
                </span>
                <span className="sysmod-row-text">
                  <span className="sysmod-row-name">{n.ssid}</span>
                  <span className="sysmod-row-meta">{meta}</span>
                </span>
                <span className="sysmod-row-trail">
                  {n.secured && !isOpen && <Lock size={11} strokeWidth={2.4} />}
                  {isOpen &&
                    (n.connected ? (
                      <button
                        type="button"
                        className="sysmod-pill-btn"
                        disabled={busy !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          disconnect();
                        }}
                      >
                        {busy === "__disconnect" ? "Disconnecting…" : "Disconnect"}
                      </button>
                    ) : n.hasProfile ? (
                      <button
                        type="button"
                        className="sysmod-pill-btn is-primary"
                        disabled={busy !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          connect(n);
                        }}
                      >
                        {busy === n.ssid ? "Connecting…" : "Connect"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="sysmod-pill-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openSetting("ms-settings:network-wifi");
                        }}
                      >
                        Set up in Settings
                      </button>
                    ))}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {message && <div className="sysmod-note">{message}</div>}

      <div className="sysmod-footer">
        <button type="button" className="sysmod-link" onClick={() => openSetting("ms-settings:network-wifi")}>
          More Wi-Fi settings
        </button>
      </div>
    </div>
  );
};

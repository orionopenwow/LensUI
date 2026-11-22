import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Headphones, Mic } from "lucide-react";
import { usePolled, type AudioDeviceList } from "./SystemModuleShared";

/** Lists active output (render) or input (capture) devices; a click makes one the default. */
export const AudioDeviceModule: React.FC<{ flow: "render" | "capture" }> = ({ flow }) => {
  const [list, refresh, , setList] = usePolled<AudioDeviceList>("list_audio_devices_cmd", { flow }, 15000);
  const [error, setError] = useState<string | null>(null);

  if (!list) return null;
  const title = flow === "capture" ? "Input" : "Output";

  const choose = (id: string) => {
    setError(null);
    setList({ ...list, devices: list.devices.map((d) => ({ ...d, isDefault: d.id === id })) });
    invoke("set_default_audio_device_cmd", { id })
      .then(() => window.setTimeout(refresh, 600))
      .catch((e) => {
        setError(String(e));
        refresh();
      });
  };

  return (
    <div className="sysmod-card">
      <div className="sysmod-head">
        <div className="sysmod-head-left">
          {flow === "capture" ? (
            <Mic size={15} strokeWidth={2.4} color="#FB7185" />
          ) : (
            <Headphones size={15} strokeWidth={2.4} color="#38BDF8" />
          )}
          <span className="sysmod-title">{title}</span>
        </div>
      </div>
      {list.devices.length === 0 ? (
        <div className="sysmod-note">No active {flow === "capture" ? "microphones" : "output devices"}.</div>
      ) : (
        <div className="sysmod-list" role="radiogroup" aria-label={`${title} device`}>
          {list.devices.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={d.isDefault}
              disabled={!list.canSwitch}
              className={`sysmod-row is-clickable ${d.isDefault ? "is-active" : ""}`}
              onClick={() => !d.isDefault && choose(d.id)}
            >
              <span className="sysmod-radio" />
              <span className="sysmod-row-text">
                <span className="sysmod-row-name">{d.name}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <div className="sysmod-error">{error}</div>}
    </div>
  );
};

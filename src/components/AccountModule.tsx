import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Lock, LogOut, Users } from "lucide-react";
import { openSetting, useArmed, usePolled, type AccountInfo } from "./SystemModuleShared";

/** Signed-in account with Lock, Switch user and Sign out. Ending the session needs a second click. */
export const AccountModule: React.FC = () => {
  const [info] = usePolled<AccountInfo>("get_account_cmd", undefined, 0);
  const [armed, setArmed] = useArmed();
  const [error, setError] = useState<string | null>(null);

  const run = (action: "lock" | "switch" | "signout") => {
    setError(null);
    if (action !== "lock" && armed !== action) {
      setArmed(action);
      return;
    }
    setArmed(null);
    invoke("hide_surface", { label: "quicksettings" }).catch(() => {});
    const call =
      action === "switch"
        ? invoke("switch_user_cmd")
        : invoke("power_action_cmd", { action: action === "lock" ? "lock" : "signout" });
    call.catch((e) => setError(String(e)));
  };

  return (
    <div className="sysmod-card">
      <div className="sysmod-head">
        <button
          type="button"
          className="sysmod-head-left"
          style={{ cursor: "pointer" }}
          onClick={() => openSetting("ms-settings:yourinfo")}
          aria-label="Account settings"
        >
          <span className="sysmod-avatar">{info?.initials ?? "?"}</span>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0, textAlign: "left" }}>
            <span className="sysmod-title" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {info?.displayName || "—"}
            </span>
            <span className="sysmod-sub">
              {info && info.userName && info.userName !== info.displayName ? info.userName : "Signed in"}
            </span>
          </span>
        </button>
      </div>
      <div className="sysmod-actions">
        <button type="button" className="sysmod-action" onClick={() => run("lock")}>
          <Lock size={13} strokeWidth={2.4} />
          <span>Lock</span>
        </button>
        <button
          type="button"
          className={`sysmod-action ${armed === "switch" ? "is-armed" : ""}`}
          onClick={() => run("switch")}
        >
          <Users size={13} strokeWidth={2.4} />
          <span>{armed === "switch" ? "Confirm" : "Switch"}</span>
        </button>
        <button
          type="button"
          className={`sysmod-action ${armed === "signout" ? "is-armed" : ""}`}
          onClick={() => run("signout")}
        >
          <LogOut size={13} strokeWidth={2.4} />
          <span>{armed === "signout" ? "Confirm" : "Sign out"}</span>
        </button>
      </div>
      {error && <div className="sysmod-error">{error}</div>}
    </div>
  );
};

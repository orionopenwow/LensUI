// Settings › Gaming and Accessibility: "Use a controller". ThumbDesk (github.com/orionopenwow/ThumbDesk)
// lets you use the whole PC from an Xbox or PlayStation controller. Lens installs it from Lens Apps
// as a portable program in its own apps folder (verified against the release's SHA-256 file), opens
// it, pins it to the Dock, and shows its status by reading ThumbDesk's local API. Lens never sends
// input for ThumbDesk and never calls its other endpoints. Nothing installs without two clicks here.
import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2 } from "lucide-react";
import { Row, StateNote } from "../settings/ui/primitives";
import { openLink, prepareRelease, removePortable, runRelease, discardRelease } from "../apps/api";
import type { PreparedRelease } from "../apps/types";
import type { LensConfig } from "../types/lens";
import { controllerLine, thumbdeskPin, type ThumbDeskInfo } from "./controller";

const HOME = "https://orionopenwow.github.io/ThumbDesk/";

export const ControllerCard: React.FC<{ config: LensConfig; updateConfig: (c: LensConfig) => void | Promise<unknown> }> = ({ config, updateConfig }) => {
  const [info, setInfo] = useState<ThumbDeskInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedRelease | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const refresh = useCallback(() => invoke<ThumbDeskInfo>("thumbdesk_info").then(setInfo).catch(() => setInfo(null)), []);
  useEffect(() => {
    refresh();
    // Light polling only while this card is on screen.
    const t = window.setInterval(refresh, 5000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const run = async (label: string, f: () => Promise<unknown>) => {
    setBusy(label);
    setMsg(null);
    try {
      await f();
    } catch (e) {
      setMsg({ kind: "error", text: String(e) });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const get = () =>
    run("Downloading…", async () => {
      setPrepared(await prepareRelease("thumbdesk"));
    });
  const keep = () =>
    run("Saving…", async () => {
      if (!prepared) return;
      await runRelease(prepared.token);
      setPrepared(null);
      setMsg({ kind: "info", text: "ThumbDesk is ready. Open it and plug in or pair a controller." });
    });
  const cancel = () => {
    if (prepared) discardRelease(prepared.token);
    setPrepared(null);
  };
  const pinned = !!info?.pinned;
  const togglePin = () => {
    if (!info?.path) return;
    const pins = config.dock?.pinnedApps ?? [];
    const next = pinned ? pins.filter((p) => p.path.toLowerCase() !== info.path!.toLowerCase()) : [...pins, thumbdeskPin(info.path)];
    Promise.resolve(updateConfig({ ...config, dock: { ...config.dock, pinnedApps: next } })).then(refresh, () => setMsg({ kind: "error", text: "Couldn't change the Dock." }));
  };

  return (
    <div className="sh-controller">
      <Row
        label={
          <>
            <Gamepad2 size={13} aria-hidden /> ThumbDesk
          </>
        }
        desc={
          info?.installed
            ? controllerLine(info)
            : "Use the whole PC from an Xbox or PlayStation controller: cursor, clicks, shortcuts, voice and scripts. Free and open source, from the makers of Lens."
        }
      >
        {info?.installed ? (
          <span className="sh-controller-actions">
            <button type="button" className="cc-btn" disabled={!!busy} onClick={() => run("Opening…", () => invoke("thumbdesk_open"))}>
              {info.running ? "Show" : "Open"}
            </button>
            <button type="button" className="cc-btn-ghost" disabled={!!busy} onClick={togglePin} aria-pressed={pinned}>
              {pinned ? "Unpin from Dock" : "Pin to Dock"}
            </button>
          </span>
        ) : prepared ? null : (
          <button type="button" className="cc-btn" disabled={!!busy} onClick={get}>
            {busy ?? "Get ThumbDesk"}
          </button>
        )}
      </Row>

      {prepared && (
        <div className="sh-controller-confirm" role="group" aria-label="Keep ThumbDesk">
          <div className="sh-controller-facts">
            <span>{prepared.fileName}</span>
            <span>{prepared.tag}</span>
            <span>{prepared.checksum === "verified" ? "Matches the published SHA-256" : "No checksum published"}</span>
            <span>{prepared.signatureStatus === "Valid" ? `Signed · ${prepared.publisher ?? "trusted"}` : "Not code-signed"}</span>
          </div>
          <p className="sh-controller-note">Lens keeps it in its own apps folder. Nothing runs until you open it, and Remove deletes it again.</p>
          <span className="sh-controller-actions">
            <button type="button" className="cc-btn" disabled={!!busy} onClick={keep}>
              Keep it
            </button>
            <button type="button" className="cc-btn-ghost" disabled={!!busy} onClick={cancel}>
              Cancel
            </button>
          </span>
        </div>
      )}

      {msg && <StateNote kind={msg.kind}>{msg.text}</StateNote>}

      <div className="sh-controller-links">
        <button type="button" className="cc-btn-ghost" onClick={() => openLink("thumbdesk", HOME).catch(() => undefined)}>
          About ThumbDesk
        </button>
        {info?.installed && (
          <button
            type="button"
            className="cc-btn-ghost"
            disabled={!!busy}
            onClick={() =>
              run("Removing…", async () => {
                if (pinned) togglePin();
                await removePortable("thumbdesk");
              })
            }
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
};

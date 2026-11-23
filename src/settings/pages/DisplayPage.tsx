import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sun, Moon, Monitor } from "lucide-react";
import type { MonitorInfo, QuickSettingsState } from "../../types/generated";
import { LinkRow, Row, Section, StateNote, Toggle, WinLink } from "../ui/primitives";
import { FillSlider } from "../ui/FillSlider";
import { optimistic, useResource } from "../useResource";
import type { PageProps } from "./common";

interface DisplayMode {
  device: string;
  width: number;
  height: number;
  refreshHz: number;
  bitsPerPixel: number;
}

export const DisplayPage: React.FC<PageProps> = ({ section }) => {
  const qs = useResource<QuickSettingsState>("get_quick_state_cmd");
  const monitors = useResource<MonitorInfo[]>("list_monitors_cmd", {}, { events: ["lens://windows-changed"] });
  const modes = useResource<DisplayMode[]>("sys_display_modes_cmd");
  const [err, setErr] = useState<string | null>(null);
  const s = qs.data;

  const setBrightness = (v: number) =>
    s && optimistic(s, { ...s, brightness: v }, qs.set, () => invoke("set_brightness_cmd", { level: v }), setErr, "brightness");
  const setNight = (enabled: boolean, warmth = s?.nightLightWarmth ?? 40) =>
    s &&
    optimistic(
      s,
      { ...s, nightLightEnabled: enabled, nightLightWarmth: warmth },
      qs.set,
      () => invoke("set_night_light_cmd", { enabled, warmth }),
      setErr,
      "night light"
    );

  const list = monitors.data ?? [];
  // Arrangement preview: scale the virtual desktop into a 100%-wide box.
  const minX = Math.min(0, ...list.map((m) => m.x));
  const minY = Math.min(0, ...list.map((m) => m.y));
  const maxX = Math.max(1, ...list.map((m) => m.x + m.width));
  const maxY = Math.max(1, ...list.map((m) => m.y + m.height));
  const spanW = maxX - minX;
  const spanH = maxY - minY;

  return (
    <>
      <div className="cc-card sh-mixer sh-lights">
        <div className="sh-mix-block">
          <FillSlider size="lg" label="Brightness" value={s?.brightness ?? 0} disabled={!s} icon={<Sun size={15} aria-hidden />} onCommit={setBrightness} />
        </div>
        <div className="sh-mix-block">
          <div className="sh-mix-head">
            <span>Night light</span>
            <Toggle label="Night light" checked={!!s?.nightLightEnabled} disabled={!s} onChange={(v) => setNight(v)} />
          </div>
          <FillSlider
            label="Warmth"
            value={s?.nightLightWarmth ?? 0}
            muted={!s?.nightLightEnabled}
            disabled={!s}
            icon={<Moon size={14} aria-hidden />}
            onCommit={(v) => setNight(true, v)}
          />
        </div>
      </div>
      {qs.loading && !s && <StateNote kind="loading">Reading display settings…</StateNote>}
      {(err || qs.error) && (
        <StateNote kind="error" action={<WinLink uri="ms-settings:display" compact label="Windows Settings" />}>
          {err ?? `Couldn't read display settings: ${qs.error}`}
        </StateNote>
      )}

      <Section id="monitors" title="Monitors" summary={list.length ? `${list.length} connected` : "—"} forceOpen={section === "monitors"}>
        {monitors.loading && !monitors.data && <StateNote kind="loading">Finding monitors…</StateNote>}
        {monitors.error && <StateNote kind="error">Couldn't list monitors: {monitors.error}</StateNote>}
        {list.length > 1 && (
          <div className="sh-arrange" aria-label="Monitor arrangement" role="img">
            <div className="sh-arrange-stage" style={{ aspectRatio: `${spanW} / ${spanH}` }}>
              {list.map((m, i) => (
                <div
                  key={m.id}
                  className={`sh-arrange-mon ${m.primary ? "primary" : ""}`}
                  style={{
                    left: `${((m.x - minX) / spanW) * 100}%`,
                    top: `${((m.y - minY) / spanH) * 100}%`,
                    width: `${(m.width / spanW) * 100}%`,
                    height: `${(m.height / spanH) * 100}%`,
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        )}
        {list.map((m, i) => {
          const mode = modes.data?.find((d) => d.device.toLowerCase() === m.id.toLowerCase());
          return (
            <Row
              key={m.id}
              label={
                <>
                  <Monitor size={13} aria-hidden /> Display {i + 1}
                  {m.primary ? " · main" : ""}
                </>
              }
              desc={m.id}
            >
              <span className="sh-value">
                {mode ? `${mode.width}×${mode.height} · ${mode.refreshHz} Hz` : `${m.width}×${m.height}`} · {Math.round(m.scale * 100)}%
              </span>
            </Row>
          );
        })}
        <LinkRow>
          <WinLink uri="ms-settings:display" label="Resolution & scale" />
          <WinLink uri="ms-settings:display-advanced" label="Refresh rate" />
        </LinkRow>
      </Section>

      <Section id="hdr" title="HDR & colour" summary="In Windows Settings" defaultOpen={section === "hdr"} forceOpen={section === "hdr"}>
        <StateNote kind="unavailable">Lens doesn't switch HDR itself: Windows has no safe public switch for it, so use Windows Settings.</StateNote>
        <LinkRow>
          <WinLink uri="ms-settings:display-hdr" label="HDR" />
          <WinLink uri="ms-settings:nightlight" label="Night light schedule" />
          <WinLink uri="ms-settings:display-advancedgraphics" label="Graphics" />
        </LinkRow>
      </Section>
    </>
  );
};

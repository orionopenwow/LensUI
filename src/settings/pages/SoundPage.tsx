import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Volume2, VolumeX, Speaker, Mic } from "lucide-react";
import type { AudioAppSession, AudioDeviceList, QuickSettingsState } from "../../types/generated";
import { Hero, HeroTile, LinkRow, Row, Section, Select, Slider, StateNote, Toggle, WinLink } from "../ui/primitives";
import { optimistic, useResource } from "../useResource";
import type { PageProps } from "./common";

const DeviceSelect: React.FC<{ list: AudioDeviceList | null; label: string; onPicked: () => void; onError: (m: string) => void }> = ({
  list,
  label,
  onPicked,
  onError,
}) => {
  if (!list) return <span className="sh-value">—</span>;
  if (!list.devices.length) return <span className="sh-value">None found</span>;
  const current = list.devices.find((d) => d.isDefault)?.id ?? list.devices[0].id;
  return (
    <Select
      label={label}
      value={current}
      disabled={!list.canSwitch}
      options={list.devices.map((d) => ({ id: d.id, label: d.name }))}
      onChange={(id) =>
        invoke("set_default_audio_device_cmd", { id })
          .then(onPicked)
          .catch((e) => onError(`Couldn't switch ${label.toLowerCase()}: ${e}`))
      }
    />
  );
};

export const SoundPage: React.FC<PageProps> = ({ section }) => {
  const qs = useResource<QuickSettingsState>("get_quick_state_cmd");
  const outs = useResource<AudioDeviceList>("list_audio_devices_cmd", { flow: "render" });
  const ins = useResource<AudioDeviceList>("list_audio_devices_cmd", { flow: "capture" });
  const apps = useResource<AudioAppSession[]>("list_audio_sessions_cmd", {}, { pollMs: 5000 });
  const [err, setErr] = useState<string | null>(null);
  const s = qs.data;
  const defaultOut = outs.data?.devices.find((d) => d.isDefault)?.name;

  const setVolume = (v: number) =>
    s && optimistic(s, { ...s, volume: v }, qs.set, () => invoke("set_volume_cmd", { level: v }), setErr, "volume");
  const setMute = (m: boolean) =>
    s && optimistic(s, { ...s, muted: m }, qs.set, () => invoke("set_mute_cmd", { muted: m }), setErr, "mute");

  return (
    <>
      <Hero>
        <HeroTile icon={<Volume2 size={15} aria-hidden />} label="Volume" value={s ? `${s.volume}%` : "—"}>
          <Slider label="Volume" value={s?.volume ?? 0} disabled={!s} onCommit={setVolume} />
        </HeroTile>
        <HeroTile icon={<VolumeX size={15} aria-hidden />} label="Mute" value={s?.muted ? "Muted" : "Sound on"} active={!!s?.muted}>
          <Toggle label="Mute" checked={!!s?.muted} disabled={!s} onChange={setMute} />
        </HeroTile>
        <HeroTile icon={<Speaker size={15} aria-hidden />} label="Output" sub={defaultOut ?? "—"}>
          <DeviceSelect list={outs.data} label="Output device" onPicked={outs.reload} onError={setErr} />
        </HeroTile>
      </Hero>
      {(err || qs.error) && (
        <StateNote kind="error" action={<WinLink uri="ms-settings:sound" compact label="Windows Settings" />}>
          {err ?? `Couldn't read sound settings: ${qs.error}`}
        </StateNote>
      )}
      {outs.data && !outs.data.canSwitch && (
        <StateNote kind="unavailable">This version of Windows doesn't let apps switch the default device; pick it in Windows Settings.</StateNote>
      )}

      <Section id="devices" title="Devices" summary={defaultOut ?? "Output and input"} forceOpen={section === "devices"}>
        <Row label={<><Speaker size={13} aria-hidden /> Output</>} desc="Speakers or headphones">
          <DeviceSelect list={outs.data} label="Output device" onPicked={outs.reload} onError={setErr} />
        </Row>
        <Row label={<><Mic size={13} aria-hidden /> Input</>} desc="Microphone">
          <DeviceSelect list={ins.data} label="Input device" onPicked={ins.reload} onError={setErr} />
        </Row>
        <LinkRow>
          <WinLink uri="ms-settings:sound-devices" label="All sound devices" />
          <WinLink uri="ms-settings:sound" label="Spatial sound" />
        </LinkRow>
      </Section>

      <Section id="mixer" title="App volume" summary={apps.data ? `${apps.data.length} app(s) playing` : "—"} forceOpen={section === "mixer"}>
        {apps.loading && !apps.data && <StateNote kind="loading">Finding apps that make sound…</StateNote>}
        {apps.data && !apps.data.length && <StateNote kind="info">No apps are making sound right now.</StateNote>}
        {apps.data?.map((a) => (
          <Row key={a.pid} label={a.name}>
            <div className="sh-inline">
              <Slider
                label={`${a.name} volume`}
                value={a.volume}
                onCommit={(v) =>
                  invoke("set_app_volume_cmd", { pid: a.pid, level: v }).catch((e) => setErr(`Couldn't change ${a.name}: ${e}`))
                }
              />
              <Toggle
                label={`Mute ${a.name}`}
                checked={!a.muted}
                onChange={(on) =>
                  invoke("set_app_mute_cmd", { pid: a.pid, muted: !on })
                    .then(apps.reload)
                    .catch((e) => setErr(`Couldn't mute ${a.name}: ${e}`))
                }
              />
            </div>
          </Row>
        ))}
        <LinkRow>
          <WinLink uri="ms-settings:apps-volume" label="Volume mixer" />
        </LinkRow>
      </Section>
    </>
  );
};

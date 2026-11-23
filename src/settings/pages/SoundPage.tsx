import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Volume2, VolumeX, Volume1, Mic, MicOff, Speaker, Headphones, ArrowLeftRight, ChevronDown, Check } from "lucide-react";
import type { AudioAppSession, AudioDeviceList, QuickSettingsState } from "../../types/generated";
import { LinkRow, Section, Select, StateNote, WinLink } from "../ui/primitives";
import { BarButton, FillSlider, LevelDot } from "../ui/FillSlider";
import { useResource } from "../useResource";
import { emptyMix, reorderSessions, type MixState } from "../audioOrder";
import type { PageProps } from "./common";

interface AudioLevels {
  masterPeak: number;
  sessions: { pid: number; active: boolean; peak: number }[];
  mic: { available: boolean; volume: number; muted: boolean; peak: number };
}

const LAST_OUTPUTS = "lens.sound.lastOutputs";
const readLast = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_OUTPUTS) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 2) : [];
  } catch {
    return [];
  }
};
const writeLast = (ids: string[]) => {
  try {
    localStorage.setItem(LAST_OUTPUTS, JSON.stringify(ids.slice(0, 2)));
  } catch {
    /* storage unavailable: switching still works, it just isn't remembered */
  }
};

const deviceIcon = (name: string) => (/head|ear|buds|airpods|wh-|xm\d/i.test(name) ? <Headphones size={14} aria-hidden /> : <Speaker size={14} aria-hidden />);
const volIcon = (v: number, muted: boolean) => (muted || v === 0 ? <VolumeX size={15} aria-hidden /> : v < 50 ? <Volume1 size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />);

/** Keeps the page's visible-only polling in one place. */
function useVisibleInterval(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = window.setInterval(() => document.visibilityState === "visible" && ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

export const SoundPage: React.FC<PageProps> = ({ section }) => {
  const qs = useResource<QuickSettingsState>("get_quick_state_cmd");
  const outs = useResource<AudioDeviceList>("list_audio_devices_cmd", { flow: "render" });
  const ins = useResource<AudioDeviceList>("list_audio_devices_cmd", { flow: "capture" });
  const apps = useResource<AudioAppSession[]>("list_audio_sessions_cmd");
  const levels = useResource<AudioLevels>("sys_audio_levels_cmd");
  const [err, setErr] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [mix, setMix] = useState<MixState>(emptyMix);
  const [lastOutputs, setLastOutputs] = useState<string[]>(readLast);

  // Levels move fast (meters); the app list changes slowly.
  useVisibleInterval(levels.reload, 1500);
  useVisibleInterval(apps.reload, 4000);

  const s = qs.data;
  const sessions = apps.data ?? [];
  const lv = levels.data;

  // Stable ordering: rows only move when an app starts or stops playing.
  const sessionKey = sessions.map((x) => x.pid).join(",") + "|" + (lv?.sessions.filter((x) => x.active).map((x) => x.pid).join(",") ?? "");
  useEffect(() => {
    const activeOf = new Map((lv?.sessions ?? []).map((x) => [x.pid, x.active]));
    setMix((prev) => reorderSessions(prev, sessions.map((x) => ({ pid: x.pid, active: !!activeOf.get(x.pid) }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);
  const byPid = useMemo(() => new Map(sessions.map((x) => [x.pid, x])), [sessions]);
  const peakOf = (pid: number) => lv?.sessions.find((x) => x.pid === pid)?.peak ?? 0;
  const ordered = mix.order.map((pid) => byPid.get(pid)).filter((x): x is AudioAppSession => !!x);
  const playing = ordered.filter((x) => mix.active.has(x.pid));
  const others = ordered.filter((x) => !mix.active.has(x.pid));

  const fail = (what: string) => (e: unknown) => setErr(`Couldn't change ${what}: ${String(e).replace(/^Error:\s*/, "")}`);

  const setVolume = (v: number) => {
    if (!s) return;
    const prev = s;
    qs.set({ ...s, volume: v, muted: v === 0 ? s.muted : false });
    invoke("set_volume_cmd", { level: v })
      .then(() => (s.muted && v > 0 ? invoke("set_mute_cmd", { muted: false }) : undefined))
      .catch((e) => {
        qs.set(prev);
        fail("volume")(e);
      });
  };
  const toggleMute = () => {
    if (!s) return;
    const next = !s.muted;
    qs.set({ ...s, muted: next });
    invoke("set_mute_cmd", { muted: next }).catch((e) => {
      qs.set(s);
      fail("mute")(e);
    });
  };
  const setApp = (pid: number, patch: Partial<AudioAppSession>, call: Promise<unknown>, what: string) => {
    const before = sessions;
    apps.set(sessions.map((x) => (x.pid === pid ? { ...x, ...patch } : x)));
    call.catch((e) => {
      apps.set(before);
      fail(what)(e);
    });
  };

  const currentOut = outs.data?.devices.find((d) => d.isDefault);
  const pickOutput = (id: string) => {
    if (!outs.data || id === currentOut?.id) return;
    const before = outs.data;
    outs.set({ ...before, devices: before.devices.map((d) => ({ ...d, isDefault: d.id === id })) });
    const remembered = [id, ...(currentOut ? [currentOut.id] : []), ...lastOutputs].filter((x, i, a) => a.indexOf(x) === i).slice(0, 2);
    setLastOutputs(remembered);
    writeLast(remembered);
    invoke("set_default_audio_device_cmd", { id })
      .then(() => outs.reload())
      .catch((e) => {
        outs.set(before);
        fail("the output device")(e);
      });
  };
  // "Switch output": flip between the last two devices used (or the first other device).
  const switchTarget =
    outs.data?.devices.find((d) => d.id !== currentOut?.id && lastOutputs.includes(d.id)) ??
    outs.data?.devices.find((d) => d.id !== currentOut?.id);

  const mic = lv?.mic;
  const currentIn = ins.data?.devices.find((d) => d.isDefault);
  const setMic = (patch: { volume?: number; muted?: boolean }) => {
    if (!lv) return;
    const before = lv;
    levels.set({ ...lv, mic: { ...lv.mic, ...patch } });
    invoke<AudioLevels>("sys_set_mic_cmd", { volume: patch.volume ?? null, muted: patch.muted ?? null })
      .then((r) => r && levels.set(r))
      .catch((e) => {
        levels.set(before);
        fail("the microphone")(e);
      });
  };

  const appRow = (a: AudioAppSession) => (
    <FillSlider
      key={a.pid}
      label={a.name}
      value={a.volume}
      muted={a.muted}
      valueText={a.muted ? "Muted" : undefined}
      icon={a.iconDataUrl ? <img src={a.iconDataUrl} alt="" /> : <Volume2 size={14} aria-hidden />}
      onCommit={(v) => setApp(a.pid, { volume: v, muted: false }, invoke("set_app_volume_cmd", { pid: a.pid, level: v }), a.name)}
      trailing={
        <>
          <LevelDot level={a.muted ? 0 : peakOf(a.pid)} label={`${a.name} level`} />
          <BarButton
            label={a.muted ? `Unmute ${a.name}` : `Mute ${a.name}`}
            active={a.muted}
            onClick={() => setApp(a.pid, { muted: !a.muted }, invoke("set_app_mute_cmd", { pid: a.pid, muted: !a.muted }), a.name)}
          >
            {a.muted ? <VolumeX size={14} aria-hidden /> : <Volume2 size={14} aria-hidden />}
          </BarButton>
        </>
      }
    />
  );

  return (
    <>
      {(err || qs.error) && (
        <StateNote kind="error" action={<WinLink uri="ms-settings:sound" compact label="Windows Settings" />}>
          {err ?? `Couldn't read sound settings: ${qs.error}`}
        </StateNote>
      )}

      <div className="cc-card sh-mixer" id="sec-mixer">
        {/* 1. Master */}
        <div className="sh-mix-block">
          <FillSlider
            size="lg"
            label="Volume"
            value={s?.volume ?? 0}
            muted={!!s?.muted}
            valueText={s?.muted ? "Muted" : undefined}
            disabled={!s}
            icon={volIcon(s?.volume ?? 0, !!s?.muted)}
            onCommit={setVolume}
            trailing={
              <>
                <LevelDot level={s?.muted ? 0 : lv?.masterPeak ?? 0} label="Output level" />
                <BarButton label={s?.muted ? "Unmute" : "Mute"} active={!!s?.muted} onClick={toggleMute}>
                  {s?.muted ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
                </BarButton>
              </>
            }
          />
        </div>

        {/* 2–3. Apps */}
        <div className="sh-mix-block">
          <div className="sh-mix-head">
            <span>Playing now</span>
            <span className="sh-mix-count">{playing.length}</span>
          </div>
          {apps.loading && !apps.data && <StateNote kind="loading">Finding apps that make sound…</StateNote>}
          {apps.data && !playing.length && <div className="sh-mix-empty">Nothing is playing right now.</div>}
          {playing.map(appRow)}
          {others.length > 0 && (
            <>
              <button type="button" className="sh-mix-more" aria-expanded={showOthers} onClick={() => setShowOthers((v) => !v)}>
                <ChevronDown size={13} className={showOthers ? "open" : ""} aria-hidden />
                Other apps ({others.length})
              </button>
              {showOthers && others.map(appRow)}
            </>
          )}
        </div>

        {/* 4. Output */}
        <div className="sh-mix-block" id="sec-devices">
          <div className="sh-mix-head">
            <span>Output</span>
            {switchTarget && (
              <button type="button" className="cc-chip compact sh-switch" onClick={() => pickOutput(switchTarget.id)}>
                <ArrowLeftRight size={12} aria-hidden /> Switch to {switchTarget.name}
              </button>
            )}
          </div>
          {outs.data && !outs.data.canSwitch && <StateNote kind="unavailable">This version of Windows doesn't let apps switch the output; pick it in Windows Settings.</StateNote>}
          <div className="sh-devices" role="radiogroup" aria-label="Output device">
            {outs.data?.devices.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={d.isDefault}
                disabled={!outs.data?.canSwitch}
                className={`sh-device ${d.isDefault ? "on" : ""}`}
                onClick={() => pickOutput(d.id)}
              >
                {deviceIcon(d.name)}
                <span>{d.name}</span>
                {d.isDefault && <Check size={13} className="sh-device-check" aria-hidden />}
              </button>
            ))}
            {outs.data && !outs.data.devices.length && <div className="sh-mix-empty">No output devices found.</div>}
          </div>
        </div>

        {/* 5. Input */}
        <div className="sh-mix-block">
          <div className="sh-mix-head">
            <span>Microphone</span>
            {ins.data && ins.data.devices.length > 1 && (
              <Select
                label="Input device"
                value={currentIn?.id ?? ins.data.devices[0].id}
                disabled={!ins.data.canSwitch}
                options={ins.data.devices.map((d) => ({ id: d.id, label: d.name }))}
                onChange={(id) =>
                  invoke("set_default_audio_device_cmd", { id })
                    .then(() => ins.reload())
                    .catch(fail("the microphone"))
                }
              />
            )}
          </div>
          {mic && !mic.available ? (
            <div className="sh-mix-empty">No microphone is set up.</div>
          ) : (
            <FillSlider
              label={currentIn?.name ?? "Microphone"}
              value={mic?.volume ?? 0}
              muted={!!mic?.muted}
              valueText={mic?.muted ? "Muted" : undefined}
              disabled={!mic}
              icon={mic?.muted ? <MicOff size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
              onCommit={(v) => setMic({ volume: v })}
              trailing={
                <>
                  <LevelDot level={mic?.muted ? 0 : mic?.peak ?? 0} label="Microphone level" />
                  <BarButton label={mic?.muted ? "Unmute microphone" : "Mute microphone"} active={!!mic?.muted} onClick={() => setMic({ muted: !mic?.muted })}>
                    {mic?.muted ? <MicOff size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
                  </BarButton>
                </>
              }
            />
          )}
        </div>
      </div>

      {/* 6. Extras */}
      <Section id="extras" title="More sound settings" summary="App routing, spatial sound, all devices" defaultOpen={section === "extras"} forceOpen={section === "extras"}>
        <StateNote kind="info">Sending one app to a different speaker is done in Windows (App volume and device preferences): Windows has no public switch for apps to do it.</StateNote>
        <LinkRow>
          <WinLink uri="ms-settings:apps-volume" label="App volume & device preferences" />
          <WinLink uri="ms-settings:sound" label="Spatial sound" />
          <WinLink uri="ms-settings:sound-devices" label="All sound devices" />
        </LinkRow>
      </Section>
    </>
  );
};

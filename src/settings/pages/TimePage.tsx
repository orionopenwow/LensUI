import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Clock, Keyboard } from "lucide-react";
import type { KeyboardState } from "../../types/generated";
import { Hero, HeroTile, LinkRow, Row, Section, Select, StateNote, WinLink } from "../ui/primitives";
import { useResource } from "../useResource";
import type { PageProps } from "./common";

interface TimeState {
  timeZone: string;
  shortTime: string;
  clock24: boolean | null;
}

export const TimePage: React.FC<PageProps> = ({ section }) => {
  const t = useResource<TimeState>("sys_time_cmd");
  const kb = useResource<KeyboardState>("get_keyboard_layouts_cmd");
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const k = kb.data;
  const active = k?.layouts.find((l) => l.id === k.activeId);

  return (
    <>
      <Hero>
        <HeroTile
          icon={<Clock size={15} aria-hidden />}
          label="Time zone"
          value={now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: t.data?.clock24 === null || t.data?.clock24 === undefined ? undefined : !t.data.clock24 })}
          sub={t.data?.timeZone || "—"}
        />
        <HeroTile icon={<Keyboard size={15} aria-hidden />} label="Keyboard" value={active?.short ?? "—"} sub={active?.name}>
          {k && k.layouts.length > 1 && (
            <Select
              label="Keyboard layout"
              value={k.activeId}
              options={k.layouts.map((l) => ({ id: l.id, label: l.name }))}
              onChange={(id) =>
                invoke<KeyboardState>("set_keyboard_layout_cmd", { id })
                  .then(kb.adopt)
                  .catch((e) => setErr(`Couldn't switch keyboard: ${e}`))
              }
            />
          )}
        </HeroTile>
      </Hero>
      {err && <StateNote kind="error">{err}</StateNote>}
      <Section id="clock" title="Date & time" summary={t.data?.clock24 ? "24-hour clock" : "12-hour clock"} forceOpen={section === "clock"}>
        <Row label="Time zone" desc="Set automatically or by hand in Windows">
          <span className="sh-value">{t.data?.timeZone || "—"}</span>
        </Row>
        <Row label="Clock format" desc={`Pattern ${t.data?.shortTime || "—"}`}>
          <span className="sh-value">{t.data?.clock24 == null ? "—" : t.data.clock24 ? "24-hour" : "12-hour"}</span>
        </Row>
        <LinkRow>
          <WinLink uri="ms-settings:dateandtime" label="Date & time" />
          <WinLink uri="ms-settings:regionlanguage" label="Language & region" />
        </LinkRow>
      </Section>
      <Section id="keyboard" title="Keyboard layouts" summary={k ? `${k.layouts.length} installed` : "—"} forceOpen={section === "keyboard"}>
        {k?.layouts.map((l) => (
          <Row key={l.id} label={l.name} desc={l.short}>
            {l.id === k.activeId ? (
              <span className="sh-pill live">In use</span>
            ) : (
              <button
                type="button"
                className="cc-btn"
                onClick={() =>
                  invoke<KeyboardState>("set_keyboard_layout_cmd", { id: l.id })
                    .then(kb.adopt)
                    .catch((e) => setErr(`Couldn't switch keyboard: ${e}`))
                }
              >
                Use
              </button>
            )}
          </Row>
        ))}
        <LinkRow>
          <WinLink uri="ms-settings:typing" label="Typing" />
        </LinkRow>
      </Section>
    </>
  );
};

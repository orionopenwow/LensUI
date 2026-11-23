import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BellOff, Timer, Bell } from "lucide-react";
import type { DndStatus } from "../../types/generated";
import { Hero, HeroTile, LinkRow, Section, StateNote, Toggle, WinLink } from "../ui/primitives";
import { optimistic, useResource } from "../useResource";
import type { PageProps } from "./common";

const why: Record<string, string> = {
  manual: "Turned on by you",
  schedule: "Quiet hours",
  fullscreen: "A full-screen app is open",
};

export const FocusPage: React.FC<PageProps> = ({ section }) => {
  const dnd = useResource<DndStatus>("get_dnd_status_cmd", {}, { events: ["lens://dnd-changed"] });
  const [err, setErr] = useState<string | null>(null);
  const d = dnd.data;
  return (
    <>
      <Hero>
        <HeroTile icon={<BellOff size={15} aria-hidden />} label="Do not disturb" value={d?.active ? "On" : "Off"} sub={d?.active ? why[d.reason] ?? "" : "Lens pop-ups show"} active={!!d?.active}>
          <Toggle
            label="Do not disturb"
            checked={!!d?.manual}
            disabled={!d}
            onChange={(v) =>
              d && optimistic(d, { ...d, manual: v, active: v || d.scheduled || d.fullscreen }, dnd.set, () => invoke("set_dnd_cmd", { enabled: v }), setErr, "do not disturb")
            }
          />
        </HeroTile>
        <HeroTile icon={<Timer size={15} aria-hidden />} label="Focus session" sub="Timer with Windows Clock">
          <WinLink uri="ms-settings:focus" label="Open" compact />
        </HeroTile>
        <HeroTile icon={<Bell size={15} aria-hidden />} label="App notifications" sub="Which apps can notify you">
          <WinLink uri="ms-settings:notifications" label="Open" compact />
        </HeroTile>
      </Hero>
      {err && <StateNote kind="error">{err}</StateNote>}
      <StateNote kind="info">Quiet hours and full-screen auto-quiet are set in Notifications (Status › Notifications).</StateNote>
      <Section id="windows" title="Windows notifications" summary="In Windows Settings" defaultOpen={section === "windows"} forceOpen={section === "windows"}>
        <StateNote kind="info">Windows' own Do not disturb and per-app notification rules can only be changed in Windows Settings.</StateNote>
        <LinkRow>
          <WinLink uri="ms-settings:notifications" label="Notifications" />
          <WinLink uri="ms-settings:focus" label="Focus" />
        </LinkRow>
      </Section>
    </>
  );
};

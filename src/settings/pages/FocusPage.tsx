import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BellOff, Timer, Bell, MoonStar } from "lucide-react";
import { EmptyState } from "../../ui";
import type { DndStatus } from "../../types/generated";
import { Hero, HeroTile, LinkRow, Section, StateNote, Toggle, WinLink } from "../ui/primitives";
import { optimistic, useResource } from "../useResource";
import type { PageProps } from "./common";

const why: Record<string, string> = {
  manual: "Turned on by you",
  schedule: "Quiet hours",
  fullscreen: "A full-screen app is open",
};

export const FocusPage: React.FC<PageProps> = ({ section, slot }) => {
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
      {d && (
        <EmptyState
          icon={<MoonStar size={16} />}
          title={d.active ? "Lens is keeping quiet" : "Nothing is being held back"}
          body={
            d.active
              ? `${why[d.reason] ?? "Do not disturb is on"}. Pop-ups wait in the Notification Center until you're ready.`
              : "Turn on Do not disturb and Lens pop-ups wait quietly in the Notification Center. Quiet hours and full-screen auto-quiet live in Notifications."
          }
          action={
            d.active
              ? undefined
              : {
                  label: "Turn on Do not disturb",
                  onClick: () =>
                    optimistic(d, { ...d, manual: true, active: true }, dnd.set, () => invoke("set_dnd_cmd", { enabled: true }), setErr, "do not disturb"),
                }
          }
        />
      )}
      {/* Notification history, Feeds and Messages (the old Notifications page). */}
      {slot}
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

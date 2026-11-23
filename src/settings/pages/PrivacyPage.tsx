import React from "react";
import { Camera, Mic, MapPin, ShieldCheck } from "lucide-react";
import { Hero, HeroTile, LinkRow, Row, Section, StateNote, WinLink } from "../ui/primitives";
import { useResource } from "../useResource";
import type { PageProps } from "./common";

interface PrivacyUse {
  capability: "webcam" | "microphone" | "location";
  app: string;
  inUse: boolean;
}

const CAPS = [
  { id: "webcam", label: "Camera", icon: Camera, uri: "ms-settings:privacy-webcam" },
  { id: "microphone", label: "Microphone", icon: Mic, uri: "ms-settings:privacy-microphone" },
  { id: "location", label: "Location", icon: MapPin, uri: "ms-settings:privacy-location" },
] as const;

export const PrivacyPage: React.FC<PageProps> = ({ section }) => {
  const use = useResource<PrivacyUse[]>("sys_privacy_cmd", {}, { pollMs: 10000 });
  const list = use.data ?? [];
  return (
    <>
      <Hero>
        {CAPS.map((c) => {
          const active = list.filter((u) => u.capability === c.id && u.inUse);
          const Icon = c.icon;
          return (
            <HeroTile
              key={c.id}
              icon={<Icon size={15} aria-hidden />}
              label={c.label}
              value={use.data ? (active.length ? "In use" : "Not in use") : "—"}
              sub={active.map((a) => a.app).join(", ") || undefined}
              active={active.length > 0}
            />
          );
        })}
      </Hero>
      {use.error && <StateNote kind="error">Couldn't read privacy activity: {use.error}</StateNote>}
      <Section id="inuse" title="Recent use" summary="Desktop apps that used them" forceOpen={section === "inuse"}>
        <StateNote kind="info">Read from Windows' own privacy log. Lens never turns the camera, microphone or location on.</StateNote>
        {use.data && !list.length && <StateNote kind="info">No desktop app has used them yet.</StateNote>}
        {list.map((u) => (
          <Row key={`${u.capability}-${u.app}`} label={u.app} desc={CAPS.find((c) => c.id === u.capability)?.label}>
            <span className={`sh-pill ${u.inUse ? "live" : ""}`}>{u.inUse ? "Using now" : "Used before"}</span>
          </Row>
        ))}
        <LinkRow>
          {CAPS.map((c) => (
            <WinLink key={c.id} uri={c.uri} label={`${c.label} permissions`} />
          ))}
        </LinkRow>
      </Section>
      <Section id="security" title="Windows Security" summary="Virus & threat protection, firewall" defaultOpen={section === "security"} forceOpen={section === "security"}>
        <Row label={<><ShieldCheck size={13} aria-hidden /> Windows Security</>} desc="Protection status lives in the Windows Security app.">
          <WinLink uri="ms-settings:windowsdefender" label="Open" compact />
        </Row>
      </Section>
    </>
  );
};

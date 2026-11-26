import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Type, Sparkles, Contrast, ZoomIn } from "lucide-react";
import { Hero, HeroTile, LinkRow, Row, Section, StateNote, Toggle, WinLink } from "../ui/primitives";
import { optimistic, useResource } from "../useResource";
import type { PageProps } from "./common";
import { ControllerCard } from "../../components/ControllerCard";

interface AccessState {
  animations: boolean | null;
  highContrast: boolean | null;
  textScale: number | null;
}

export const AccessibilityPage: React.FC<PageProps> = ({ section, config, updateConfig }) => {
  const acc = useResource<AccessState>("sys_access_cmd");
  const [err, setErr] = useState<string | null>(null);
  const a = acc.data;
  const setAnim = (on: boolean) =>
    a && optimistic(a, { ...a, animations: on }, acc.set, () => invoke<AccessState>("sys_set_animations_cmd", { on }).then(acc.set), setErr, "animation effects");

  return (
    <>
      <Hero>
        <HeroTile icon={<Sparkles size={15} aria-hidden />} label="Animation effects" value={a?.animations == null ? "—" : a.animations ? "On" : "Off"} active={!!a?.animations}>
          <Toggle label="Animation effects" checked={!!a?.animations} disabled={a?.animations == null} onChange={setAnim} />
        </HeroTile>
        <HeroTile icon={<Type size={15} aria-hidden />} label="Text size" value={a?.textScale ? `${a.textScale}%` : "—"}>
          <WinLink uri="ms-settings:easeofaccess-display" label="Change" compact />
        </HeroTile>
        <HeroTile icon={<ZoomIn size={15} aria-hidden />} label="Magnifier" sub="Windows + Plus to start">
          <WinLink uri="ms-settings:easeofaccess-magnifier" label="Open" compact />
        </HeroTile>
      </Hero>
      {err && <StateNote kind="error">{err}</StateNote>}

      <Section id="vision" title="Vision" summary={a?.highContrast ? "Contrast theme on" : "Text size, contrast, magnifier"} forceOpen={section === "vision"}>
        <Row label={<><Contrast size={13} aria-hidden /> Contrast theme</>} desc="Lens follows Windows' contrast themes automatically.">
          <span className="sh-value">{a?.highContrast == null ? "—" : a.highContrast ? "On" : "Off"}</span>
        </Row>
        <LinkRow>
          <WinLink uri="ms-settings:easeofaccess-highcontrast" label="Contrast themes" />
          <WinLink uri="ms-settings:easeofaccess-narrator" label="Narrator" />
          <WinLink uri="ms-settings:easeofaccess-closedcaptioning" label="Captions" />
        </LinkRow>
      </Section>

      <Section id="motion" title="Motion" summary={a?.animations === false ? "Reduced" : "Normal"} forceOpen={section === "motion"}>
        <Row label="Animation effects" desc="Windows' own setting. Lens also calms its animations when this is off. Lens restores your original choice in Remove all Lens changes.">
          <Toggle label="Animation effects" checked={!!a?.animations} disabled={a?.animations == null} onChange={setAnim} />
        </Row>
        <LinkRow>
          <WinLink uri="ms-settings:easeofaccess-visualeffects" label="Visual effects" />
        </LinkRow>
      </Section>

      <Section id="controller" title="Use a controller" summary="Mouse and keyboard from a gamepad" defaultOpen={section === "controller"} forceOpen={section === "controller"}>
        <ControllerCard config={config} updateConfig={updateConfig} />
      </Section>
    </>
  );
};

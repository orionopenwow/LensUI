import React from "react";
import { Gamepad2, ShieldOff } from "lucide-react";
import { Hero, HeroTile, LinkRow, Row, Section, StateNote, Toggle, WinLink } from "../ui/primitives";
import { useResource } from "../useResource";
import type { PageProps } from "./common";

export const GamingPage: React.FC<PageProps> = ({ section, config, updateConfig }) => {
  const g = useResource<{ gameMode: boolean | null }>("sys_gaming_cmd");
  const pause = !!config.func.gamingPause;
  const setPause = (v: boolean) => updateConfig({ ...config, func: { ...config.func, gamingPause: v } });
  return (
    <>
      <Hero>
        <HeroTile icon={<Gamepad2 size={15} aria-hidden />} label="Game Mode" value={g.data?.gameMode == null ? "—" : g.data.gameMode ? "On" : "Off"} active={!!g.data?.gameMode}>
          <WinLink uri="ms-settings:gaming-gamemode" label="Change" compact />
        </HeroTile>
        <HeroTile icon={<ShieldOff size={15} aria-hidden />} label="Pause Lens in games" value={pause ? "On" : "Off"} active={pause}>
          <Toggle label="Pause Lens overlays in full-screen games and video" checked={pause} onChange={setPause} />
        </HeroTile>
      </Hero>
      <Section id="lens" title="Lens while gaming" summary={pause ? "Steps aside in full screen" : "Stays on"} forceOpen={section === "lens"}>
        <Row label="Pause overlays in full-screen games and video" desc="Dock effects, pointer effects and the living wallpaper pause. Lens never touches anti-cheat-protected games either way.">
          <Toggle label="Pause overlays in full-screen games and video" checked={pause} onChange={setPause} />
        </Row>
        <StateNote kind="info">Game Mode, Game Bar and captures are Windows features and are changed in Windows Settings.</StateNote>
        <LinkRow>
          <WinLink uri="ms-settings:gaming-gamemode" label="Game Mode" />
          <WinLink uri="ms-settings:gaming-gamebar" label="Game Bar" />
          <WinLink uri="ms-settings:gaming-gamedvr" label="Captures" />
        </LinkRow>
      </Section>
    </>
  );
};

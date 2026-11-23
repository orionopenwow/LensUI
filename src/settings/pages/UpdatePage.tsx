import React from "react";
import { RefreshCw, History } from "lucide-react";
import { Hero, HeroTile, LinkRow, Section, StateNote, WinLink } from "../ui/primitives";
import type { PageProps } from "./common";

export const UpdatePage: React.FC<PageProps> = ({ section }) => (
  <>
    <Hero>
      <HeroTile icon={<RefreshCw size={15} aria-hidden />} label="Windows Update" sub="Check, pause and restart times">
        <WinLink uri="ms-settings:windowsupdate" label="Open" compact />
      </HeroTile>
      <HeroTile icon={<History size={15} aria-hidden />} label="Update history" sub="What installed and when">
        <WinLink uri="ms-settings:windowsupdate-history" label="Open" compact />
      </HeroTile>
    </Hero>
    <Section id="windows" title="Windows Update" summary="In Windows Settings" forceOpen={section === "windows"}>
      <StateNote kind="info">
        Windows doesn't give apps a safe way to check or install updates, so Lens opens Windows Update instead. Lens's own updates are in
        Status › About &amp; Testing.
      </StateNote>
      <LinkRow>
        <WinLink uri="ms-settings:windowsupdate" label="Check for updates" />
        <WinLink uri="ms-settings:windowsupdate-history" label="Update history" />
      </LinkRow>
    </Section>
  </>
);

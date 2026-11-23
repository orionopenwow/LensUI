import React from "react";
import { HardDrive, Sparkles } from "lucide-react";
import { Hero, HeroTile, LinkRow, Meter, Row, Section, StateNote, WinLink } from "../ui/primitives";
import { fmtBytes, useResource } from "../useResource";
import type { PageProps } from "./common";

interface DriveInfo {
  root: string;
  label: string;
  kind: string;
  totalBytes: number;
  freeBytes: number;
}

export const StoragePage: React.FC<PageProps> = ({ section }) => {
  const drives = useResource<DriveInfo[]>("sys_drives_cmd");
  const list = drives.data ?? [];
  const system = list.find((d) => d.root.toUpperCase().startsWith("C")) ?? list[0];
  const low = list.filter((d) => d.kind === "fixed" && d.freeBytes / (d.totalBytes || 1) < 0.1);

  return (
    <>
      <Hero>
        <HeroTile
          icon={<HardDrive size={15} aria-hidden />}
          label={system ? `${system.root.replace(/\\$/, "")} free` : "Drive space"}
          value={system ? fmtBytes(system.freeBytes) : "—"}
          sub={system ? `of ${fmtBytes(system.totalBytes)}` : undefined}
        >
          {system && <Meter label="System drive used" value={system.totalBytes - system.freeBytes} max={system.totalBytes} />}
        </HeroTile>
        <HeroTile icon={<Sparkles size={15} aria-hidden />} label="Cleanup" sub="Temporary files and big items">
          <WinLink uri="ms-settings:storagerecommendations" label="Open" compact />
        </HeroTile>
        <HeroTile icon={<Sparkles size={15} aria-hidden />} label="Storage Sense" sub="Free space automatically">
          <WinLink uri="ms-settings:storagesense" label="Open" compact />
        </HeroTile>
      </Hero>
      {drives.loading && !drives.data && <StateNote kind="loading">Measuring drives…</StateNote>}
      {drives.error && <StateNote kind="error">Couldn't read drives: {drives.error}</StateNote>}
      {low.length > 0 && <StateNote kind="error">{low.map((d) => d.root).join(", ")} is almost full. Cleanup recommendations can help.</StateNote>}

      <Section id="drives" title="Drives" summary={`${list.length} drive(s)`} forceOpen={section === "drives"}>
        {list.map((d) => (
          <Row
            key={d.root}
            label={`${d.label || (d.kind === "fixed" ? "Local disk" : d.kind)} (${d.root.replace(/\\$/, "")})`}
            desc={`${fmtBytes(d.freeBytes)} free of ${fmtBytes(d.totalBytes)}`}
          >
            <div className="sh-meter-wrap">
              <Meter label={`${d.root} used`} value={d.totalBytes - d.freeBytes} max={d.totalBytes} />
            </div>
          </Row>
        ))}
        <LinkRow>
          <WinLink uri="ms-settings:storagesense" label="Storage settings" />
        </LinkRow>
      </Section>
    </>
  );
};

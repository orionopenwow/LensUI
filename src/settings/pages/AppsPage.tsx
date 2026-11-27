import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Rocket, AppWindow, Package } from "lucide-react";
import { Hero, HeroTile, LinkRow, Row, Section, StateNote, Toggle, WinLink } from "../ui/primitives";
import { optimistic, useResource } from "../useResource";
import type { PageProps } from "./common";
import { CoreAppLink } from "../../coreapps/CoreAppLink";

interface StartupEntry {
  name: string;
  command: string;
  enabled: boolean;
}

const exeName = (cmd: string) => {
  const m = cmd.match(/^"([^"]+)"/) ?? cmd.match(/^(\S+)/);
  const p = m ? m[1] : cmd;
  return p.split(/[\\/]/).pop() ?? p;
};

export const AppsPage: React.FC<PageProps> = ({ section }) => {
  const startup = useResource<StartupEntry[]>("sys_startup_list_cmd");
  const [err, setErr] = useState<string | null>(null);
  const list = startup.data ?? [];
  const on = list.filter((s) => s.enabled).length;

  const toggle = (name: string, enabled: boolean) => {
    const next = list.map((s) => (s.name === name ? { ...s, enabled } : s));
    optimistic(list, next, startup.set, () => invoke<StartupEntry[]>("sys_startup_set_cmd", { name, enabled }).then(startup.adopt), setErr, name);
  };

  return (
    <>
      <Hero>
        <HeroTile icon={<Rocket size={15} aria-hidden />} label="Startup apps" value={startup.data ? `${on} of ${list.length}` : "—"} sub="Start when you sign in" />
        <HeroTile icon={<AppWindow size={15} aria-hidden />} label="Default apps" sub="Browser, mail, photos…">
          <WinLink uri="ms-settings:defaultapps" label="Open" compact />
        </HeroTile>
        <HeroTile icon={<Package size={15} aria-hidden />} label="Installed apps" sub="Change or uninstall">
          <WinLink uri="ms-settings:appsfeatures" label="Open" compact />
        </HeroTile>
      </Hero>
      {(err || startup.error) && <StateNote kind="error" action={<WinLink uri="ms-settings:startupapps" compact label="Windows Settings" />}>{err ?? startup.error}</StateNote>}

      <Section id="startup" title="Startup apps" summary={startup.data ? `${on} on` : "—"} forceOpen={section === "startup"}>
        <StateNote kind="info">
          Same switch as Task Manager, for apps that start from your account. Lens remembers how each one was set before, and
          "Remove all Lens changes" puts it back.
        </StateNote>
        {startup.loading && !startup.data && <StateNote kind="loading">Reading startup apps…</StateNote>}
        {startup.data && !list.length && <StateNote kind="info">No per-user startup apps. Apps installed for everyone are in Windows Settings.</StateNote>}
        {list.map((s) => (
          <Row key={s.name} label={s.name} desc={exeName(s.command)}>
            <Toggle label={`Start ${s.name} with Windows`} checked={s.enabled} onChange={(v) => toggle(s.name, v)} />
          </Row>
        ))}
        <LinkRow>
          <WinLink uri="ms-settings:startupapps" label="All startup apps" />
          <CoreAppLink id="startup" label="Startup impact in Lens" />
        </LinkRow>
      </Section>

      <Section id="manage" title="Manage apps" summary="In Windows Settings" defaultOpen={false} forceOpen={section === "manage"}>
        <LinkRow>
          <WinLink uri="ms-settings:defaultapps" label="Default apps" />
          <WinLink uri="ms-settings:appsfeatures" label="Installed apps" />
          <CoreAppLink id="startup" view="uninstall" label="Uninstall with Lens" />
          <WinLink uri="ms-settings:optionalfeatures" label="Optional features" />
        </LinkRow>
      </Section>
    </>
  );
};

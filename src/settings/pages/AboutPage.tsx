import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { UpdatesCard } from "../../components/UpdatesCard";
import { CrashReportsCard } from "../../components/CrashReportsCard";
import { FailsafeCard } from "../../components/FailsafeCard";
import { SafetyCard } from "../../components/SafetyCard";
import { BackupRestoreCard } from "../../components/BackupRestoreCard";
import { TesterHubCard } from "../../tester/TesterHubCard";
import { ReportProblem } from "../../report/ReportProblem";
import { MagicPreviewSection } from "../../magicwaves/MagicPreviewSection";
import { LinkRow, Row, Section, StateNote, Toggle, WinLink } from "../ui/primitives";
import type { PageProps } from "./common";

/** Status › About & Testing: report a problem, Lens updates, crash reports, self-test, backups, Tester Hub. */
export const AboutPage: React.FC<PageProps> = ({ section, config, updateConfig }) => {
  const [selfTest, setSelfTest] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  return (
    <>
      <Section id="report" title="Report a problem" summary="See everything before it's shared" defaultOpen={section === "report"} forceOpen={section === "report"}>
        <ReportProblem />
      </Section>
      <Section id="updates" title="Updates & crash reports" summary="Lens updates are signed" forceOpen={section === "updates"}>
        <UpdatesCard />
        <CrashReportsCard />
      </Section>
      <Section id="setup" title="Setup" summary="Dock, colours and extras, nothing changes until Finish" forceOpen={section === "setup"}>
        <Row label="Run setup again" desc="Pick a Dock, colours and optional extras. Skipping keeps everything as it is.">
          <button type="button" className="cc-btn" data-setup-open onClick={() => void emit("lens://setup-open", true)}>
            Run setup
          </button>
        </Row>
      </Section>
      <Section id="safety" title="Safety net" summary="What Lens touches, Safe Mode, the ways back" defaultOpen={section === "safety"} forceOpen={section === "safety"}>
        <SafetyCard />
        <FailsafeCard />
      </Section>
      <Section id="selftest" title="Self-test" summary="Checks Lens without changing anything" forceOpen={section === "selftest"}>
        <Row label="Run self-test" desc="Report a problem (above) can attach it for you.">
          <button
            type="button"
            className="cc-btn"
            disabled={running}
            onClick={() => {
              setRunning(true);
              invoke<{ ok: boolean; text: string }>("run_self_test_cmd")
                .then((r) => setSelfTest(r.text))
                .catch((e) => setSelfTest(String(e)))
                .finally(() => setRunning(false));
            }}
          >
            {running ? "Running…" : "Run self-test"}
          </button>
        </Row>
        {selfTest && <pre className="cc-input sh-pre">{selfTest}</pre>}
      </Section>
      <Section id="backup" title="Back up & restore" summary="Settings, themes and Remove all Lens changes" defaultOpen={section === "backup"} forceOpen={section === "backup"}>
        <BackupRestoreCard />
        <Row label="Restore Windows settings changed here" desc="Startup apps and animation effects go back to how Windows had them.">
          <button
            type="button"
            className="cc-btn"
            onClick={() =>
              invoke<string>("sys_restore_cmd")
                .then(setRestoreMsg)
                .catch((e) => setRestoreMsg(`Couldn't restore everything: ${e}`))
            }
          >
            Restore
          </button>
        </Row>
        {restoreMsg && <StateNote kind="info">{restoreMsg}</StateNote>}
      </Section>
      <Section id="tester" title="Tester Hub" summary={config.tester?.enabled ? "Tester mode on" : "Checklist, log, report"} defaultOpen={section === "tester"} forceOpen={section === "tester"}>
        <Row label="Tester mode" desc="Shows a TEST BUILD badge in the top bar and turns on Ctrl+Alt+M to mark a moment in the log.">
          <Toggle label="Tester mode" checked={!!config.tester?.enabled} onChange={(v) => updateConfig({ ...config, tester: { enabled: v } })} />
        </Row>
        <TesterHubCard />
      </Section>
      <MagicPreviewSection config={config} updateConfig={updateConfig} section={section} />
      <LinkRow>
        <WinLink uri="ms-settings:about" label="About this PC" />
      </LinkRow>
    </>
  );
};

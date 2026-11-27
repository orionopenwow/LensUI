import React, { useMemo } from "react";
import { L } from "../loaders";
import { ago, buildBrief, ciHealth } from "../model/pulse";
import { fromBrain, fromCrashes, fromIssues, mergeInbox } from "../model/inbox";
import { rankSuggestions } from "../model/suggestions";
import { useSuggestions } from "./Suggestions";
import { Btn, LoadState, Muted, Page, Pill, Section, copyText, fmtDate, useLoad } from "../ui";

const FAMILIES = ["feature/", "fable/", "wave/", "site/", "research/", "run/", "fix/", "brain/"];

/** The two scheduled jobs, by the branch each one writes to. */
const SCHEDULES = [
  { name: "Research lookout", branch: "research/daily", cadence: "daily, 05:13 Phoenix" },
  { name: "Combinator scan", branch: "research/combinator", cadence: "Mon and Thu, early morning Phoenix" },
  { name: "Brain refresh", branch: "brain/refresh", cadence: "weekly (brain.yml)" },
];

export function Agents() {
  const branches = useLoad("branches", L.branches);
  const prs = useLoad("prs", L.prs);
  const issues = useLoad("issues", L.issues);
  const local = useLoad("local", L.local);
  const git = useLoad("git", L.git);
  const checks = useLoad("mainChecks", L.mainChecks);
  const { docs, decisions, list } = useSuggestions();

  const brief = useMemo(() => {
    const bugs = mergeInbox(fromIssues(issues.data?.issues ?? []), fromBrain(docs.data?.bugs ?? []), fromCrashes(local.data?.crashReports ?? []));
    return buildBrief({
      today: new Date().toISOString().slice(0, 10),
      main: checks.data ? ciHealth(checks.data.data.check_runs ?? []) : undefined,
      prs: prs.data?.prs ?? [],
      bugs,
      suggestions: rankSuggestions(list, decisions.data ?? {}),
      git: git.data,
      researchTop: docs.data?.dailyTop,
    });
  }, [issues.data, docs.data, local.data, checks.data, prs.data, list, decisions.data, git.data]);

  return (
    <Page title="Schedules & agents" sub="When the scheduled agents last ran, and every agent branch and PR by family." actions={<Btn weight="heavy" variant="primary" onClick={() => copyText(brief, "Copied the brief")}>Copy brief</Btn>}>
      <LoadState load={branches}>
        {(b) => (
          <>
            <Section title="Scheduled runs" sub="from the last commit on each branch">
              <ul className="mc-list">
                {SCHEDULES.map((s) => {
                  const br = b.find((x) => x.name === s.branch);
                  const age = br ? Date.now() - Date.parse(br.date) : Infinity;
                  return (
                    <li key={s.branch} className="mc-row">
                      <Pill tone={!br ? "muted" : age < 36 * 3600_000 ? "ok" : "warn"}>{br ? ago(Date.parse(br.date)) : "never"}</Pill>
                      <span className="mc-row-main">{s.name}</span>
                      <Muted>
                        {s.branch} · {s.cadence}
                        {br ? ` · ${br.subject}` : ""}
                      </Muted>
                    </li>
                  );
                })}
              </ul>
            </Section>
            <Section title="Agent branches" sub={`${b.length} remote branches`}>
              <div className="mc-cols">
                {FAMILIES.map((f) => {
                  const rows = b.filter((x) => x.family === f).slice(0, 8);
                  if (!rows.length) return null;
                  return (
                    <div key={f} className="mc-col">
                      <h3 className="mc-h3">
                        {f} <Muted>{b.filter((x) => x.family === f).length}</Muted>
                      </h3>
                      <ul className="mc-ul">
                        {rows.map((r) => {
                          const pr = prs.data?.prs.find((p) => p.headRef === r.name);
                          return (
                            <li key={r.name}>
                              <span className="mc-mono">{r.name.slice(f.length)}</span> <Muted>{fmtDate(r.date).slice(0, 10)}</Muted> {pr ? <Pill tone={pr.status.verdict === "READY" ? "ok" : pr.status.verdict === "BLOCKED" ? "bad" : "warn"}>#{pr.number}</Pill> : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        )}
      </LoadState>
      <Section title="Brief" sub="What Copy brief puts on the clipboard">
        <pre className="mc-pre">{brief}</pre>
      </Section>
    </Page>
  );
}

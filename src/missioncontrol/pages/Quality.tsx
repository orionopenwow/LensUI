import React from "react";
import { call } from "../api";
import { Btn, LoadState, Muted, Page, Pill, Section, Stat, Grid, fmtDate, useLoad } from "../ui";

interface Counts {
  rustPassed: number;
  rustFailed: number;
  bunPassed: number;
  bunFailed: number;
}
interface Job {
  name: string;
  conclusion: string | null;
  counts: Counts;
  perf: { scenario: string; p50: number; p95: number; longTasks: number; verdict: string }[];
  rigs: [string, string][];
  goldens: string[];
}
interface QualityData {
  runsScanned: number;
  flakes: { scenario: string; flakes: number; lastSeen: string; jobs: string[] }[];
  latest: { workflow: string; runId: number; sha: string; date: string; conclusion: string | null; jobs: Job[] }[];
}

export function Quality() {
  const q = useLoad("quality", () => call<QualityData>("mc_quality", { runs: 30 }));
  return (
    <Page title="Quality" sub="From the newest CI runs on main and the last 30 runs' reruns. Logs are cached, so a second look is free." actions={<Btn onClick={q.reload}>Scan again</Btn>}>
      <LoadState load={q}>
        {(d) => {
          const jobs = d.latest.flatMap((r) => r.jobs);
          const sum = jobs.reduce((a, j) => ({ rp: a.rp + j.counts.rustPassed, rf: a.rf + j.counts.rustFailed, bp: a.bp + j.counts.bunPassed, bf: a.bf + j.counts.bunFailed }), { rp: 0, rf: 0, bp: 0, bf: 0 });
          const perf = jobs.flatMap((j) => j.perf);
          const rigs = jobs.flatMap((j) => j.rigs);
          const goldens = [...new Set(jobs.flatMap((j) => j.goldens))];
          return (
            <>
              <Grid cols={4}>
                <Stat label="Rust tests" value={sum.rp || "—"} sub={sum.rf ? `${sum.rf} failed` : "none failed"} tone={sum.rf ? "bad" : "ok"} />
                <Stat label="bun tests" value={sum.bp || "—"} sub={sum.bf ? `${sum.bf} failed` : "none failed"} tone={sum.bf ? "bad" : "ok"} />
                <Stat label="Flaky scenarios" value={d.flakes.length} sub={`in ${d.runsScanned} runs`} tone={d.flakes.length ? "warn" : "ok"} />
                <Stat label="Golden diffs" value={goldens.length} sub="changed or missing renders" tone={goldens.length ? "warn" : "ok"} />
              </Grid>
              <Section title="Flaky-test leaderboard" sub="Failed, then passed when the same job was re-run">
                {d.flakes.length ? (
                  <ol className="mc-list">
                    {d.flakes.map((f) => (
                      <li key={f.scenario} className="mc-row">
                        <span className="mc-rank">{f.flakes}×</span>
                        <span className="mc-row-main mc-mono">{f.scenario}</span>
                        <Muted>
                          last {f.lastSeen} · {f.jobs.join(", ")}
                        </Muted>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mc-empty">No reruns that turned green in the scanned runs.</p>
                )}
              </Section>
              <Section title="Perf budgets" sub="Newest robustness run on main (4× CPU throttle)">
                {perf.length ? (
                  <div className="mc-table-wrap">
                    <table className="mc-table">
                      <thead>
                        <tr>
                          <th scope="col">Scenario</th>
                          <th scope="col">p50 ms</th>
                          <th scope="col">p95 ms</th>
                          <th scope="col">Long tasks</th>
                          <th scope="col">Budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perf.map((p) => (
                          <tr key={p.scenario}>
                            <td className="mc-mono">{p.scenario}</td>
                            <td>{p.p50}</td>
                            <td>
                              <span className="mc-bar" aria-hidden>
                                <span className={`mc-bar-fill ${p.p95 > 16.7 ? "is-over" : ""}`} data-pct={Math.min(100, Math.round((p.p95 / 33.4) * 10) * 10)} />
                              </span>
                              {p.p95}
                            </td>
                            <td>{p.longTasks}</td>
                            <td>{p.verdict === "ok" ? <Pill tone="ok">ok</Pill> : <Pill tone="warn">{p.verdict}</Pill>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mc-empty">No perf table in the newest robustness logs.</p>
                )}
              </Section>
              <Section title="Rigs" sub="Theme switching, hyper suite, visual and parity summaries">
                <ul className="mc-list">
                  {rigs.map(([k, v]) => (
                    <li key={k} className="mc-row">
                      <span className="mc-row-main mc-mono">{v}</span>
                    </li>
                  ))}
                  {!rigs.length ? <li className="mc-empty">No rig summaries found.</li> : null}
                </ul>
              </Section>
              <Section title="Golden diffs" sub="Re-record with tools/visual/from-log.mjs">
                {goldens.length ? (
                  <ul className="mc-files">
                    {goldens.map((g) => (
                      <li key={g} className="mc-mono">
                        {g}.png
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mc-empty">Every golden matches.</p>
                )}
              </Section>
              <p className="mc-foot">
                Runs: {d.latest.map((r) => `${r.workflow} ${fmtDate(r.date)} (${r.conclusion ?? "?"})`).join(" · ") || "none"}
              </p>
            </>
          );
        }}
      </LoadState>
    </Page>
  );
}

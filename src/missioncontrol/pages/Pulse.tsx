import React, { useEffect, useMemo } from "react";
import { stateGet, stateSet } from "../api";
import { L } from "../loaders";
import { fromBrain, fromCrashes, fromIssues, mergeInbox, openBySeverity } from "../model/inbox";
import { addTrendPoint, ago, board, ciHealth, devFolderLine, trendDelta, type TrendPoint } from "../model/pulse";
import { Grid, LoadState, Muted, Page, Pill, Section, Stat, fmtDate, useLoad, type Tone } from "../ui";
import type { Go } from "../nav";

const HEALTH_TONE: Record<string, Tone> = { green: "ok", red: "bad", running: "warn", unknown: "muted" };

export function Pulse({ go }: { go: Go }) {
  const checks = useLoad("mainChecks", L.mainChecks);
  const pages = useLoad("pages", L.pages);
  const prs = useLoad("prs", L.prs);
  const releases = useLoad("releases", L.releases);
  const git = useLoad("git", L.git);
  const docs = useLoad("docs", L.docs);
  const issues = useLoad("issues", L.issues);
  const local = useLoad("local", L.local);
  const repo = useLoad("repo", L.repo);
  const trend = useLoad("trend", () => stateGet<{ points?: TrendPoint[] }>("trend"));

  // One stars/issues point per day, from the cached repo answer (no extra API call).
  useEffect(() => {
    if (!repo.data || !trend.data) return;
    const today = new Date().toISOString().slice(0, 10);
    const points = addTrendPoint(trend.data.points ?? [], { date: today, stars: repo.data.data.stargazers_count ?? 0, issues: repo.data.data.open_issues_count ?? 0 });
    if (JSON.stringify(points) !== JSON.stringify(trend.data.points ?? [])) stateSet("trend", { points }).catch(() => {});
  }, [repo.data, trend.data]);

  const health = useMemo(() => ciHealth(checks.data?.data.check_runs ?? []), [checks.data]);
  const b = useMemo(() => board(prs.data?.prs ?? []), [prs.data]);
  const inbox = useMemo(() => mergeInbox(fromIssues(issues.data?.issues ?? []), fromBrain(docs.data?.bugs ?? []), fromCrashes(local.data?.crashReports ?? [])), [issues.data, docs.data, local.data]);
  const sev = openBySeverity(inbox);
  const latest = releases.data?.data?.[0];
  const delta = trendDelta(trend.data?.points ?? []);

  return (
    <Page title="Pulse" sub="Where Lens stands right now. Everything here is read-only.">
      <Grid cols={4}>
        <Stat label="main CI" tone={HEALTH_TONE[health.health]} value={health.health === "green" ? "Green" : health.health === "red" ? "Failing" : health.health === "running" ? "Running" : "—"} sub={health.failing.length ? health.failing.join(", ") : `${health.passed} checks passed`} />
        <Stat label="Pages deploy" tone={pages.data?.data.status === "built" ? "ok" : pages.data ? "warn" : "muted"} value={pages.data?.data.status ?? "—"} sub={fmtDate(pages.data?.data.created_at)} />
        <Stat label="Open PRs" value={prs.data?.prs.length ?? "—"} sub={`${b.READY.length} ready · ${b.WAIT.length} waiting · ${b.BLOCKED.length} blocked`} tone={b.BLOCKED.length ? "warn" : "ok"} />
        <Stat label="Latest release" value={latest?.tag_name ?? "—"} sub={latest ? `${latest.prerelease ? "beta" : "stable"} · ${fmtDate(latest.published_at)}` : "no releases yet"} />
      </Grid>

      <Section title="Pull requests" actions={<button className="mc-link" type="button" data-weight="light" onClick={() => go("prs")}>Open the board</button>}>
        <LoadState load={prs}>
          {(d) => (
            <ul className="mc-list">
              {d.prs.map((p) => (
                <li key={p.number} className="mc-row">
                  <Pill tone={p.status.verdict === "READY" ? "ok" : p.status.verdict === "BLOCKED" ? "bad" : "warn"}>{p.status.verdict}</Pill>
                  <span className="mc-row-main">
                    #{p.number} {p.title}
                  </span>
                  <Muted>{p.status.reasons[0] ?? p.headRef}</Muted>
                </li>
              ))}
            </ul>
          )}
        </LoadState>
      </Section>

      <Grid cols={3}>
        <Section title="Open bugs">
          <div className="mc-sev">
            {(["Critical", "High", "Medium", "Low"] as const).map((s) => (
              <button key={s} type="button" className={`mc-sev-cell is-${s.toLowerCase()}`} data-weight="light" onClick={() => go("bugs")} aria-label={`${sev[s]} ${s} bugs`}>
                <span className="mc-sev-n">{sev[s]}</span>
                <span className="mc-sev-l">{s}</span>
              </button>
            ))}
          </div>
        </Section>
        <Section title="Dev folder" actions={<button className="mc-link" type="button" data-weight="light" onClick={() => go("dev")}>Manage</button>}>
          <LoadState load={git} empty="No dev folder found.">
            {(g) => <p className="mc-body">{devFolderLine(g)}</p>}
          </LoadState>
        </Section>
        <Section title="Stars and issues" sub="7 days">
          <p className="mc-body">
            {repo.data ? `${repo.data.data.stargazers_count} stars (${delta.stars >= 0 ? "+" : ""}${delta.stars}) · ${repo.data.data.open_issues_count} open issues (${delta.issues >= 0 ? "+" : ""}${delta.issues})` : "—"}
          </p>
          <Sparkline points={(trend.data?.points ?? []).map((p) => p.stars)} label="Stars per day" />
        </Section>
      </Grid>

      <Section title="Today's research, top 3" sub={docs.data?.dailyPath ?? undefined} actions={<button className="mc-link" type="button" data-weight="light" onClick={() => go("suggestions")}>All suggestions</button>}>
        <LoadState load={docs}>
          {(d) =>
            d.dailyTop.length ? (
              <ol className="mc-ol">
                {d.dailyTop.slice(0, 3).map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            ) : (
              <p className="mc-empty">No daily note found on research/daily.</p>
            )
          }
        </LoadState>
      </Section>
      {checks.data ? <p className="mc-foot">main checks {checks.data.fromCache ? `cached ${ago(checks.data.fetchedMs)}` : "just fetched"}{checks.data.offline ? " · offline" : ""}</p> : null}
    </Page>
  );
}

/** A tiny line of `points` (no axes; the numbers are next to it). */
export function Sparkline({ points, label }: { points: number[]; label: string }) {
  if (points.length < 2) return <Muted>Not enough days yet.</Muted>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((v, i) => `${(i / (points.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(" ");
  return (
    <svg className="mc-spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={`${label}: ${points[0]} to ${points[points.length - 1]}`}>
      <polyline points={d} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

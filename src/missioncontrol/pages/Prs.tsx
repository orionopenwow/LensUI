import React, { useMemo, useState } from "react";
import { call } from "../api";
import { L } from "../loaders";
import { board } from "../model/pulse";
import type { Pr, Verdict } from "../model/types";
import { Btn, LoadState, Mono, Muted, Page, Pill, Section, fmtDate, refreshAll, useConfirm, useLoad } from "../ui";

const TONE: Record<Verdict, "ok" | "warn" | "bad"> = { READY: "ok", WAIT: "warn", BLOCKED: "bad" };

export function Prs() {
  const prs = useLoad("prs", L.prs);
  const [sel, setSel] = useState<number | null>(null);
  const b = useMemo(() => board(prs.data?.prs ?? []), [prs.data]);
  const current = prs.data?.prs.find((p) => p.number === sel) ?? prs.data?.prs[0];
  return (
    <Page title="Pull requests" sub="READY when checks are done, an end-to-end job passed and every failure is a known flake. Nothing merges by itself." actions={<Btn onClick={prs.reload}>Refresh</Btn>}>
      <LoadState load={prs}>
        {() => (
          <div className="mc-split">
            <div className="mc-board" role="listbox" aria-label="Open pull requests">
              {(["BLOCKED", "READY", "WAIT"] as Verdict[]).map((v) => (
                <div key={v} className="mc-board-col">
                  <div className="mc-board-head">
                    <Pill tone={TONE[v]}>{v}</Pill> <Muted>{b[v].length}</Muted>
                  </div>
                  {b[v].map((p) => (
                    <button key={p.number} type="button" role="option" aria-selected={current?.number === p.number} data-weight="light" className={`mc-card-row ${current?.number === p.number ? "is-on" : ""}`} onClick={() => setSel(p.number)}>
                      <span className="mc-card-title">
                        #{p.number} {p.title}
                      </span>
                      <span className="mc-card-sub">{p.status.reasons[0] ?? `${p.headRef} · ${p.changedFiles ?? "?"} files`}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {current ? <PrDetail key={current.number} pr={current} /> : null}
          </div>
        )}
      </LoadState>
    </Page>
  );
}

function PrDetail({ pr }: { pr: Pr }) {
  const confirm = useConfirm();
  const files = useLoad(`files:${pr.number}`, () => call<{ files: { file: string; status: string; additions: number; deletions: number }[] }>("mc_pr_files", { number: pr.number }));
  const [comment, setComment] = useState("");
  const [method, setMethod] = useState<"merge" | "squash">("merge");
  const failedRuns = pr.status.failing;
  const realPcDone = pr.realPc.filter((i) => i.done).length;
  return (
    <div className="mc-detail" aria-label={`PR #${pr.number}`}>
      <div className="mc-detail-head">
        <Pill tone={TONE[pr.status.verdict]}>{pr.status.verdict}</Pill>
        <h2 className="mc-detail-title">
          #{pr.number} {pr.title}
        </h2>
      </div>
      <p className="mc-body">
        <Mono>{pr.headRef}</Mono> → <Mono>{pr.baseRef}</Mono> · head <Mono>{pr.headSha.slice(0, 7)}</Mono> · {pr.commits ?? "?"} commits · {pr.changedFiles ?? "?"} files · +{pr.additions ?? 0} −{pr.deletions ?? 0} · {pr.author ?? "?"} · updated {fmtDate(pr.updatedAt)}
      </p>
      {pr.status.reasons.length ? (
        <ul className="mc-reasons">
          {pr.status.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : null}

      <Section title="Checks" sub={`${pr.checks.length} runs`}>
        <ul className="mc-list">
          {pr.checks.map((c) => {
            const f = failedRuns.find((x) => x.id === c.id);
            return (
              <li key={c.id} className="mc-row is-stack">
                <div className="mc-row-line">
                  <Pill tone={c.conclusion === "success" ? "ok" : c.conclusion === "failure" ? (f?.knownFlake ? "warn" : "bad") : c.status !== "completed" ? "warn" : "muted"}>{c.conclusion ?? c.status}</Pill>
                  <span className="mc-row-main">{c.name}</span>
                  {f?.knownFlake ? <Pill tone="info">known flake</Pill> : f?.likelyFlake ? <Pill tone="info">likely flake</Pill> : null}
                </div>
                {c.conclusion === "failure" ? <LogExcerpt jobId={c.id} /> : null}
              </li>
            );
          })}
        </ul>
        {failedRuns.length ? (
          <div className="mc-actions">
            {[...new Set(failedRuns.map((f) => f.runId).filter((r): r is number => typeof r === "number"))].map((runId) => (
              <Btn key={runId} onClick={() => confirm({ kind: "rerun", runId, label: failedRuns.filter((f) => f.runId === runId).map((f) => f.name).join(", ") }, refreshAll)}>
                Re-run failed jobs of run {runId}…
              </Btn>
            ))}
            <Muted>Only the failed jobs run again; passed jobs keep their result.</Muted>
          </div>
        ) : null}
      </Section>

      <Section title="Real-PC checks" sub={pr.realPc.length ? `${realPcDone}/${pr.realPc.length} ticked in the PR` : "none listed"}>
        {pr.realPc.length ? (
          <ul className="mc-checklist">
            {pr.realPc.map((i, k) => (
              <li key={k} className={i.done ? "is-done" : ""}>
                <span aria-hidden>{i.done ? "✓" : "○"}</span> {i.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mc-empty">The PR body has no "Needs a real PC" list.</p>
        )}
      </Section>

      <Section title="Files" sub={files.data ? `${files.data.files.length} shown` : undefined}>
        <LoadState load={files}>
          {(d) => (
            <ul className="mc-files">
              {d.files.map((f) => (
                <li key={f.file}>
                  <Mono>{f.file}</Mono> <Muted>{f.status} +{f.additions} −{f.deletions}</Muted>
                </li>
              ))}
            </ul>
          )}
        </LoadState>
      </Section>

      <Section title="Comment">
        <textarea className="mc-input mc-textarea" aria-label="Comment text" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment for the PR" />
        <div className="mc-actions">
          <Btn disabled={!comment.trim()} onClick={() => confirm({ kind: "comment", issue: pr.number, body: comment }, () => setComment(""))}>
            Post comment…
          </Btn>
        </div>
      </Section>

      <Section title="Merge" sub="Pinned to the head you are looking at">
        <div className="mc-actions">
          <div className="mc-seg" role="radiogroup" aria-label="Merge method">
            {(["merge", "squash"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={method === m} data-weight="medium" className={method === m ? "is-on" : ""} onClick={() => setMethod(m)}>
                {m === "merge" ? "Merge commit" : "Squash"}
              </button>
            ))}
          </div>
          <Btn
            weight="heavy"
            variant="primary"
            disabled={pr.status.verdict !== "READY" || pr.headSha.length !== 40}
            onClick={() => confirm({ kind: "merge", pr: pr.number, sha: pr.headSha, method, title: pr.title, headRef: pr.headRef, baseRef: pr.baseRef, files: pr.changedFiles ?? 0, commits: pr.commits ?? 0 }, refreshAll)}
          >
            Merge #{pr.number}…
          </Btn>
        </div>
        {pr.status.verdict !== "READY" ? <p className="mc-muted">Merging is offered only for READY PRs.</p> : null}
      </Section>
    </div>
  );
}

function LogExcerpt({ jobId }: { jobId: number }) {
  const [open, setOpen] = useState(false);
  const log = useLoad(`log:${open ? jobId : 0}`, () => (open ? call<{ excerpt: string[]; scenarios: string[] }>("mc_job_log", { jobId }) : Promise.resolve({ excerpt: [], scenarios: [] })));
  return (
    <div className="mc-log">
      <button type="button" className="mc-link" data-weight="light" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide log excerpt" : "Show log excerpt"}
      </button>
      {open ? (
        <LoadState load={log}>
          {(d) => (
            <>
              {d.scenarios.length ? <p className="mc-body">Failed scenarios: {d.scenarios.join(", ")}</p> : null}
              <pre className="mc-pre">{d.excerpt.join("\n") || "No failure lines found in the log."}</pre>
            </>
          )}
        </LoadState>
      ) : null}
    </div>
  );
}

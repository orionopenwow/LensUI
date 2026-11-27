import React, { useMemo, useState } from "react";
import { stateGet, stateSet } from "../api";
import { L } from "../loaders";
import { decide, fromCatalog, fromIdeas, fromLeft, fromQuickWins, mergeSuggestions, queueMarkdown, rankSuggestions, type Decisions, type RankedSuggestion } from "../model/suggestions";
import { Btn, LoadState, Muted, Page, Pill, Section, useConfirm, useLoad } from "../ui";
import { toast } from "../../ui";

export function useSuggestions() {
  const docs = useLoad("docs", L.docs);
  const decisions = useLoad("decisions", () => stateGet<Decisions>("decisions"));
  const list = useMemo(
    () => (docs.data ? mergeSuggestions([fromIdeas(docs.data.ideas), fromCatalog(docs.data.catalog), fromLeft(docs.data.whatIsLeft, "dossier"), fromLeft(docs.data.fableLeft, "fable"), fromQuickWins(docs.data.dossiers)]) : []),
    [docs.data]
  );
  return { docs, decisions, list };
}

export function Suggestions() {
  const confirm = useConfirm();
  const { docs, decisions, list } = useSuggestions();
  const [d, setD] = useState<Decisions | null>(null);
  const current: Decisions = d ?? decisions.data ?? {};
  const [showRejected, setShowRejected] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const ranked = rankSuggestions(list, current, showRejected);

  const save = (next: Decisions) => {
    setD(next);
    stateSet("decisions", next).catch((e) => toast(String(e), { kind: "error" }));
  };
  const act = (s: RankedSuggestion, state: "accepted" | "deferred" | "rejected", why?: string) => {
    try {
      save(decide(current, s, state, why));
      setRejecting(null);
      setReason("");
    } catch (e) {
      toast(String((e as Error).message), { kind: "error" });
    }
  };
  const queued = Object.values(current).filter((x) => x.state === "accepted").length;
  const rejected = Object.values(current).filter((x) => x.state === "rejected").length;
  const publish = (asPr: boolean) => {
    const today = new Date().toISOString().slice(0, 10);
    const content = queueMarkdown(current, list, today);
    confirm(
      asPr
        ? { kind: "draftPr", branch: `mission/queue-${today}`, path: "docs/brain/QUEUE.md", content, title: `Queue for the next wave (${today})`, body: `Written by Lens Mission Control: ${queued} queued, ${rejected} rejected with reasons (the research lookout and the combinator scan read the Rejected list).` }
        : { kind: "localDraft", name: `QUEUE-${today}.md`, content }
    );
  };

  return (
    <Page
      title="Suggestions"
      sub="What Claude and the agents suggest next: research backlog, combinator candidates, what is left after Fable passes, and dossier quick wins. Rank = source score + effort, deferred items sink."
      actions={
        <>
          <Btn onClick={() => publish(false)} disabled={!queued && !rejected}>Save queue draft…</Btn>
          <Btn weight="heavy" variant="primary" onClick={() => publish(true)} disabled={!queued && !rejected}>Open queue PR…</Btn>
        </>
      }
    >
      <div className="mc-filters">
        <Pill tone="ok">{queued} queued</Pill>
        <Pill tone="muted">{rejected} rejected</Pill>
        <label className="mc-check">
          <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> Show rejected
        </label>
        {docs.data?.missing.length ? <Muted>Missing sources: {docs.data.missing.length} (see Setup)</Muted> : null}
      </div>
      <LoadState load={docs}>
        {() => (
          <Section title={`${ranked.length} suggestions`}>
            <ul className="mc-list">
              {ranked.map((s) => (
                <li key={s.id} className={`mc-row is-stack ${s.decision ? `is-${s.decision.state}` : ""}`}>
                  <div className="mc-row-line">
                    <span className="mc-rank" aria-label={`Rank ${s.score}`}>{s.score}</span>
                    <span className="mc-row-main">{s.title}</span>
                    {s.sources.map((x) => (
                      <Pill key={x} tone="info">{x}</Pill>
                    ))}
                    <Pill>{`effort ${s.effort}`}</Pill>
                    {s.decision ? <Pill tone={s.decision.state === "accepted" ? "ok" : s.decision.state === "rejected" ? "bad" : "warn"}>{s.decision.state}</Pill> : null}
                  </div>
                  <div className="mc-row-sub">
                    {s.area} · {s.status} · {s.detail}
                    {s.decision?.reason ? ` · reason: ${s.decision.reason}` : ""}
                  </div>
                  {rejecting === s.id ? (
                    <div className="mc-actions">
                      <input className="mc-input" autoFocus aria-label="Why reject it" placeholder="Why not (scans read this)" value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && act(s, "rejected", reason)} />
                      <Btn weight="heavy" variant="danger" disabled={!reason.trim()} onClick={() => act(s, "rejected", reason)}>
                        Reject
                      </Btn>
                      <Btn variant="ghost" onClick={() => setRejecting(null)}>Cancel</Btn>
                    </div>
                  ) : (
                    <div className="mc-actions">
                      <Btn onClick={() => act(s, "accepted")} disabled={s.decision?.state === "accepted"}>Accept → queue</Btn>
                      <Btn variant="ghost" onClick={() => act(s, "deferred")} disabled={s.decision?.state === "deferred"}>Defer</Btn>
                      <Btn variant="ghost" onClick={() => setRejecting(s.id)}>Reject…</Btn>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </LoadState>
    </Page>
  );
}

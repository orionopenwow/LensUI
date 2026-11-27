import React, { useMemo, useState } from "react";
import { call, stateGet, stateSet } from "../api";
import { L } from "../loaders";
import { filterInbox, fromBrain, fromCrashes, fromIssues, mergeInbox, type InboxItem, type InboxKind } from "../model/inbox";
import type { Decisions } from "../model/suggestions";
import { Btn, LoadState, Muted, Page, Pill, Section, useConfirm, useLoad, refreshAll } from "../ui";
import { toast } from "../../ui";

const SEV_TONE = { Critical: "bad", High: "bad", Medium: "warn", Low: "muted", "?": "muted" } as const;
const KIND_LABEL: Record<InboxKind, string> = { issue: "GitHub", brain: "BUGS.md", crash: "Crash" };

export function Bugs() {
  const issues = useLoad("issues", L.issues);
  const docs = useLoad("docs", L.docs);
  const local = useLoad("local", L.local);
  const [kind, setKind] = useState<InboxKind | "all">("all");
  const [openOnly, setOpenOnly] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const all = useMemo(() => mergeInbox(fromIssues(issues.data?.issues ?? []), fromBrain(docs.data?.bugs ?? []), fromCrashes(local.data?.crashReports ?? [])), [issues.data, docs.data, local.data]);
  const shown = filterInbox(all, { kind, open: openOnly ? true : undefined, q });
  const current = all.find((i) => i.id === sel) ?? shown[0];
  return (
    <Page title="Bugs" sub="GitHub issues labelled tester-report or bug, in-app reports, BUGS.md and crash reports on this PC, in one inbox." actions={<Btn onClick={refreshAll}>Refresh</Btn>}>
      <div className="mc-filters" role="toolbar" aria-label="Filter bugs">
        <div className="mc-seg" role="radiogroup" aria-label="Source">
          {(["all", "issue", "brain", "crash"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} data-weight="medium" className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>
              {k === "all" ? "All" : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label className="mc-check">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open only
        </label>
        <input className="mc-input mc-search" type="search" aria-label="Search bugs" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} data-mc-search />
        <Muted>{shown.length} shown</Muted>
      </div>
      <LoadState load={docs}>
        {() => (
          <div className="mc-split">
            <ul className="mc-list mc-scroll" role="listbox" aria-label="Bugs">
              {shown.map((i) => (
                <li key={i.id}>
                  <button type="button" role="option" aria-selected={current?.id === i.id} data-weight="light" className={`mc-row is-button ${current?.id === i.id ? "is-on" : ""}`} onClick={() => setSel(i.id)}>
                    <Pill tone={SEV_TONE[i.severity]}>{i.severity}</Pill>
                    <span className="mc-row-main">
                      <span className="mc-mono">{i.ref}</span> {i.title}
                    </span>
                    <Muted>{KIND_LABEL[i.kind]}{i.open ? "" : " · closed"}</Muted>
                  </button>
                </li>
              ))}
              {!shown.length ? <li className="mc-empty">Nothing matches.</li> : null}
            </ul>
            {current ? <Triage key={current.id} item={current} /> : null}
          </div>
        )}
      </LoadState>
      {issues.data?.offline ? <p className="mc-foot">Offline: issues are from the cache.</p> : null}
    </Page>
  );
}

function Triage({ item }: { item: InboxItem }) {
  const confirm = useConfirm();
  const [labels, setLabels] = useState("");
  const [note, setNote] = useState("");
  const [pr, setPr] = useState("");
  const [crash, setCrash] = useState<string | null>(null);
  const queue = async () => {
    const d = (await stateGet<Decisions>("decisions").catch(() => ({}))) as Decisions;
    const id = `bug:${item.ref}`;
    await stateSet("decisions", { ...d, [id]: { state: "accepted", at: new Date().toISOString().slice(0, 10), title: `Fix ${item.ref}: ${item.title}` } });
    toast("Queued for the next wave. Publish the queue from Suggestions.", { kind: "success" });
  };
  return (
    <div className="mc-detail" aria-label={`Bug ${item.ref}`}>
      <div className="mc-detail-head">
        <Pill tone={SEV_TONE[item.severity]}>{item.severity}</Pill>
        <h2 className="mc-detail-title">
          {item.ref} {item.title}
        </h2>
      </div>
      <p className="mc-body">{item.detail || "No details."}</p>
      {item.labels.length ? <p className="mc-body">Labels: {item.labels.join(", ")}</p> : null}
      <div className="mc-actions">
        <Btn onClick={queue}>Queue for next wave</Btn>
        {item.kind === "crash" ? <Btn onClick={() => call<string>("mc_crash", { name: item.ref }).then(setCrash).catch((e) => toast(String(e), { kind: "error" }))}>Show report</Btn> : null}
      </div>
      {crash ? <pre className="mc-pre">{crash}</pre> : null}
      {item.kind === "issue" && item.number ? (
        <>
          <Section title="Label">
            <div className="mc-actions">
              <input className="mc-input" aria-label="Labels, comma separated" placeholder="high, dock" value={labels} onChange={(e) => setLabels(e.target.value)} />
              <Btn disabled={!labels.trim()} onClick={() => confirm({ kind: "label", issue: item.number!, labels: labels.split(",").map((s) => s.trim()).filter(Boolean) }, () => setLabels(""))}>
                Add labels…
              </Btn>
            </div>
          </Section>
          <Section title="Link a PR">
            <div className="mc-actions">
              <input className="mc-input" aria-label="PR number" inputMode="numeric" placeholder="PR number" value={pr} onChange={(e) => setPr(e.target.value.replace(/\D/g, ""))} />
              <Btn disabled={!pr} onClick={() => confirm({ kind: "comment", issue: item.number!, body: `Tracked in #${pr}.` }, () => setPr(""))}>
                Comment "Tracked in #{pr || "…"}"…
              </Btn>
            </div>
          </Section>
          {item.open ? (
            <Section title="Close">
              <textarea className="mc-input mc-textarea" aria-label="Closing note" placeholder="Fixed in #120 — thanks for the report." value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="mc-actions">
                <Btn weight="heavy" variant="danger" onClick={() => confirm({ kind: "close", issue: item.number!, note, notPlanned: false }, refreshAll)}>
                  Close as fixed…
                </Btn>
                <Btn onClick={() => confirm({ kind: "close", issue: item.number!, note, notPlanned: true }, refreshAll)}>Close as not planned…</Btn>
              </div>
            </Section>
          ) : null}
        </>
      ) : null}
      {item.kind === "brain" ? <p className="mc-muted">BUGS.md rows change through a PR. Queue it, or open BUGS.md in Brain.</p> : null}
    </div>
  );
}

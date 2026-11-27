import React, { useMemo, useState } from "react";
import { call, stateGet, stateSet } from "../api";
import { L } from "../loaders";
import { buildChecklist, commentFor, dossierPatch, setResult, summarize, type CheckItem, type CheckResults, type CheckState } from "../model/checks";
import { Btn, LoadState, Page, Pill, Section, useConfirm, useLoad } from "../ui";
import { toast } from "../../ui";

const STATES: { id: CheckState; label: string }[] = [
  { id: "pass", label: "Pass" },
  { id: "fail", label: "Fail" },
  { id: "skip", label: "Skip" },
  { id: "todo", label: "To do" },
];

/** Downsizes a picked screenshot to ≤ 960 px wide JPEG (kept locally in checks.json). */
function shrink(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 960 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

export function Checks() {
  const confirm = useConfirm();
  const prs = useLoad("prs", L.prs);
  const merged = useLoad("merged", L.merged);
  const docs = useLoad("docs", L.docs);
  const saved = useLoad("checks", () => stateGet<CheckResults>("checks"));
  const [res, setRes] = useState<CheckResults | null>(null);
  const results = res ?? saved.data ?? {};
  const items = useMemo(() => buildChecklist(prs.data?.prs ?? [], merged.data ?? [], docs.data?.realPc ?? [], results), [prs.data, merged.data, docs.data, results]);
  const sum = summarize(items);
  const update = (id: string, patch: Parameters<typeof setResult>[2]) => {
    const next = setResult(results, id, patch);
    setRes(next);
    stateSet("checks", next).catch((e) => toast(String(e), { kind: "error" }));
  };
  const groups = useMemo(() => {
    const m = new Map<string, CheckItem[]>();
    for (const i of items) m.set(`${i.kind}|${i.ref}`, [...(m.get(`${i.kind}|${i.ref}`) ?? []), i]);
    return [...m.entries()];
  }, [items]);

  const post = (list: CheckItem[]) => {
    const n = list[0].number;
    if (!n) return;
    confirm({ kind: "comment", issue: n, body: commentFor(list) }, () => {
      let next = results;
      for (const i of list.filter((x) => x.result.state !== "todo")) next = setResult(next, i.id, { posted: new Date().toISOString().slice(0, 10) });
      setRes(next);
      stateSet("checks", next).catch(() => {});
    });
  };
  const dossierDraft = async (path: string, list: CheckItem[]) => {
    try {
      const doc = await call<{ text: string }>("mc_doc", { path });
      const today = new Date().toISOString().slice(0, 10);
      const content = dossierPatch(doc.text, list, today);
      if (content === doc.text) return toast("Nothing to write: no checked items matched lines in the dossier.", { kind: "info" });
      const name = path.split("/").pop()!.replace(".md", "");
      confirm({ kind: "draftPr", branch: `mission/real-pc-${name}-${today}`, path, content, title: `${name}: real-PC results (${today})`, body: "Real-PC check results recorded in Lens Mission Control." });
    } catch (e) {
      toast(String(e), { kind: "error" });
    }
  };

  return (
    <Page title="Real-PC checks" sub="Everything that says it needs a real PC, from open PRs, recently merged PRs and the dossiers. Results stay on this PC until you post them.">
      <div className="mc-filters">
        <Pill tone="warn">{sum.todo} to do</Pill>
        <Pill tone="ok">{sum.pass} passed</Pill>
        <Pill tone="bad">{sum.fail} failed</Pill>
        <Pill>{sum.skip} skipped</Pill>
      </div>
      <LoadState load={docs}>
        {() =>
          groups.length ? (
            <>
              {groups.map(([key, list]) => {
                const first = list[0];
                const checked = list.filter((i) => i.result.state !== "todo").length;
                return (
                  <Section
                    key={key}
                    title={first.kind === "dossier" ? first.ref : `${first.ref} ${first.kind === "merged" ? "(merged, unverified)" : "(open)"}`}
                    sub={`${checked}/${list.length} checked`}
                    actions={
                      first.kind === "dossier" ? (
                        <Btn disabled={!checked} onClick={() => dossierDraft(first.ref, list)}>Update dossier (draft PR)…</Btn>
                      ) : (
                        <Btn disabled={!checked} onClick={() => post(list)}>Post results as comment…</Btn>
                      )
                    }
                  >
                    <ul className="mc-list">
                      {list.map((i) => (
                        <li key={i.id} className={`mc-row is-stack is-check-${i.result.state}`}>
                          <div className="mc-row-line">
                            <span className="mc-row-main">{i.text}</span>
                            {i.doneInSource ? <Pill tone="ok">ticked in source</Pill> : null}
                            {i.result.posted ? <Pill tone="info">posted {i.result.posted}</Pill> : null}
                          </div>
                          <div className="mc-actions">
                            <div className="mc-seg" role="radiogroup" aria-label={`Result for: ${i.text.slice(0, 60)}`}>
                              {STATES.map((s) => (
                                <button key={s.id} type="button" role="radio" aria-checked={i.result.state === s.id} data-weight="medium" className={i.result.state === s.id ? `is-on is-${s.id}` : ""} onClick={() => update(i.id, { state: s.id })}>
                                  {s.label}
                                </button>
                              ))}
                            </div>
                            <input className="mc-input mc-grow" aria-label="Notes" placeholder="Notes (what you saw, which PC)" value={i.result.notes} onChange={(e) => update(i.id, { notes: e.target.value })} />
                            <label className="lens-btn is-sm mc-file" data-weight="medium">
                              {i.result.screenshot ? "Replace screenshot" : "Attach screenshot"}
                              <input type="file" accept="image/*" className="mc-sr" aria-label="Attach screenshot" onChange={(e) => e.target.files?.[0] && shrink(e.target.files[0]).then((s) => update(i.id, { screenshot: s }))} />
                            </label>
                          </div>
                          {i.result.screenshot ? <img className="mc-shot" src={i.result.screenshot} alt={`Screenshot for ${i.text.slice(0, 60)}`} /> : null}
                        </li>
                      ))}
                    </ul>
                  </Section>
                );
              })}
              <p className="mc-foot">Screenshots stay in .dev/mission-control/checks.json; comments only say one was taken. Attach it on GitHub by hand if needed.</p>
            </>
          ) : (
            <p className="mc-empty">No real-PC items found.</p>
          )
        }
      </LoadState>
    </Page>
  );
}

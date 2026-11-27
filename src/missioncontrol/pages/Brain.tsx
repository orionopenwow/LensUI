import React, { useEffect, useMemo, useState } from "react";
import { call } from "../api";
import { searchDocs, toBlocks, type DocText } from "../model/brain";
import { LoadState, Muted, Page, Section, useLoad } from "../ui";
import { Md } from "./Roadmap";

type Doc = { text: string; source: string; branch: string };

/** Main first; plans not merged yet (COMBINATOR.md, MODULES.md) from their branch. */
function readDoc(path: string): Promise<Doc> {
  return call<Doc>("mc_doc", { path }).catch(() => call<Doc>("mc_doc", { path, branch: "brain/combinator-plan" }));
}

export function Brain() {
  const index = useLoad("brainIndex", () => call<string[]>("mc_brain_index"));
  const [path, setPath] = useState("docs/brain/IDENTITY.md");
  const [q, setQ] = useState("");
  const [texts, setTexts] = useState<DocText[]>([]);
  const doc = useLoad(`doc:${path}`, () => readDoc(path));

  // Search loads every indexed doc once (local git reads; no API unless git fails).
  useEffect(() => {
    if (!q.trim() || texts.length || !index.data) return;
    Promise.all(index.data.map((p) => readDoc(p).then((d) => ({ path: p, text: d.text })).catch(() => null))).then((r) => setTexts(r.filter((x): x is DocText => !!x)));
  }, [q, texts.length, index.data]);
  const hits = useMemo(() => searchDocs(texts, q), [texts, q]);

  return (
    <Page title="Brain" sub="The project brain, design, safety contract and dossiers, read from the repo.">
      <div className="mc-filters">
        <input className="mc-input mc-search" type="search" aria-label="Search the brain" placeholder="Search every brain doc" value={q} onChange={(e) => setQ(e.target.value)} data-mc-search />
        {q ? <Muted>{texts.length ? `${hits.length} hits` : "Loading docs…"}</Muted> : null}
      </div>
      <div className="mc-split is-narrow">
        <nav className="mc-doclist" aria-label="Documents">
          <LoadState load={index}>
            {(list) => (
              <ul>
                {list.map((p) => (
                  <li key={p}>
                    <button type="button" data-weight="light" className={`mc-docbtn ${p === path ? "is-on" : ""}`} aria-current={p === path ? "page" : undefined} onClick={() => { setPath(p); setQ(""); }}>
                      {p.replace(/^docs\//, "")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </LoadState>
        </nav>
        <article className="mc-reader" aria-label={path}>
          {q.trim() ? (
            <Section title={`Results for “${q}”`}>
              <ul className="mc-list">
                {hits.map((h, i) => (
                  <li key={i}>
                    <button type="button" data-weight="light" className="mc-row is-button" onClick={() => { setPath(h.path); setQ(""); }}>
                      <span className="mc-row-main">
                        <span className="mc-mono">{h.path}:{h.line}</span> {h.snippet}
                      </span>
                      <Muted>{h.heading}</Muted>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : (
            <LoadState load={doc}>
              {(d) => (
                <div className="mc-md">
                  <p className="mc-foot">
                    {path} · {d.branch} · read from {d.source}
                  </p>
                  {toBlocks(d.text).map((b, i) =>
                    b.kind === "h" ? (
                      React.createElement(`h${Math.min(6, (b.level ?? 1) + 1)}`, { key: i, className: `mc-md-h is-${b.level}` }, <Md text={b.text} />)
                    ) : b.kind === "li" ? (
                      <div key={i} className={`mc-md-li is-${b.level}`}>
                        <Md text={b.text} />
                      </div>
                    ) : b.kind === "code" ? (
                      <pre key={i} className="mc-pre">{b.text}</pre>
                    ) : b.kind === "table" ? (
                      <div key={i} className="mc-table-wrap">
                        <table className="mc-table">
                          <tbody>
                            {(b.rows ?? []).map((r, j) => (
                              <tr key={j}>
                                {r.map((c, k) => (j === 0 ? <th key={k} scope="col"><Md text={c} /></th> : <td key={k}><Md text={c} /></td>))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p key={i} className="mc-md-p">
                        <Md text={b.text} />
                      </p>
                    )
                  )}
                </div>
              )}
            </LoadState>
          )}
        </article>
      </div>
    </Page>
  );
}

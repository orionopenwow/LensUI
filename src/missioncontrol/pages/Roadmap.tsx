import React from "react";
import { L } from "../loaders";
import { inline } from "../model/brain";
import type { Table } from "../model/types";
import { LoadState, Muted, Page, Pill, Section, useLoad } from "../ui";

const STATUS_TONE = (s: string) => (/^works/i.test(s) ? "ok" : /^partly/i.test(s) ? "warn" : /^broken/i.test(s) ? "bad" : "muted");

export function Md({ text }: { text: string }) {
  return (
    <>
      {inline(text).map((s, i) => (s.b ? <strong key={i}>{s.t}</strong> : s.c ? <code key={i} className="mc-mono">{s.t}</code> : <React.Fragment key={i}>{s.t}</React.Fragment>))}
    </>
  );
}

export function MdTable({ t, max }: { t: Table; max?: number }) {
  return (
    <div className="mc-table-wrap">
      <table className="mc-table">
        <thead>
          <tr>
            {t.headers.slice(0, max).map((h, i) => (
              <th key={i} scope="col">
                <Md text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i}>
              {r.slice(0, max).map((c, j) => (
                <td key={j}>
                  <Md text={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Roadmap() {
  const docs = useLoad("docs", L.docs);
  const local = useLoad("local", L.local);
  return (
    <Page title="Roadmap" sub="MASTERPLAN, the combinator horizons, the modular-Lens phases, dossier status and feature flags.">
      <LoadState load={docs}>
        {(d) => (
          <>
            <Section title="MASTERPLAN" sub="docs/MASTERPLAN.md › Roadmap">
              <div className="mc-cols">
                {d.masterplan.map((s) => (
                  <div key={s.title} className="mc-col">
                    <h3 className="mc-h3">{s.title}</h3>
                    <ul className="mc-ul">
                      {s.items.slice(0, 10).map((i, k) => (
                        <li key={k}>
                          <Md text={i} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {!d.masterplan.length ? <p className="mc-empty">No roadmap section found.</p> : null}
              </div>
            </Section>
            <Section title="Combinator horizons" sub="COMBINATOR.md §8">
              {d.horizons ? <MdTable t={d.horizons} max={4} /> : <p className="mc-empty">COMBINATOR.md isn't on main or brain/combinator-plan.</p>}
            </Section>
            <Section title="Modular Lens phases" sub="MODULES.md §9">
              {d.phases ? <MdTable t={d.phases} /> : <p className="mc-empty">MODULES.md not found.</p>}
            </Section>
            <Section title="Feature dossiers" sub="docs/features/README.md">
              <div className="mc-table-wrap">
                <table className="mc-table">
                  <thead>
                    <tr>
                      <th scope="col">Feature</th>
                      <th scope="col">Status</th>
                      <th scope="col">Top quick win</th>
                      <th scope="col">Top bug</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.dossiers.map((r) => (
                      <tr key={r.feature}>
                        <td>{r.feature}</td>
                        <td>
                          <Pill tone={STATUS_TONE(r.status)}>{r.status.split(" ")[0] || "?"}</Pill> <Muted>{r.status.split(" ").slice(1).join(" ")}</Muted>
                        </td>
                        <td>{r.quickWin}</td>
                        <td>{r.topBug}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}
      </LoadState>
      <Section title="Feature flags" sub="Switches in config.json with their defaults, and the kill switches (features.json)">
        <LoadState load={local}>
          {(l) => (
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th scope="col">Flag</th>
                    <th scope="col">Default</th>
                    <th scope="col">On this PC</th>
                  </tr>
                </thead>
                <tbody>
                  {l.flags.map((f) => (
                    <tr key={f.path}>
                      <td className="mc-mono">{f.path}</td>
                      <td>{String(f.default)}</td>
                      <td>{f.value === f.default ? <Muted>{String(f.value)}</Muted> : <Pill tone="info">{String(f.value)}</Pill>}</td>
                    </tr>
                  ))}
                  {l.killSwitches.map((k) => (
                    <tr key={k.id}>
                      <td className="mc-mono">features.json › {k.id}</td>
                      <td>on</td>
                      <td>{k.killed ? <Pill tone="bad">switched off</Pill> : <Muted>on</Muted>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LoadState>
      </Section>
    </Page>
  );
}

import React from "react";
import { CalendarPlus, Check, MapPin, Navigation } from "lucide-react";
import { browserOpen } from "./api";
import { directionsUrl, icsFor } from "./agent";
import { Key } from "./ApprovalCard";
import type { ResultCard } from "./guard";
import { oops } from "./oops";

function download(name: string, body: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** A stylised dithered map with numbered pins (no map tiles are loaded). */
export function DitherMap({ pins, title }: { pins: { label: string; pick?: boolean }[]; title?: string }) {
  // Spread pins on a gentle arc so labels don't collide.
  const pos = (i: number, n: number) => ({ left: `${12 + (76 * (i + 0.5)) / Math.max(1, n)}%`, top: `${30 + 34 * Math.sin((i / Math.max(1, n - 1)) * Math.PI)}%` });
  return (
    <div className="lb-map lens-dither" role="img" aria-label={`${title ?? "Map"}: ${pins.map((p) => p.label).join(", ")}`}>
      <span className="lb-map-you"><span className="lb-dot is-blue" /> You</span>
      {pins.map((p, i) => (
        <span key={i} className={`lb-map-pin${p.pick ? " is-pick" : ""}`} style={pos(i, pins.length)}>
          <span className="lb-map-n">{i + 1}</span>
          {p.label}
        </span>
      ))}
    </div>
  );
}

export function ResultView({ result, onOpen }: { result: ResultCard; onOpen?(url: string): void }) {
  const open = onOpen ?? ((u: string) => void browserOpen(u).catch(oops("open that link")));
  if (result.type === "table") {
    return (
      <div className="lb-card lb-result">
        {result.title ? <div className="lb-result-title">{result.title}</div> : null}
        <div className="lb-table-wrap">
          <table className="lb-table">
            <thead>
              <tr>
                <th aria-label="Rank" />
                {result.columns.map((c, i) => <th key={i}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={i} className={i === result.pick ? "is-pick" : ""}>
                  <td className="lb-mono lb-dim">{i + 1}</td>
                  {r.map((v, j) => (
                    <td key={j}>
                      {j === 0 ? <b>{v}</b> : v}
                      {j === 0 && i === result.pick ? <span className="lb-pick">My pick</span> : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.note ? <p className="lb-result-note">{result.note}</p> : null}
      </div>
    );
  }
  if (result.type === "map") {
    return (
      <div className="lb-card lb-result">
        <DitherMap pins={result.pins} title={result.title} />
      </div>
    );
  }
  const when = result.when ? new Date(result.when) : null;
  return (
    <div className="lb-card lb-place">
      <div className="lb-place-head">
        <span className="lb-place-icon"><MapPin size={16} /></span>
        <span className="lb-place-text">
          <b>{result.name}</b>
          <span className="lb-mono lb-dim">
            {[when ? when.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : null, result.sub].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="lb-place-ok" aria-label="Done"><Check size={14} /></span>
      </div>
      <div className="lb-place-actions">
        {result.when ? (
          <button data-weight="heavy" className="lb-btn lb-btn-sm lb-btn-primary" onClick={() => download(`${result.name.slice(0, 40)}.ics`, icsFor({ name: result.name, when: result.when!, address: result.address, url: result.url }), "text/calendar")}>
            <CalendarPlus size={13} /> Add to calendar <Key k="⏎" />
          </button>
        ) : null}
        <button data-weight="medium" className="lb-btn lb-btn-sm lb-btn-ghost" onClick={() => open(directionsUrl(result))}>
          <Navigation size={13} /> Directions <Key k="D" />
        </button>
      </div>
    </div>
  );
}

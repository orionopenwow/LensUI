// Minimal Adaptive Card renderer for Dashboard widgets (stub, wave M0): TextBlock, FactSet and
// Container only, rendered as plain React (no HTML injection, no scripts, no network).
import React from "react";
import type { CardElement } from "./format";

function Element({ el }: { el: CardElement }): React.ReactElement | null {
  switch (el.type) {
    case "TextBlock":
      return (
        <p className={`mac-text mac-${el.size ?? "default"}${el.weight === "bolder" ? " mac-bold" : ""}${el.isSubtle ? " mac-subtle" : ""}`}>
          {String(el.text ?? "")}
        </p>
      );
    case "FactSet":
      return (
        <dl className="mac-facts">
          {(el.facts ?? []).map((f, i) => (
            <React.Fragment key={i}>
              <dt>{String(f.title)}</dt>
              <dd>{String(f.value)}</dd>
            </React.Fragment>
          ))}
        </dl>
      );
    case "Container":
      return (
        <div className="mac-container">
          {(el.items ?? []).map((c, i) => (
            <Element key={i} el={c} />
          ))}
        </div>
      );
    default:
      return null;
  }
}

export const AdaptiveCard: React.FC<{ body: CardElement[] }> = ({ body }) => (
  <div className="mac">
    {body.map((el, i) => (
      <Element key={i} el={el} />
    ))}
  </div>
);

// Adaptive Card renderer for Dashboard widgets (wave M2). Renders only the safe subset that
// validateCard() lets through, as plain React: no HTML injection, no scripts, no styles from the
// card. Links open in Lens Browser through `onOpenUrl`; images come only from approved hosts.
import React from "react";
import type { CardElement } from "./format";

type Open = (url: string) => void;

function Element({ el, onOpenUrl }: { el: CardElement; onOpenUrl?: Open }): React.ReactElement | null {
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
            <Element key={i} el={c} onOpenUrl={onOpenUrl} />
          ))}
        </div>
      );
    case "ColumnSet":
      return (
        <div className="mac-columns">
          {(el.columns ?? []).map((col, i) => (
            <div key={i} className={`mac-column mac-column-${col.width ?? "stretch"}`}>
              {(col.items ?? []).map((c, j) => (
                <Element key={j} el={c} onOpenUrl={onOpenUrl} />
              ))}
            </div>
          ))}
        </div>
      );
    case "Image":
      return <img className={`mac-image mac-image-${el.size ?? "small"}`} src={el.url} alt={el.altText ?? ""} referrerPolicy="no-referrer" loading="lazy" />;
    case "ActionSet":
      return (
        <div className="mac-actions">
          {el.actions.map((a, i) => (
            <button key={i} type="button" className="mac-action" disabled={!onOpenUrl} onClick={() => onOpenUrl?.(a.url)}>
              {a.title}
            </button>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export const AdaptiveCard: React.FC<{ body: CardElement[]; onOpenUrl?: Open }> = ({ body, onOpenUrl }) => (
  <div className="mac">
    {body.map((el, i) => (
      <Element key={i} el={el} onOpenUrl={onOpenUrl} />
    ))}
  </div>
);

import React from "react";
import "./ui.css";

/**
 * Surface container at elevation 1 with the edge light. `flat` drops the shadow (cards in cards).
 * A card that opens something (has onClick) presses heavy (DESIGN.md §5.2) unless told otherwise.
 */
export const Card: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { flat?: boolean; as?: "div" | "section" | "article"; "data-weight"?: "light" | "medium" | "heavy" }
> = ({ flat, as = "div", className, children, ...rest }) =>
  React.createElement(
    as,
    { className: `lens-card ${flat ? "is-flat" : ""} ${className ?? ""}`, ...(rest.onClick ? { "data-weight": "heavy" } : {}), ...rest },
    children
  );

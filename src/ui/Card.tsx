import React from "react";
import "./ui.css";

/** Surface container at elevation 1 with the edge light. `flat` drops the shadow (cards in cards). */
export const Card: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { flat?: boolean; as?: "div" | "section" | "article" }
> = ({ flat, as = "div", className, children, ...rest }) =>
  React.createElement(as, { className: `lens-card ${flat ? "is-flat" : ""} ${className ?? ""}`, ...rest }, children);

// Entry for every Lens Snip window: ?surface=snip[&view=pin|rec|recbar&label=…]
import React from "react";
import "./snip.css";
import { useLensState } from "../hooks/useLensState";
import { Overlay } from "./Overlay";
import { Pin } from "./Pin";
import { RecBar, RecBorder } from "./Record";

export const SnipSurface: React.FC = () => {
  useLensState();
  const p = new URLSearchParams(location.search);
  const view = p.get("view");
  if (view === "pin") return <Pin label={p.get("label") ?? ""} />;
  if (view === "rec") return <RecBorder />;
  if (view === "recbar") return <RecBar />;
  return <Overlay />;
};

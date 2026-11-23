// A Settings link that opens a Lens core app (styled like the Windows links beside it).
import React from "react";
import { coreApp, openCoreApp, type CoreAppId } from "./registry";

export const CoreAppLink: React.FC<{ id: CoreAppId; label?: string; view?: string }> = ({ id, label, view }) => {
  const a = coreApp(id)!;
  return (
    <button type="button" className="cc-chip sh-winlink" onClick={() => openCoreApp(id, view).catch(() => {})} aria-label={`${label ?? a.title} (opens ${a.title})`}>
      <span>{label ?? a.title}</span>
    </button>
  );
};

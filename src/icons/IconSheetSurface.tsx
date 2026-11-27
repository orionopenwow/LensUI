// Test-only surface (?surface=iconsheet): Lens's whole app-icon set at 16, 24, 32 and 48 px on the
// current theme's dock colour. The visual suite records it in a dark and a light pack (DESIGN.md §3.7).
import React from "react";
import { useLensState } from "../hooks/useLensState";
import "./iconSheet.css";
import { LENS_APP_IDS, lensAppIconUrl, type LensAppIconId } from "./lensApps";

const IDS: LensAppIconId[] = [...LENS_APP_IDS, "browser"];
const SIZES = [16, 24, 32, 48];

export const IconSheetSurface: React.FC = () => {
  useLensState();
  return (
    <main className="lens-iconsheet" aria-label="Lens app icons">
      <div className="lens-iconsheet-grid">
        <span />
        {SIZES.map((s) => (
          <span key={s} className="lens-iconsheet-size">{s} px</span>
        ))}
        {IDS.map((id) => (
          <React.Fragment key={id}>
            <span>{id}</span>
            {SIZES.map((s) => (
              <img key={s} src={lensAppIconUrl(id)} width={s} height={s} alt={s === 48 ? id : ""} draggable={false} />
            ))}
          </React.Fragment>
        ))}
      </div>
    </main>
  );
};

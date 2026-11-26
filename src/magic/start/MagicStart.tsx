// Lens Magic Start (stub, wave M0). What a Windows-key tap opens when the Magic button is on.
// Later waves fill it with pinned apps, recent items, Magic actions and search; the stub shows
// the shape and the escape hatch.
import React from "react";
import { LensCloud } from "../../presence/LensCloud";

export const MagicStart: React.FC = () => (
  <section className="mstart" aria-label="Magic Start">
    <header className="mstart-head">
      <span className="mstart-orb" aria-hidden="true">
        <LensCloud />
      </span>
      <h1>Magic Start</h1>
    </header>
    <p className="mstart-note">Pinned apps, recent files and Magic actions arrive in a later update.</p>
    <p className="mstart-hint">Ctrl+Esc always opens Windows Start.</p>
  </section>
);

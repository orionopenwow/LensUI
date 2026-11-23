import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Keyboard } from "lucide-react";
import { openSetting, usePolled, type KeyboardState } from "./SystemModuleShared";

/** Installed keyboard layouts / input languages, with one-click switching.
 *  Renders nothing when only one layout is installed. */
export const KeyboardLayoutModule: React.FC = () => {
  const [state, , , setState] = usePolled<KeyboardState>("get_keyboard_layouts_cmd", undefined, 5000);
  if (!state || state.layouts.length < 2) return null;
  const active = state.layouts.find((l) => l.id === state.activeId);

  const choose = (id: string) => {
    setState({ ...state, activeId: id });
    invoke<KeyboardState>("set_keyboard_layout_cmd", { id })
      .then(setState)
      .catch(() => {});
  };

  return (
    <div className="sysmod-card">
      <div className="sysmod-head">
        <div className="sysmod-head-left">
          <Keyboard size={15} strokeWidth={2.4} color="var(--lens-fg-secondary)" />
          <div style={{ minWidth: 0 }}>
            <div className="sysmod-title">Keyboard</div>
            <div className="sysmod-sub">{active?.name ?? "—"}</div>
          </div>
        </div>
        <button type="button" className="sysmod-link" onClick={() => openSetting("ms-settings:regionlanguage")}>
          Languages
        </button>
      </div>
      <div className="sysmod-chips" role="radiogroup" aria-label="Keyboard layout">
        {state.layouts.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={l.id === state.activeId}
            aria-label={l.name}
            className={`sysmod-chip ${l.id === state.activeId ? "active" : ""}`}
            onClick={() => choose(l.id)}
          >
            {l.short}
          </button>
        ))}
      </div>
    </div>
  );
};

/** Top Bar chip showing the active input language; a click moves to the next one.
 *  Hidden when only one layout is installed. */
export const KeyboardTopBarModule: React.FC = () => {
  const [state, , , setState] = usePolled<KeyboardState>("get_keyboard_layouts_cmd", undefined, 2500);
  if (!state || state.layouts.length < 2) return null;
  const idx = Math.max(0, state.layouts.findIndex((l) => l.id === state.activeId));
  const active = state.layouts[idx];
  const next = state.layouts[(idx + 1) % state.layouts.length];
  return (
    <button
      type="button"
      className="sysmod-tb-kbd"
      aria-label={`${active?.short ?? "—"}: keyboard ${active?.name ?? ""}. Switch to ${next.name}`}
      onClick={() => {
        setState({ ...state, activeId: next.id });
        invoke<KeyboardState>("set_keyboard_layout_cmd", { id: next.id })
          .then(setState)
          .catch(() => {});
      }}
    >
      {active?.short ?? "—"}
    </button>
  );
};

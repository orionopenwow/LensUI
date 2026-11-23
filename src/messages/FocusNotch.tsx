import React, { useState } from "react";
import { Bell, BellOff, Star } from "lucide-react";
import { FOCUS_MODES, SNOOZE_OPTIONS } from "./model";

/** The Focus notch: a small pill that says how Messages may interrupt you, with a flyout. */
export function FocusNotch({ focus, onFocus, open: openInit = false }: { focus: string; onFocus(mode: "all" | "vip" | "snooze", minutes?: number): void; open?: boolean }) {
  const [open, setOpen] = useState(openInit);
  const icon = focus === "snoozed" ? <BellOff size={12} /> : focus === "vip" ? <Star size={12} /> : <Bell size={12} />;
  const label = focus === "snoozed" ? "Snoozed" : focus === "vip" ? "VIP" : "All";
  return (
    <span className="lm-notch-wrap">
      <button className={`lm-notch ${focus}`} aria-haspopup="menu" aria-expanded={open} aria-label={`Focus: ${label}`} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span>{label}</span>
      </button>
      {open ? (
        <div className="lm-notch-menu" role="menu">
          {FOCUS_MODES.filter((m) => m.id !== "snooze").map((m) => (
            <button
              key={m.id}
              role="menuitemradio"
              aria-checked={(m.id === "all" && focus === "all") || (m.id === "vip" && focus === "vip")}
              onClick={() => {
                onFocus(m.id);
                setOpen(false);
              }}
            >
              <span className="lm-menu-label">{m.label}</span>
              <span className="lm-menu-hint">{m.hint}</span>
            </button>
          ))}
          <div className="lm-menu-sep" />
          <div className="lm-menu-hint lm-menu-pad">Snooze for</div>
          <div className="lm-snooze">
            {SNOOZE_OPTIONS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  onFocus("snooze", m);
                  setOpen(false);
                }}
              >
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </span>
  );
}

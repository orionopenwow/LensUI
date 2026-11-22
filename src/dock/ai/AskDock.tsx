/**
 * Dock "Ask" mode. The Dock's search glide gains a second mode: Tab (or the sparkle) switches between
 * Search and Ask. The field spreads inside the Dock exactly like search (it reuses the glide bar classes,
 * so the Dock never widens and icons stay pushed right). Pressing Enter in Ask mode opens a compact
 * answer popover above the Dock.
 *
 * DockSurface integration: docs/AI_SURFACES.md §3a.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { AskPanel } from "../../ai/AskPanel";
import type { AiContext, AiStatus } from "../../ai/surfaceApi";
import "./aiDock.css";

export type DockFieldMode = "search" | "ask";

/** Tab toggles mode; returns true when it handled the key (so the Dock's own Tab handling is skipped). */
export function useAskMode(enabled: boolean, initial: DockFieldMode = "search") {
  const [mode, setMode] = useState<DockFieldMode>(initial);
  const toggle = useCallback(() => setMode((m) => (m === "search" ? "ask" : "search")), []);
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled) return false;
      if (e.key === "Tab" && !e.shiftKey && !e.altKey && !e.ctrlKey) {
        e.preventDefault();
        toggle();
        return true;
      }
      return false;
    },
    [enabled, toggle]
  );
  return { mode: enabled ? mode : "search", setMode, toggle, onKeyDown };
}

/**
 * Just the mode switch, for Docks that keep their own input (the current DockSurface magnifier + input).
 * Put it right after the input; it swaps between a magnifier and a sparkle.
 */
export const AskModeToggle: React.FC<{ mode: DockFieldMode; onToggle: () => void }> = ({ mode, onToggle }) => (
  <button
    type="button"
    className={`ai-dock-mode ${mode === "ask" ? "is-on" : ""}`}
    role="switch"
    aria-checked={mode === "ask"}
    aria-label={mode === "ask" ? "Ask mode (Tab for search)" : "Search mode (Tab to ask AI)"}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
  >
    <span className="ai-dock-mode-icon" key={mode}>
      {mode === "ask" ? <Sparkles size={16} strokeWidth={2.4} /> : <Search size={16} strokeWidth={2.4} />}
    </span>
  </button>
);

export interface AskDockFieldProps {
  mode: DockFieldMode;
  value: string;
  onChange: (v: string) => void;
  onToggleMode: () => void;
  /** Enter in Ask mode. */
  onAsk: (prompt: string) => void;
  /** Search-mode keys (arrows, Enter) still go to the Dock's search handler. */
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onEscape: () => void;
  closing?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

/** Drop-in replacement for the Dock's glide bar: same size, same animation, plus the mode toggle. */
export const AskDockField: React.FC<AskDockFieldProps> = ({
  mode,
  value,
  onChange,
  onToggleMode,
  onAsk,
  onSearchKeyDown,
  onEscape,
  closing,
  inputRef,
}) => {
  const ask = mode === "ask";
  return (
    <div className={`dock-search-glide-bar ai-dock-field ${ask ? "is-ask" : ""} ${closing ? "is-closing" : ""}`}>
      <button
        type="button"
        className="ai-dock-mode"
        role="switch"
        aria-checked={ask}
        aria-label={ask ? "Ask mode (Tab for search)" : "Search mode (Tab to ask AI)"}
        onClick={onToggleMode}
      >
        <span className="ai-dock-mode-icon" key={mode}>
          {ask ? <Sparkles size={16} strokeWidth={2.4} /> : <Search size={16} strokeWidth={2.4} />}
        </span>
      </button>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        className="dock-search-glide-input"
        value={value}
        placeholder={ask ? "Ask anything…" : "Search…"}
        aria-label={ask ? "Ask AI" : "Search"}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            onToggleMode();
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onEscape();
            return;
          }
          if (ask && e.key === "Enter" && value.trim()) {
            e.preventDefault();
            onAsk(value.trim());
            return;
          }
          if (!ask) onSearchKeyDown?.(e);
        }}
        autoFocus
      />
      <span className="ai-dock-tabhint" aria-hidden="true">
        Tab
      </span>
    </div>
  );
};

export interface AskDockPopoverProps {
  open: boolean;
  prompt: string;
  context?: AiContext;
  status?: AiStatus | null;
  onClose: () => void;
  onOpenSettings?: () => void;
  onContinueInClaude?: (text: string) => void;
  /** Which edge the Dock is on; the popover opens away from it. */
  edge?: "bottom" | "top" | "left" | "right";
  /** Shelf items to attach as context chips (e.g. picked with @ or dropped on the sparkle). */
  shelfIds?: string[];
}

/**
 * Compact answer card anchored to the Dock pill. The parent must be `position: relative`
 * (the Dock pill already is). A new prompt restarts the conversation.
 */
export const AskDockPopover: React.FC<AskDockPopoverProps> = ({
  open,
  prompt,
  context,
  status,
  onClose,
  onOpenSettings,
  onContinueInClaude,
  edge = "bottom",
  shelfIds,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`ai-dock-pop edge-${edge}`} role="dialog" aria-label="AI answer">
      <AskPanel
        key={prompt}
        compact
        status={status}
        initialPrompt={prompt}
        initialContext={context}
        initialShelfIds={shelfIds}
        autoSend
        onClose={onClose}
        onOpenSettings={onOpenSettings}
        onContinueInClaude={onContinueInClaude}
      />
    </div>
  );
};

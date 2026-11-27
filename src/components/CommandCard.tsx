// Control Center card: Lens Command preferences (`config.command`, see docs/COMMAND.md).
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LensConfig } from "../types/lens";
import { MODES, MODE_LABEL, type CommandTemplate, type Mode } from "../command/parse";
import {
  MINI_CARDS, normaliseCommandSettings, type AutoSource, type CommandProvider, type CommandSettings, type MiniCard,
} from "../command/settings";
import { DEFAULT_TILES, SPECIAL_PROMPTS } from "../command/contextProviders";
import type { Edge } from "../command/mini/edgeGeometry";

interface SelectionPolicy { bubble: boolean; readOnRequest: boolean; mode: "allow" | "deny"; apps: string[]; maxChars: number; version?: number }

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

const AUTO: { id: AutoSource; label: string; hint: string }[] = [
  { id: "selection", label: "Just copied", hint: "What you copied in the last 15 seconds" },
  { id: "clipboard", label: "Clipboard", hint: "Your latest clip" },
  { id: "window", label: "Window", hint: "The title of the window you came from" },
];
const PROVIDERS: { id: CommandProvider; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "script", label: "Offline" },
  { id: "local", label: "Local" },
  { id: "claude", label: "Claude" },
];
const WIDTHS = [560, 640, 720, 800];

export const CommandCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const s = normaliseCommandSettings((config as LensConfig & { command?: unknown }).command);
  const [templates, setTemplates] = useState<CommandTemplate[]>([]);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<SelectionPolicy | null>(null);
  const [newApp, setNewApp] = useState("");

  useEffect(() => {
    invoke<{ templates: CommandTemplate[]; error?: string | null; path: string }>("command_templates")
      .then((r) => {
        setTemplates(r?.templates ?? []);
        setPath(r?.path ?? "");
        setError(r?.error ?? null);
      })
      .catch(() => {});
    invoke<SelectionPolicy>("selection_policy_get").then(setPolicy).catch(() => {});
  }, []);
  const savePolicy = (patch: Partial<SelectionPolicy>) => {
    if (!policy) return;
    invoke<SelectionPolicy>("selection_policy_set", { policy: { ...policy, ...patch } }).then(setPolicy).catch((e) => setError(String(e)));
  };
  const baseTiles = s.miniTiles.base ?? DEFAULT_TILES.other;
  const tileChoices = ["ask", "shelf-add", ...templates.filter((t) => t.template).map((t) => t.id), ...Object.keys(SPECIAL_PROMPTS)];

  const save = (patch: Partial<CommandSettings>) =>
    onUpdateConfig({ ...config, command: { ...s, ...patch } } as LensConfig);

  const prompts = templates.filter((t) => t.template);

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Lens Command</div>
          <div className="cc-desc">One box for asking, doing, your Shelf and clipboard history. Opens with {s.hotkey}.</div>
        </div>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label="Lens Command"
          className={`cc-toggle ${s.enabled ? "on" : ""}`} onClick={() => save({ enabled: !s.enabled })} />
      </div>

      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">Shortcut</div>
          <div className="cc-desc">Use Ctrl, Alt, Shift or Win with a key, e.g. Ctrl+Alt+Space.</div>
        </div>
        <input className="cc-input" defaultValue={s.hotkey} aria-label="Shortcut" style={{ width: 160 }}
          onBlur={(e) => e.target.value.trim() && e.target.value !== s.hotkey && save({ hotkey: e.target.value.trim() })} />
      </div>

      <div className="cc-label" style={{ marginTop: 16 }}>Opens in</div>
      <div className="cc-chip-grid">
        {MODES.map((m: Mode) => (
          <button key={m} type="button" className={`cc-chip ${s.defaultMode === m ? "active" : ""}`} onClick={() => save({ defaultMode: m })}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="cc-label" style={{ marginTop: 16 }}>Offer as context when it opens</div>
      <div className="cc-desc">Shown as chips you can remove. Nothing is sent until you press Enter.</div>
      <div className="cc-chip-grid">
        {AUTO.map((a) => {
          const on = s.autoAttach.includes(a.id);
          return (
            <button key={a.id} type="button" className={`cc-chip ${on ? "active" : ""}`} aria-pressed={on}
              onClick={() => save({ autoAttach: on ? s.autoAttach.filter((x) => x !== a.id) : [...s.autoAttach, a.id] })}>
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="cc-label" style={{ marginTop: 16 }}>Look</div>
      <div className="cc-chip-grid">
        <button type="button" className={`cc-chip ${s.position === "center" ? "active" : ""}`} onClick={() => save({ position: "center" })}>Centre</button>
        <button type="button" className={`cc-chip ${s.position === "top" ? "active" : ""}`} onClick={() => save({ position: "top" })}>Top</button>
        <span style={{ width: 8 }} />
        <button type="button" className={`cc-chip ${s.density === "comfortable" ? "active" : ""}`} onClick={() => save({ density: "comfortable" })}>Comfortable</button>
        <button type="button" className={`cc-chip ${s.density === "compact" ? "active" : ""}`} onClick={() => save({ density: "compact" })}>Compact</button>
        <span style={{ width: 8 }} />
        {WIDTHS.map((w) => (
          <button key={w} type="button" className={`cc-chip ${s.width === w ? "active" : ""}`} onClick={() => save({ width: w })}>{w}px</button>
        ))}
      </div>

      <div className="cc-row" style={{ marginTop: 16 }}>
        <div>
          <div className="cc-label">Keep the conversation when it closes</div>
          <div className="cc-desc">In memory only; gone when Lens restarts.</div>
        </div>
        <button type="button" role="switch" aria-checked={s.keepThread} aria-label="Keep the conversation"
          className={`cc-toggle ${s.keepThread ? "on" : ""}`} onClick={() => save({ keepThread: !s.keepThread })} />
      </div>
      <div className="cc-row" style={{ marginTop: 12 }}>
        <div>
          <div className="cc-label">Show the Shelf beside it</div>
          <div className="cc-desc">Ctrl+B toggles it any time.</div>
        </div>
        <button type="button" role="switch" aria-checked={s.showShelfDrawer} aria-label="Show the Shelf"
          className={`cc-toggle ${s.showShelfDrawer ? "on" : ""}`} onClick={() => save({ showShelfDrawer: !s.showShelfDrawer })} />
      </div>


      <div className="cc-label" style={{ marginTop: 24 }}>Lens Mini</div>
      <div className="cc-row" style={{ marginTop: 4 }}>
        <div>
          <div className="cc-desc">A quick tap of {s.hotkey} opens Mini next to your pointer; tap again or press Expand for the full view.</div>
        </div>
        <button type="button" role="switch" aria-checked={s.miniOnTap} aria-label="Open Mini on a quick tap"
          className={`cc-toggle ${s.miniOnTap ? "on" : ""}`} onClick={() => save({ miniOnTap: !s.miniOnTap })} />
      </div>
      <div className="cc-desc" style={{ marginTop: 8 }}>Quick actions (in order; apps like code editors and terminals get their own set)</div>
      <div className="cc-chip-grid">
        {tileChoices.filter((id, i, a) => a.indexOf(id) === i).map((id) => {
          const idx = baseTiles.indexOf(id);
          return (
            <button key={id} type="button" className={`cc-chip ${idx >= 0 ? "active" : ""}`} aria-pressed={idx >= 0}
              onClick={() => {
                const next = idx >= 0 ? baseTiles.filter((t) => t !== id) : [...baseTiles, id].slice(-6);
                save({ miniTiles: { ...s.miniTiles, base: next } });
              }}>
              {idx >= 0 ? `${idx + 1}. ` : ""}{id === "shelf-add" ? "Add to Shelf" : id === "ask" ? "Ask" : `/${id}`}
            </button>
          );
        })}
      </div>
      <div className="cc-desc" style={{ marginTop: 8 }}>Glance cards</div>
      <div className="cc-chip-grid">
        {MINI_CARDS.map((c) => {
          const on = s.miniCards.includes(c.id);
          return (
            <button key={c.id} type="button" className={`cc-chip ${on ? "active" : ""}`} aria-pressed={on}
              onClick={() => save({ miniCards: on ? s.miniCards.filter((x) => x !== c.id) : ([...s.miniCards, c.id] as MiniCard[]) })}>
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="cc-row" style={{ marginTop: 24 }}>
        <div>
          <div className="cc-label">Edge Shelf</div>
          <div className="cc-desc">A thin tab on the edge of the screen. Hover or drag something over it to keep it on your Shelf. Hidden during games and fullscreen video.</div>
        </div>
        <button type="button" role="switch" aria-checked={s.edge.enabled} aria-label="Edge Shelf"
          className={`cc-toggle ${s.edge.enabled ? "on" : ""}`} onClick={() => save({ edge: { ...s.edge, enabled: !s.edge.enabled } })} />
      </div>
      {s.edge.enabled ? (
        <div className="cc-chip-grid">
          {(["left", "right", "top", "bottom"] as Edge[]).map((e) => (
            <button key={e} type="button" className={`cc-chip ${s.edge.edge === e ? "active" : ""}`} onClick={() => save({ edge: { ...s.edge, edge: e } })}>
              {e[0].toUpperCase() + e.slice(1)}
            </button>
          ))}
          <span style={{ width: 8 }} />
          <button type="button" className={`cc-chip ${s.edgeOnlyWhileDragging ? "active" : ""}`} onClick={() => save({ edgeOnlyWhileDragging: !s.edgeOnlyWhileDragging })}>
            Only while dragging
          </button>
        </div>
      ) : null}

      {policy ? (
        <>
          <div className="cc-row" style={{ marginTop: 24 }}>
            <div>
              <div className="cc-label">Selection bar</div>
              <div className="cc-desc">The selection bubble is now the Magic selection bar: Cut, Copy, Paste, Magic Search and your actions after you select text. Turn it on in AI & Command › Selection bar.</div>
            </div>
          </div>
          <div className="cc-row" style={{ marginTop: 12 }}>
            <div>
              <div className="cc-label">Read the selection when I open Mini</div>
              <div className="cc-desc">Also powers the “Add selection to Shelf” shortcut.</div>
            </div>
            <button type="button" role="switch" aria-checked={policy.readOnRequest} aria-label="Read the selection when I open Mini"
              className={`cc-toggle ${policy.readOnRequest ? "on" : ""}`} onClick={() => savePolicy({ readOnRequest: !policy.readOnRequest })} />
          </div>
          {policy.readOnRequest ? (
            <>
              <div className="cc-chip-grid" style={{ marginTop: 8 }}>
                <button type="button" className={`cc-chip ${policy.mode === "allow" ? "active" : ""}`} onClick={() => savePolicy({ mode: "allow" })}>Only these apps</button>
                <button type="button" className={`cc-chip ${policy.mode === "deny" ? "active" : ""}`} onClick={() => savePolicy({ mode: "deny" })}>All apps except these</button>
              </div>
              <div className="cc-chip-grid">
                {policy.apps.map((a) => (
                  <button key={a} type="button" className="cc-chip" aria-label={`Remove ${a}`} onClick={() => savePolicy({ apps: policy.apps.filter((x) => x !== a) })}>
                    {a.replace(/\.exe$/i, "")} ×
                  </button>
                ))}
                <form style={{ display: "inline-flex", gap: 4 }} onSubmit={(e) => {
                  e.preventDefault();
                  const v = (newApp.trim().split(/[\\/]/).pop() ?? "").toLowerCase();
                  if (v) savePolicy({ apps: [...policy.apps, v.endsWith(".exe") ? v : `${v}.exe`] });
                  setNewApp("");
                }}>
                  <input className="cc-input" value={newApp} onChange={(e) => setNewApp(e.target.value)} placeholder="app.exe" aria-label="Add app" style={{ width: 120 }} />
                </form>
              </div>
              <div className="cc-desc">The same list decides where the selection bar works.</div>
            </>
          ) : null}
        </>
      ) : null}

      <div className="cc-label" style={{ marginTop: 24 }}>Which AI each command uses</div>
      <div className="cc-desc">Local runs on this PC. Claude sends the text you see in the chips to Anthropic.</div>
      <div role="table" aria-label="Command providers" style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) auto", gap: "4px 16px", marginTop: 8, alignItems: "center" }}>
        {prompts.map((t) => {
          const cur = s.providers[t.id] ?? "default";
          return (
            <React.Fragment key={t.id}>
              <div role="cell" className="cc-desc" style={{ color: "var(--lens-fg)" }}>/{t.id}</div>
              <div role="cell" className="cc-chip-grid" style={{ flexWrap: "nowrap" }}>
                {PROVIDERS.map((p) => (
                  <button key={p.id} type="button" className={`cc-chip ${cur === p.id ? "active" : ""}`}
                    onClick={() => {
                      const next = { ...s.providers };
                      if (p.id === "default") delete next[t.id];
                      else next[t.id] = p.id;
                      save({ providers: next });
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="cc-desc" style={{ marginTop: 16 }}>
        Add your own commands in <code>{path || "%APPDATA%\\LensUI\\commands.json"}</code>. Templates can use {"{selection}"}, {"{clipboard}"}, {"{shelf}"}, {"{page}"} and {"{lang}"}.
        {error ? <span style={{ color: "var(--lens-danger)", display: "block", marginTop: 4 }}>{error}</span> : null}
      </div>
    </div>
  );
};

export default CommandCard;

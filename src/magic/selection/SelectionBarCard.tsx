// Settings › AI & Command › Selection bar (docs/plans/SELECTION_BAR.md §4). Simple: on/off,
// labels, clipboard buttons, your actions. Where it works: the selection policy (everywhere except
// a list, or only some apps). Advanced: trigger, delay, minimum, placement, hiding, hotkeys, smart
// actions, Magic Search sources and AI, learn from use. Every change goes through the one settings
// writer (updateConfig) except the app list, which is the selection policy's own file.
import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Row, Segmented, Select, Slider, StateNote, Toggle } from "../../settings/ui/primitives";
import { comboFromEvent, comboProblem, shortcutsFor } from "../../keys/shortcuts";
import { contextMenuGet } from "../../context/contract";
import { DEFAULT_PREFS, type MenuPrefs } from "../../context/actions";
import type { LensConfig } from "../../types/lens";
import type { SelectionPolicy } from "../../types/generated";
import { addAction, barCatalogue, barHotkeyProblem, barSettings, hotkeyHint, MAX_ACTIONS, moveAction, withBar } from "./model";
import "./selectionBarCard.css";

interface Props {
  config: LensConfig;
  updateConfig: (c: LensConfig) => void;
  advanced?: boolean;
}

function HotkeyField({ value, label, problem, onChange }: { value: string; label: string; problem: { level: string; message: string } | null; onChange: (v: string) => void }) {
  const [recording, setRecording] = useState(false);
  return (
    <span className="sbc-hotkey">
      <button
        type="button"
        className={`sbc-key${recording ? " is-recording" : ""}`}
        aria-label={value ? `${label}: ${value}. Press to change` : `${label}: none. Press to set`}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (!recording) return;
          e.preventDefault();
          if (e.key === "Escape") return setRecording(false);
          if (e.key === "Backspace" || e.key === "Delete") {
            onChange("");
            return setRecording(false);
          }
          const combo = comboFromEvent(e);
          if (combo) {
            onChange(combo);
            setRecording(false);
          }
        }}
      >
        {recording ? "Press keys…" : value ? hotkeyHint(value) : "None"}
      </button>
      {value ? (
        <button type="button" className="sbc-x" aria-label={`Clear ${label}`} onClick={() => onChange("")}>
          <X size={12} />
        </button>
      ) : null}
      {problem ? <span className={`sbc-problem is-${problem.level}`}>{problem.message}</span> : null}
    </span>
  );
}

export const SelectionBarCard: React.FC<Props> = ({ config, updateConfig, advanced = true }) => {
  const s = useMemo(() => barSettings(config), [config]);
  const [policy, setPolicy] = useState<SelectionPolicy | null>(null);
  const [prefs, setPrefs] = useState<MenuPrefs>(DEFAULT_PREFS);
  const [newApp, setNewApp] = useState("");
  const [adding, setAdding] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    invoke<SelectionPolicy>("selection_policy_get").then((p) => p && setPolicy(p)).catch(() => {});
    contextMenuGet()
      .then((m) => m?.prefs && setPrefs({ ...DEFAULT_PREFS, ...m.prefs }))
      .catch(() => {});
  }, []);
  const set = (patch: Parameters<typeof withBar>[1]) => updateConfig(withBar(config, patch));
  const savePolicy = (patch: Partial<SelectionPolicy>) => {
    if (!policy) return;
    invoke<SelectionPolicy>("selection_policy_set", { policy: { ...policy, ...patch } })
      .then((p) => p && setPolicy(p))
      .catch((e) => setError(String(e)));
  };
  const catalogue = barCatalogue(prefs);
  const byId = new Map(catalogue.map((a) => [a.id, a]));
  const sheet = shortcutsFor(config);
  const problemFor = (id: string) => (combo: string) => barHotkeyProblem(combo, id, s, (c) => comboProblem(c, `bar:${id}`, sheet));
  const addable = catalogue.filter((a) => !s.actions.includes(a.id));

  return (
    <div className="sbc">
      <Row label="Selection bar" desc="After you select text anywhere, a small bar offers Cut, Copy and Paste (when they'd work), Magic Search and your actions. It never takes the keyboard from the app.">
        <Toggle label="Selection bar" checked={s.enabled} onChange={(v) => set({ enabled: v })} />
      </Row>
      {s.enabled ? (
        <StateNote kind="info">Lens reads a selection with Windows accessibility after you finish selecting, never with the clipboard. Password fields, elevated apps, games, password managers and the apps below are never read.</StateNote>
      ) : null}

      <Row label="Button labels" desc="Icons only, a label when you point at a button, or always.">
        <Segmented label="Button labels" value={s.labels as "off" | "hover" | "always"} options={[{ id: "off", label: "Off" }, { id: "hover", label: "On hover" }, { id: "always", label: "Always" }]} onChange={(v) => set({ labels: v })} />
      </Row>
      <Row label="Cut button" desc="Only where the text can be edited.">
        <Toggle label="Cut button" checked={s.showCut} onChange={(v) => set({ showCut: v })} />
      </Row>
      <Row label="Copy button">
        <Toggle label="Copy button" checked={s.showCopy} onChange={(v) => set({ showCopy: v })} />
      </Row>
      <Row label="Paste button" desc="Only in editable text, when there's text to paste. Pointing at it shows the first line, unless a password manager marked it private.">
        <Toggle label="Paste button" checked={s.showPaste} onChange={(v) => set({ showPaste: v })} />
      </Row>
      <Row label="Magic Search button" desc="A quick, cited answer with web results and matches from your own Lens, in a pop-out by the selection.">
        <Toggle label="Magic Search button" checked={s.showSearch} onChange={(v) => set({ showSearch: v })} />
      </Row>

      <Row label="Your actions" desc={`Up to ${MAX_ACTIONS}, in this order. New prompt actions are made in Right-click menu › Custom actions and show up here.`}>
        <span className="sbc-count">{s.actions.length}/{MAX_ACTIONS}</span>
      </Row>
      <ol className="sbc-actions" aria-label="Your selection bar actions">
        {s.actions.map((id, i) => {
          const a = byId.get(id);
          const label = a?.label ?? id;
          const combo = s.hotkeys[id] ?? "";
          return (
            <li key={id} className="sbc-action">
              <span className="sbc-action-label">{label}</span>
              {advanced ? (
                <HotkeyField
                  label={`Hotkey for ${label}`}
                  value={combo}
                  problem={problemFor(id)(combo)}
                  onChange={(v) => {
                    const p = problemFor(id)(v);
                    if (p?.level === "block") return setError(p.message);
                    setError("");
                    const hotkeys = { ...s.hotkeys };
                    if (v) hotkeys[id] = v;
                    else delete hotkeys[id];
                    set({ hotkeys });
                  }}
                />
              ) : null}
              <button type="button" className="sbc-icon" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => set({ actions: moveAction(s.actions, id, -1) })}>
                <ArrowUp size={13} />
              </button>
              <button type="button" className="sbc-icon" aria-label={`Move ${label} down`} disabled={i === s.actions.length - 1} onClick={() => set({ actions: moveAction(s.actions, id, 1) })}>
                <ArrowDown size={13} />
              </button>
              <button type="button" className="sbc-icon" aria-label={`Remove ${label}`} onClick={() => set({ actions: s.actions.filter((x) => x !== id) })}>
                <X size={13} />
              </button>
            </li>
          );
        })}
      </ol>
      {s.actions.length < MAX_ACTIONS && addable.length ? (
        <div className="sbc-add">
          <Select label="Add an action" value={adding} options={[{ id: "", label: "Add an action…" }, ...addable.map((a) => ({ id: a.id, label: a.label }))]} onChange={setAdding} />
          <button
            type="button"
            className="sbc-btn"
            disabled={!adding}
            onClick={() => {
              set({ actions: addAction(s.actions, adding) });
              setAdding("");
            }}
          >
            <Plus size={13} /> Add
          </button>
        </div>
      ) : null}
      <Row label="Actions before More" desc="The rest are one click away under ⋯.">
        <Slider label="Actions before More" value={s.maxActions} min={3} max={9} unit="" onCommit={(v) => set({ maxActions: v })} />
      </Row>

      <div className="sbc-sub">Where it works</div>
      {policy ? (
        <>
          <Row label="Apps" desc="Everywhere except the apps below (the default), or only in the apps below.">
            <Segmented
              label="Where the selection bar works"
              value={policy.mode}
              options={[{ id: "deny", label: "Everywhere except" }, { id: "allow", label: "Only in these apps" }]}
              onChange={(v) => savePolicy({ mode: v })}
            />
          </Row>
          <div className="sbc-apps" aria-label={policy.mode === "deny" ? "Apps where it stays out" : "Apps where it works"}>
            {policy.apps.map((a) => (
              <button key={a} type="button" className="sbc-app" aria-label={`Remove ${a}`} onClick={() => savePolicy({ apps: policy.apps.filter((x) => x !== a) })}>
                {a.replace(/\.exe$/i, "")} <X size={11} />
              </button>
            ))}
            <form
              className="sbc-app-form"
              onSubmit={(e) => {
                e.preventDefault();
                const v = (newApp.trim().split(/[\\/]/).pop() ?? "").toLowerCase();
                if (v) savePolicy({ apps: [...policy.apps, v.endsWith(".exe") ? v : `${v}.exe`] });
                setNewApp("");
              }}
            >
              <input className="cc-input sbc-app-input" value={newApp} onChange={(e) => setNewApp(e.target.value)} placeholder="app.exe" aria-label="Add an app" />
            </form>
          </div>
          <p className="sbc-desc">Always left out, whatever the list says: password fields, Lens itself, elevated apps, fullscreen apps and games (and anti-cheat), and the clipboard history's private apps.</p>
        </>
      ) : null}
      {Object.keys(s.perApp).length ? (
        <Row label="Per-app actions" desc={Object.entries(s.perApp).map(([app, ids]) => `${app.replace(/\.exe$/i, "")}: ${(ids as string[]).map((i) => byId.get(i)?.label ?? i).join(", ")}`).join(" · ")}>
          <button type="button" className="sbc-btn" onClick={() => set({ perApp: {} })}>Clear</button>
        </Row>
      ) : null}

      {advanced ? (
        <>
          <div className="sbc-sub">Advanced</div>
          <Row label="Open after a drag">
            <Toggle label="Open after a drag" checked={s.triggerDrag} onChange={(v) => set({ triggerDrag: v })} />
          </Row>
          <Row label="Open after a double click">
            <Toggle label="Open after a double click" checked={s.triggerDoubleClick} onChange={(v) => set({ triggerDoubleClick: v })} />
          </Row>
          <Row label="Open after a triple click">
            <Toggle label="Open after a triple click" checked={s.triggerTripleClick} onChange={(v) => set({ triggerTripleClick: v })} />
          </Row>
          <Row label="Selection bar delay" desc="How long after you let go of the mouse the bar appears.">
            <Slider label="Selection bar delay" value={s.delayMs} min={0} max={600} step={20} unit=" ms" onCommit={(v) => set({ delayMs: v })} />
          </Row>
          <Row label="Minimum characters">
            <Slider label="Minimum characters" value={s.minChars} min={1} max={20} unit="" onCommit={(v) => set({ minChars: v })} />
          </Row>
          <Row label="Bar placement">
            <Segmented label="Bar placement" value={s.placement as "below" | "above" | "pointer"} options={[{ id: "below", label: "Below" }, { id: "above", label: "Above" }, { id: "pointer", label: "At the pointer" }]} onChange={(v) => set({ placement: v })} />
          </Row>
          <Row label="Hide on its own" desc="Pointing at the bar keeps it open.">
            <Toggle label="Hide on its own" checked={s.autoHideMs > 0} onChange={(v) => set({ autoHideMs: v ? 4000 : 0 })} />
          </Row>
          {s.autoHideMs > 0 ? (
            <Row label="Auto-hide">
              <Slider label="Auto-hide" value={s.autoHideMs / 1000} min={1.5} max={30} step={0.5} unit=" s" onCommit={(v) => set({ autoHideMs: Math.round(v * 1000) })} />
            </Row>
          ) : null}
          <Row label="Hide distance" desc="The bar goes away when the pointer moves this far from it.">
            <Slider label="Hide distance" value={s.hideDistancePx} min={40} max={600} step={10} unit=" px" onCommit={(v) => set({ hideDistancePx: v })} />
          </Row>
          <Row label="Smart actions" desc="Recognises links, e-mail addresses, sums, units, colours, file paths and code, and shows a one-line preview. Worked out on this PC.">
            <Toggle label="Smart actions" checked={s.smart} onChange={(v) => set({ smart: v })} />
          </Row>
          <Row label="Learn from use" desc="Floats the actions you use most up the bar, from counts kept on this PC.">
            <Toggle label="Learn from use" checked={s.learn} onChange={(v) => set({ learn: v })} />
          </Row>
          <div className="sbc-sub">Magic Search</div>
          <Row label="Web results" desc="From your Lens Browser search engine (DuckDuckGo by default) and Wikipedia, only when you press Magic Search. The panel lists every source.">
            <Toggle label="Web results" checked={s.webResults} onChange={(v) => set({ webResults: v })} />
          </Row>
          <Row label="Results from my files" desc="Your Shelf, clipboard history, notes and recent files, searched on this PC and never sent anywhere.">
            <Toggle label="Results from my files" checked={s.localResults} onChange={(v) => set({ localResults: v })} />
          </Row>
          <Row label="AI for Magic Search" desc="The local model when it can answer; Claude only if your AI privacy setting allows it.">
            <Select
              label="AI for Magic Search"
              value={s.providers.magic_search ?? "default"}
              options={[{ id: "default", label: "Local first, then my AI" }, { id: "local", label: "Local only" }, { id: "claude", label: "Claude" }]}
              onChange={(v) => {
                const providers = { ...s.providers };
                if (v === "default") delete providers.magic_search;
                else providers.magic_search = v;
                set({ providers });
              }}
            />
          </Row>
          <Row label="Magic Search hotkey" desc="Runs Magic Search on the selection anywhere, with or without the bar. None by default.">
            <HotkeyField
              label="Magic Search hotkey"
              value={s.searchHotkey}
              problem={problemFor("magic_search")(s.searchHotkey)}
              onChange={(v) => {
                const p = problemFor("magic_search")(v);
                if (p?.level === "block") return setError(p.message);
                setError("");
                set({ searchHotkey: v });
              }}
            />
          </Row>
        </>
      ) : null}
      {error ? <StateNote kind="error">{error}</StateNote> : null}
    </div>
  );
};

export default SelectionBarCard;

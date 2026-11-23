import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { trustExpiryLabel, type Level, type SiteTrust, type TaskItem } from "./model";
import "./ApprovalCard.css";

interface ClientGrants {
  client: string;
  label: string;
  capabilities: TaskItem[];
}

export interface MemoryPolicy {
  neverRemember: string[];
  excludeBanks: boolean;
  excludePrivateSpaces: boolean;
  privateSpaces: string[];
}

export interface PermissionsData {
  clients: ClientGrants[];
  trusts: SiteTrust[];
  memory: MemoryPolicy;
}

const ALWAYS_ASKS = new Set(["delete_to_bin", "payments", "send_messages"]);

/** Which levels a capability may be set to. */
export function allowedLevels(id: string): Level[] {
  if (id === "destructive") return ["blocked"];
  if (id === "payments") return ["ask", "blocked"];
  if (ALWAYS_ASKS.has(id)) return ["ask", "blocked"];
  return ["allowed", "ask", "blocked"];
}

const LEVEL_LABEL: Record<Level, string> = { allowed: "Allowed", ask: "Ask first", blocked: "Never" };

const ChipList: React.FC<{ items: string[]; placeholder: string; label: string; onChange: (v: string[]) => void }> = ({ items, placeholder, label, onChange }) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="ap-chip-input">
      {items.map((x) => (
        <span className="ap-chip" key={x}>
          {x}
          <button type="button" aria-label={`Remove ${x}`} onClick={() => onChange(items.filter((y) => y !== x))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="ap-input"
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
};

/**
 * AI & Command › Permissions: what each AI app may do ("This task can"), the site trusts it was
 * given ("Approve similar actions"), and what Lens never remembers.
 */
export const PermissionsCard: React.FC<{ initial?: PermissionsData }> = ({ initial }) => {
  const [data, setData] = useState<PermissionsData | null>(initial ?? null);
  const [client, setClient] = useState<string>(initial?.clients[0]?.client ?? "claude-desktop");
  const reload = useCallback(() => {
    invoke<PermissionsData>("control_grants_get").then(setData).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!initial) reload();
  }, [initial, reload]);
  if (!data) return null;

  const current = data.clients.find((c) => c.client === client) ?? data.clients[0];
  const setLevel = (capability: string, level: Level) => {
    setData({
      ...data,
      clients: data.clients.map((c) => (c.client === current.client ? { ...c, capabilities: c.capabilities.map((t) => (t.id === capability ? { ...t, level } : t)) } : c)),
    });
    invoke("control_grants_set", { client: current.client, capability, level, session: false }).then(() => reload()).catch(() => reload());
  };
  const setMemory = (memory: MemoryPolicy) => {
    setData({ ...data, memory });
    invoke("control_memory_set", { policy: memory }).catch(() => reload());
  };
  const revoke = (id: string) => {
    setData({ ...data, trusts: data.trusts.filter((t) => t.id !== id) });
    invoke("control_trust_revoke", { id }).catch(() => reload());
  };

  return (
    <section className="ap-perms" aria-label="AI permissions">
      <div>
        <h3>What AI apps may do</h3>
        <p className="ap-perms-sub">Per app. "Ask first" shows the Needs your OK card. Payments start blocked, and sending, paying and deleting always ask.</p>
      </div>
      <div className="ap-perms-tabs" role="tablist">
        {data.clients.map((c) => (
          <button key={c.client} type="button" role="tab" className="ap-perms-tab" aria-selected={c.client === current.client} onClick={() => setClient(c.client)}>
            {c.label}
          </button>
        ))}
        <button type="button" className="ap-link" style={{ marginLeft: "auto" }} onClick={() => invoke("control_grants_revoke", { client: current.client }).then(reload)}>
          Reset to defaults
        </button>
      </div>
      <ul className="ap-perms-list">
        {current.capabilities.map((t) => (
          <li className="ap-perms-row" key={t.id}>
            <span className="ap-task-text">
              <span className="ap-task-label">{t.label}</span>
              {t.principle ? <span className="ap-principle">{t.principle}</span> : null}
            </span>
            <span className="ap-seg" role="group" aria-label={t.label}>
              {(["allowed", "ask", "blocked"] as Level[]).map((l) => (
                <button key={l} type="button" aria-pressed={t.level === l} disabled={!allowedLevels(t.id).includes(l)} onClick={() => setLevel(t.id, l)}>
                  {LEVEL_LABEL[l]}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>

      <div>
        <h3>Trusted sites and tasks</h3>
        <p className="ap-perms-sub">From "Approve similar actions". Revoke any time; this run's trusts end when Lens restarts.</p>
      </div>
      {data.trusts.length ? (
        <div>
          {data.trusts.map((t) => (
            <div className="ap-trust" key={t.id}>
              <span>
                <b>{t.label}</b> <span className="ap-principle">· {t.client}</span>
              </span>
              <span className="ap-task-level">{trustExpiryLabel(t)}</span>
              <button type="button" className="ap-btn ap-secondary" onClick={() => revoke(t.id)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="ap-perms-sub">No trusted sites. Every action asks as set above.</p>
      )}

      <div>
        <h3>Memory</h3>
        <p className="ap-perms-sub">What Lens never remembers in history, Shelf captures or AI memory, and never shares with AI apps.</p>
      </div>
      <label className="ap-toggle">
        <input type="checkbox" checked={data.memory.excludeBanks} onChange={(e) => setMemory({ ...data.memory, excludeBanks: e.target.checked })} />
        Banking and payment sites
      </label>
      <label className="ap-toggle">
        <input type="checkbox" checked={data.memory.excludePrivateSpaces} onChange={(e) => setMemory({ ...data.memory, excludePrivateSpaces: e.target.checked })} />
        Private Spaces (any Space named "Private", plus these)
      </label>
      <ChipList items={data.memory.privateSpaces} label="Private Spaces" placeholder="Add a Space name…" onChange={(v) => setMemory({ ...data.memory, privateSpaces: v })} />
      <div>
        <h3>Never remember these sites</h3>
      </div>
      <ChipList items={data.memory.neverRemember} label="Never remember sites" placeholder="example.com" onChange={(v) => setMemory({ ...data.memory, neverRemember: v })} />
    </section>
  );
};

export default PermissionsCard;

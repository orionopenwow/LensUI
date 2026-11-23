import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Bot,
  Send,
  Plus,
  Trash2,
  Plug,
  ShieldCheck,
  Save,
  RotateCcw,
  Download,
  Pencil,
  Check,
  Circle,
  Square,
  Play,
  LayoutGrid,
  Columns2,
  Columns3,
  Sparkles,
  Database,
  FolderOpen,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  RefreshCw,
  Cpu,
  Users,
} from "lucide-react";
import type { LensConfig, RunningWindow } from "../types/lens";
import {
  executeNaturalLanguagePlan,
  parseNaturalLanguageActions,
} from "../utils/nlActionRouter";

interface AgentsPaneProps {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => void;
}

interface AgentIntegration {
  id: string;
  name: string;
  kind: "mcp-stdio" | "mcp-http" | "ollama" | "cloud-api" | "desktop-agent";
  endpoint: string;
  model?: string;
  enabled: boolean;
  notes?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: string;
}

const DEFAULT_INTEGRATIONS: AgentIntegration[] = [
  {
    id: "lens-local",
    name: "Lens Local Shell Agent",
    kind: "desktop-agent",
    endpoint: "builtin://lens-shell",
    enabled: true,
    notes: "Built-in zero-key agent for live theme, dock, roundness & notification commands.",
  },
  {
    id: "ollama-local",
    name: "Local Ollama",
    kind: "ollama",
    endpoint: "http://localhost:11434/api/chat",
    model: "llama3.2",
    enabled: false,
    notes: "100% private local LLM running on your machine.",
  },
  {
    id: "claude-desktop-mcp",
    name: "Claude Desktop MCP Bridge",
    kind: "mcp-stdio",
    endpoint: "npx -y @modelcontextprotocol/server-filesystem",
    enabled: false,
    notes: "Import existing servers from Claude Desktop with 1 click.",
  },
];

interface DpoPair {
  ts: number;
  prompt: string;
  chosen: string;
  rejected: string;
  source: string;
}

interface WorkflowMacroStep {
  kind: string;
  label: string;
  payload: string;
}

interface WorkflowMacro {
  id: string;
  name: string;
  createdAt: number;
  steps: WorkflowMacroStep[];
}

interface TrainingStats {
  pairCount: number;
  filePath: string;
  fileSizeBytes: number;
  recentPairs: DpoPair[];
  macros: WorkflowMacro[];
}

interface LocalAiStackStatus {
  tribecodeBat: string | null;
  tribecodeWorkingBat: string | null;
  tribecodeUrl: string;
  tribecodeRunning: boolean;
  claudeDesktopInstalled: boolean;
  claudeDesktopExe: string | null;
  claudeMcpConfigExists: boolean;
  ollamaRunning: boolean;
}

export const AgentsPane: React.FC<AgentsPaneProps> = ({ config, onUpdateConfig }) => {
  const [subTab, setSubTab] = useState<"office" | "chat" | "training" | "integrations" | "rules">("office");
  const [integrations, setIntegrations] = useState<AgentIntegration[]>(DEFAULT_INTEGRATIONS);
  const [agentsMd, setAgentsMd] = useState("");
  const [mdStatus, setMdStatus] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [aiStack, setAiStack] = useState<LocalAiStackStatus | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedLocalModel, setSelectedLocalModel] = useState("llama3.2");
  const [localModelStatus, setLocalModelStatus] = useState<string | null>(null);
  const [tribeUrlInput, setTribeUrlInput] = useState("http://localhost:4848");

  // Watch-Me-Once Recorder + DPO Dataset + Smart Window Tiler state
  const [trainingStats, setTrainingStats] = useState<TrainingStats>({
    pairCount: 0,
    filePath: "",
    fileSizeBytes: 0,
    recentPairs: [],
    macros: [],
  });
  const [recording, setRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<WorkflowMacroStep[]>([]);
  const [macroName, setMacroName] = useState("");
  const [tilerStatus, setTilerStatus] = useState<string | null>(null);
  const recSnapshotRef = useRef<{
    focusedExe: string;
    volume: number;
    brightness: number;
    preset: string;
    opacity: number;
  } | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  // Add / Edit integration form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formKind, setFormKind] = useState<AgentIntegration["kind"]>("mcp-stdio");
  const [formEndpoint, setFormEndpoint] = useState("");
  const [formModel, setFormModel] = useState("");

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Ready. Ask me to adjust Lens UI (e.g. \"sharper corners\", \"85% opacity\", \"midnight theme\", \"red yellow green buttons\", \"hide taskbar\", \"test notification\") or enable Ollama / custom MCP agents in Integrations.",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const refreshTrainingStats = () => {
    invoke<TrainingStats>("get_training_stats_cmd")
      .then(setTrainingStats)
      .catch(() => {});
  };

  const refreshAiStack = () => {
    invoke<LocalAiStackStatus>("detect_local_ai_stack_cmd")
      .then((st) => {
        setAiStack(st);
        if (st.ollamaRunning) {
          fetch("http://localhost:11434/api/tags")
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (Array.isArray(data?.models)) {
                const names = data.models.map((m: { name?: string }) => m.name || "").filter(Boolean);
                setOllamaModels(names);
                if (names.length > 0) setSelectedLocalModel(names[0]);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  };

  const enableLocalModel = (modelName: string, endpoint = "http://localhost:11434/api/chat") => {
    setSelectedLocalModel(modelName);
    const exists = integrations.some((i) => i.id === "ollama-local");
    const next: AgentIntegration[] = exists
      ? integrations.map((i) =>
          i.id === "ollama-local"
            ? { ...i, enabled: true, endpoint, model: modelName }
            : i
        )
      : [
          ...integrations,
          {
            id: "ollama-local",
            name: "Local Ollama",
            kind: "ollama",
            endpoint,
            model: modelName,
            enabled: true,
            notes: "100% private local LLM running on your machine.",
          },
        ];
    persistIntegrations(next);
    setLocalModelStatus(`Active local model set to ${modelName} (${endpoint})`);
  };

  const quickImportClaudeMcp = async () => {
    try {
      const raw = await invoke<string>("import_claude_mcp_cmd");
      const parsed = JSON.parse(raw);
      const servers = parsed?.mcpServers || {};
      const entries = Object.entries(servers);
      if (entries.length === 0) {
        setImportMsg("Claude Desktop config found, but mcpServers is empty.");
        return;
      }
      const next = [...integrations];
      let added = 0;
      for (const [name, spec] of entries) {
        const s = spec as { command?: string; args?: string[]; url?: string };
        const id = `claude-mcp-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
        if (!next.some((i) => i.id === id)) {
          next.push({
            id,
            name: `Claude MCP · ${name}`,
            kind: s.url ? "mcp-http" : "mcp-stdio",
            endpoint: s.url || [s.command, ...(s.args || [])].filter(Boolean).join(" "),
            enabled: true,
            notes: "Imported with 1 click from Claude Desktop.",
          });
          added++;
        }
      }
      persistIntegrations(next);
      setImportMsg(`Imported ${added} Claude MCP server(s) (${entries.length} total found).`);
    } catch (e) {
      setImportMsg(String(e));
    }
  };

  useEffect(() => {
    refreshTrainingStats();
    refreshAiStack();
    invoke<string>("get_agents_md_cmd")
      .then(setAgentsMd)
      .catch(() => {});
    invoke<string>("get_agents_registry_cmd")
      .then((raw) => {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setIntegrations(parsed);
          }
        } catch {
          // keep defaults
        }
      })
      .catch(() => {});
  }, []);

  // Live "Watch-Me-Once" desktop observer while recording
  useEffect(() => {
    if (!recording) return;
    let alive = true;
    const poll = async () => {
      if (!alive) return;
      try {
        const [wins, qs] = await Promise.all([
          invoke<RunningWindow[]>("get_running_windows").catch(() => [] as RunningWindow[]),
          invoke<{ volume: number; brightness: number }>("get_quick_state_cmd").catch(() => ({
            volume: -1,
            brightness: -1,
          })),
        ]);
        const focused = wins.find((w) => w.isFocused);
        const curExe = focused?.exePath || "";
        const curPreset = configRef.current.theme.preset;
        const curOpacity = Math.round(configRef.current.theme.glassOpacity * 100);
        const prev = recSnapshotRef.current;

        if (!prev) {
          recSnapshotRef.current = {
            focusedExe: curExe,
            volume: qs.volume,
            brightness: qs.brightness,
            preset: curPreset,
            opacity: curOpacity,
          };
          return;
        }

        const newSteps: WorkflowMacroStep[] = [];
        if (curExe && curExe !== prev.focusedExe && focused) {
          const clean = focused.processName.replace(/\.exe$/i, "");
          newSteps.push({
            kind: "launch_app",
            label: `Open / Focus ${clean}`,
            payload: curExe,
          });
        }
        if (qs.brightness >= 0 && prev.brightness >= 0 && Math.abs(qs.brightness - prev.brightness) >= 4) {
          newSteps.push({
            kind: "brightness",
            label: `Set Brightness → ${qs.brightness}%`,
            payload: String(qs.brightness),
          });
        }
        if (qs.volume >= 0 && prev.volume >= 0 && Math.abs(qs.volume - prev.volume) >= 4) {
          newSteps.push({
            kind: "volume",
            label: `Set Volume → ${qs.volume}%`,
            payload: String(qs.volume),
          });
        }
        if (curPreset !== prev.preset) {
          newSteps.push({
            kind: "theme",
            label: `Theme Preset → ${curPreset}`,
            payload: curPreset,
          });
        }
        if (Math.abs(curOpacity - prev.opacity) >= 4) {
          newSteps.push({
            kind: "opacity",
            label: `Window Opacity → ${curOpacity}%`,
            payload: String(curOpacity),
          });
        }

        recSnapshotRef.current = {
          focusedExe: curExe || prev.focusedExe,
          volume: qs.volume >= 0 ? qs.volume : prev.volume,
          brightness: qs.brightness >= 0 ? qs.brightness : prev.brightness,
          preset: curPreset,
          opacity: curOpacity,
        };

        if (newSteps.length > 0) {
          setRecordedSteps((s) => [...s, ...newSteps]);
        }
      } catch {
        // ignore transient poll errors
      }
    };
    poll();
    const id = window.setInterval(poll, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [recording]);

  const runTilerLayout = async (layout: string, label: string) => {
    try {
      const msg = await invoke<string>("tile_windows_cmd", { layout });
      setTilerStatus(msg);
      if (recording) {
        setRecordedSteps((s) => [...s, { kind: "tile", label: `Tile: ${label}`, payload: layout }]);
      }
      invoke("record_dpo_pair_cmd", {
        prompt: `tile windows (${label})`,
        chosen: `tile_windows_cmd(${layout}) -> ${msg}`,
        rejected: "manual_window_drag",
        source: "smart-tiler",
      })
        .then(refreshTrainingStats)
        .catch(() => {});
    } catch (e) {
      setTilerStatus(String(e));
    }
  };

  const replayMacro = async (macro: WorkflowMacro) => {
    for (const step of macro.steps) {
      try {
        if (step.kind === "launch_app") {
          await invoke("launch_app_cmd", { path: step.payload });
        } else if (step.kind === "brightness") {
          await invoke("set_brightness_cmd", { level: parseInt(step.payload, 10) || 60 });
        } else if (step.kind === "volume") {
          await invoke("set_volume_cmd", { level: parseInt(step.payload, 10) || 50 });
        } else if (step.kind === "tile") {
          await invoke("tile_windows_cmd", { layout: step.payload });
        } else if (step.kind === "theme") {
          onUpdateConfig({ ...configRef.current, theme: { ...configRef.current.theme, preset: step.payload } });
        } else if (step.kind === "opacity") {
          const pct = Math.min(100, Math.max(40, parseInt(step.payload, 10) || 96));
          onUpdateConfig({ ...configRef.current, theme: { ...configRef.current.theme, glassOpacity: pct / 100 } });
        }
      } catch {
        // continue remaining steps
      }
    }
    invoke("push_notification_cmd", {
      title: `Macro Executed: ${macro.name}`,
      body: `Replayed ${macro.steps.length} recorded desktop actions.`,
      appName: "Lens AI",
      category: "agent",
    }).catch(() => {});
  };

  const stopAndSaveRecording = async () => {
    setRecording(false);
    recSnapshotRef.current = null;
    if (recordedSteps.length === 0) return;
    const finalName = macroName.trim() || `Workflow ${trainingStats.macros.length + 1}`;
    const item: WorkflowMacro = {
      id: `macro-${Date.now()}`,
      name: finalName,
      createdAt: Math.floor(Date.now() / 1000),
      steps: recordedSteps,
    };
    try {
      await invoke("save_workflow_macro_cmd", { macroItem: item });
      await invoke("record_dpo_pair_cmd", {
        prompt: `run workflow "${finalName}"`,
        chosen: recordedSteps.map((s) => s.label).join(" -> "),
        rejected: "unrecorded_manual_steps",
        source: "watch-me-once",
      });
      setRecordedSteps([]);
      setMacroName("");
      refreshTrainingStats();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const persistIntegrations = (next: AgentIntegration[]) => {
    setIntegrations(next);
    invoke("save_agents_registry_cmd", { json: JSON.stringify(next, null, 2) }).catch(() => {});
  };

  const handleSaveIntegration = () => {
    if (!formName.trim() || !formEndpoint.trim()) return;
    if (editingId) {
      persistIntegrations(
        integrations.map((item) =>
          item.id === editingId
            ? {
                ...item,
                name: formName.trim(),
                kind: formKind,
                endpoint: formEndpoint.trim(),
                model: formModel.trim() || undefined,
              }
            : item
        )
      );
      setEditingId(null);
    } else {
      persistIntegrations([
        ...integrations,
        {
          id: `agent-${Date.now()}`,
          name: formName.trim(),
          kind: formKind,
          endpoint: formEndpoint.trim(),
          model: formModel.trim() || undefined,
          enabled: true,
        },
      ]);
    }
    setFormName("");
    setFormEndpoint("");
    setFormModel("");
  };

  const handleImportClaudeMcp = async () => {
    setImportMsg(null);
    try {
      const raw = await invoke<string>("import_claude_mcp_cmd");
      const parsed = JSON.parse(raw);
      const servers = parsed?.mcpServers ?? {};
      const entries = Object.entries(servers);
      if (entries.length === 0) {
        setImportMsg("Claude Desktop config found, but no mcpServers were listed.");
        return;
      }
      const imported: AgentIntegration[] = entries.map(([name, def]: [string, any]) => ({
        id: `claude-mcp-${name}`,
        name: `MCP · ${name}`,
        kind: def?.url ? "mcp-http" : "mcp-stdio",
        endpoint: def?.url
          ? String(def.url)
          : [def?.command, ...(Array.isArray(def?.args) ? def.args : [])].filter(Boolean).join(" "),
        enabled: true,
        notes: "Imported from Claude Desktop",
      }));
      const existingIds = new Set(integrations.map((i) => i.id));
      const merged = [...integrations, ...imported.filter((i) => !existingIds.has(i.id))];
      persistIntegrations(merged);
      setImportMsg(`Imported ${imported.length} MCP server(s) from Claude Desktop.`);
    } catch (err) {
      setImportMsg(String(err));
    }
  };

  const tryLocalShellIntent = (prompt: string): string | null => {
    const p = prompt.toLowerCase();

    const opacityMatch = p.match(/(\d{2,3})\s*%?\s*(opacity|transparent|glass)/);
    if (opacityMatch) {
      const pct = Math.min(100, Math.max(40, parseInt(opacityMatch[1], 10)));
      onUpdateConfig({ ...config, theme: { ...config.theme, glassOpacity: pct / 100 } });
      return `Set Window Opacity to ${pct}% across Lens UI and open Windows apps.`;
    }
    if (p.includes("more transparent") || p.includes("more glass")) {
      const next = Math.max(0.55, Number((config.theme.glassOpacity - 0.12).toFixed(2)));
      onUpdateConfig({ ...config, theme: { ...config.theme, glassOpacity: next } });
      return `Lowered Window Opacity to ${Math.round(next * 100)}% for a lighter glass feel.`;
    }
    if (p.includes("sharp") || p.includes("square corner") || p.includes("0px")) {
      onUpdateConfig({ ...config, theme: { ...config.theme, borderRadius: 0 } });
      return "Applied 0px sharp tiling corners across Lens UI and DWM windows.";
    }
    if (p.includes("round") && p.includes("reset")) {
      onUpdateConfig({ ...config, theme: { ...config.theme, borderRadius: 8 } });
      return "Reset Window Roundness to 8px (native Windows 11 harmony).";
    }
    if (p.includes("midnight")) {
      onUpdateConfig({ ...config, theme: { ...config.theme, preset: "midnight" } });
      return "Switched visual preset to Midnight.";
    }
    if (p.includes("obsidian")) {
      onUpdateConfig({ ...config, theme: { ...config.theme, preset: "obsidian" } });
      return "Switched visual preset to Obsidian Monochrome.";
    }
    if (p.includes("hide taskbar")) {
      onUpdateConfig({ ...config, func: { ...config.func, hideNativeTaskbar: true } });
      return "Hidden native Windows taskbar (auto-restores safely on quit).";
    }
    if (p.includes("show taskbar") || p.includes("restore taskbar")) {
      onUpdateConfig({ ...config, func: { ...config.func, hideNativeTaskbar: false } });
      return "Restored native Windows taskbar.";
    }
    if (p.includes("red yellow green")) {
      onUpdateConfig({
        ...config,
        windowControls: { ...config.windowControls, enabled: true, order: "red-yellow-green" },
      });
      return "Switched window traffic lights to Red · Yellow · Green.";
    }
    if (p.includes("green yellow red")) {
      onUpdateConfig({
        ...config,
        windowControls: { ...config.windowControls, enabled: true, order: "green-yellow-red" },
      });
      return "Switched window traffic lights to Green · Yellow · Red.";
    }
    if (p.includes("windows default") && p.includes("button")) {
      onUpdateConfig({
        ...config,
        windowControls: { ...config.windowControls, enabled: false },
      });
      return "Restored native Windows caption buttons (— ❐ ×).";
    }
    if (p.includes("notification") || p.includes("test alert")) {
      invoke("push_notification_cmd", {
        title: "Lens Agent Notification",
        body: "Triggered safely from your Agents chat hub.",
        appName: "Lens Agent",
        category: "theme",
      }).catch(() => {});
      return "Sent a bottom-right Lens notification.";
    }
    return null;
  };

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput("");

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text, time }]);
    setSending(true);

    try {
      // 1. Compound Natural-Language Action Router (e.g. "mute chrome, 40% brightness, catppuccin theme, tile split")
      const nlActions = parseNaturalLanguageActions(text);
      if (nlActions.length > 0) {
        const res = await executeNaturalLanguagePlan(text, nlActions, config, onUpdateConfig, "agent-chat");
        refreshTrainingStats();
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", text: `⚡ Executed ${nlActions.length} action(s):\n• ${res.join("\n• ")}`, time },
        ]);
        return;
      }

      // 2. Check built-in safe Lens shell intents
      const localReply = tryLocalShellIntent(text);
      if (localReply) {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", text: localReply, time },
        ]);
        return;
      }

      // 2. If user enabled Local Ollama, forward with AGENTS.md system prompt!
      const ollama = integrations.find((i) => i.kind === "ollama" && i.enabled);
      if (ollama) {
        const res = await fetch(ollama.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ollama.model || "llama3.2",
            stream: false,
            messages: [
              {
                role: "system",
                content: `You are an assistant integrated into Lens UI on Windows. Follow these safety rules strictly:\n${agentsMd}`,
              },
              { role: "user", content: text },
            ],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const reply = data?.message?.content || "No response returned from Ollama.";
          setMessages((prev) => [
            ...prev,
            { id: `a-${Date.now()}`, role: "assistant", text: reply, time },
          ]);
          return;
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: "No live LLM endpoint is enabled yet. Try a Lens command (e.g. \"85% opacity\", \"sharp corners\", \"midnight theme\", \"test notification\") or enable Local Ollama / add an MCP server in Integrations.",
          time,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: `Could not reach configured agent endpoint: ${String(err)}`,
          time,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Sub-navigation pill bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(
            [
              { id: "office", label: "TribeCode & AI", icon: <Users size={13} color="#F59E0B" /> },
              { id: "chat", label: "Agent Chat", icon: <Bot size={13} color="#22D3EE" /> },
              { id: "training", label: `Workflows (${trainingStats.pairCount})`, icon: <Sparkles size={13} color="#FBBF24" /> },
              { id: "integrations", label: `MCP (${integrations.filter((i) => i.enabled).length})`, icon: <Plug size={13} color="#A78BFA" /> },
              { id: "rules", label: "Safety", icon: <ShieldCheck size={13} color="#34D399" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cc-chip ${subTab === t.id ? "active" : ""}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={() => setSubTab(t.id)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ==================== SUB-TAB 0: TRIBECODE AGENT AREA + LOCAL MODEL + EASY CLAUDE ACCESS ==================== */}
      {subTab === "office" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* 1. TribeCode Live Agent Office Area */}
          <div className="cc-card" style={{ gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div className="cc-label" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Users size={14} color="#F59E0B" />
                  <span>TribeCode Agent Area</span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: aiStack?.tribecodeRunning
                        ? "rgb(52 211 153 / 0.16)"
                        : "rgb(var(--lens-ink) / 0.07)",
                      color: aiStack?.tribecodeRunning ? "#34D399" : "var(--lens-fg-secondary)",
                    }}
                  >
                    {aiStack?.tribecodeRunning ? "● Live on :4848" : "○ Offline"}
                  </span>
                </div>
                <div className="cc-desc">
                  Embedded pixel-art multi-agent workspace connected directly to your local TribeCode instance.
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {aiStack?.tribecodeWorkingBat && (
                  <button
                    type="button"
                    className="cc-btn"
                    style={{ padding: "5px 10px", fontSize: 11.5 }}
                    onClick={() => {
                      invoke("launch_app_cmd", { path: aiStack.tribecodeWorkingBat }).catch(() => {});
                      window.setTimeout(refreshAiStack, 2500);
                    }}
                  >
                    Start :4848
                  </button>
                )}
                {aiStack?.tribecodeBat && (
                  <button
                    type="button"
                    className="cc-chip"
                    style={{ padding: "5px 9px", fontSize: 11.5 }}
                    onClick={() => {
                      invoke("launch_app_cmd", { path: aiStack.tribecodeBat }).catch(() => {});
                      window.setTimeout(refreshAiStack, 2500);
                    }}
                  >
                    Launch App
                  </button>
                )}
                <button aria-label="Refresh AI tools"
                  type="button"
                  className="cc-chip"
                  style={{ padding: "5px 8px" }}
                  onClick={refreshAiStack}
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>

            {aiStack?.tribecodeRunning ? (
              <div
                style={{
                  width: "100%",
                  height: 290,
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid rgb(var(--lens-ink) / 0.12)",
                  background: "var(--lens-on-fg)",
                }}
              >
                <iframe
                  src={tribeUrlInput}
                  title="TribeCode Agent Area"
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: "14px",
                  borderRadius: 10,
                  background: "linear-gradient(145deg, rgb(245 158 11 / 0.06), rgb(9 9 11 / 0.85))",
                  border: "1px solid rgb(245 158 11 / 0.18)",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                  {[
                    { name: "Codex", role: "Code & Build", color: "#34D399" },
                    { name: "Claude", role: "Reasoning & MCP", color: "#FB923C" },
                    { name: "Flint", role: "Local Tools", color: "#F59E0B" },
                    { name: "Lens AI", role: "Desktop Shell", color: "#38BDF8" },
                  ].map((ag) => (
                    <div
                      key={ag.name}
                      style={{
                        padding: "9px 10px",
                        borderRadius: 9,
                        background: "rgb(var(--lens-ink) / 0.04)",
                        border: "1px solid rgb(var(--lens-ink) / 0.08)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--lens-fg)" }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: ag.color }} />
                        <span>{ag.name}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--lens-fg-muted)", marginTop: 2 }}>{ag.role}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    className="cc-input"
                    style={{ flex: 1, fontSize: 11.5, padding: "5px 9px" }}
                    value={tribeUrlInput}
                    onChange={(e) => setTribeUrlInput(e.target.value)}
                    placeholder="http://localhost:4848"
                  />
                  <button
                    type="button"
                    className="cc-chip"
                    style={{ padding: "5px 10px", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}
                    onClick={() => invoke("launch_app_cmd", { path: tribeUrlInput }).catch(() => {})}
                  >
                    <ExternalLink size={12} />
                    <span>Open URL</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Bottom 2-Column Split: Local Model Hub + Easy Claude Access */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Local Model Hub (Ollama / LM Studio) */}
            <div className="cc-card" style={{ gap: 9 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="cc-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Cpu size={14} color="#38BDF8" />
                  <span>Local Model</span>
                </div>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: aiStack?.ollamaRunning ? "rgb(52 211 153 / 0.16)" : "rgb(var(--lens-ink) / 0.07)",
                    color: aiStack?.ollamaRunning ? "#34D399" : "var(--lens-fg-secondary)",
                  }}
                >
                  {aiStack?.ollamaRunning ? "● Ollama Live" : "Ollama Ready"}
                </span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {(ollamaModels.length > 0
                  ? ollamaModels.slice(0, 5)
                  : ["llama3.2", "qwen2.5-coder:7b", "deepseek-r1:8b", "mistral"]
                ).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`cc-chip ${selectedLocalModel === m ? "active" : ""}`}
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    onClick={() => enableLocalModel(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                <button
                  type="button"
                  className="cc-btn"
                  style={{ flex: 1, padding: "6px 10px", fontSize: 11.5 }}
                  onClick={() => enableLocalModel(selectedLocalModel)}
                >
                  Use {selectedLocalModel}
                </button>
                <button
                  type="button"
                  className="cc-chip"
                  style={{ padding: "6px 9px", fontSize: 11.5 }}
                  onClick={() => enableLocalModel("local-model", "http://localhost:1234/v1/chat/completions")}
                >
                  LM Studio
                </button>
              </div>
              {localModelStatus && (
                <div style={{ fontSize: 10.5, color: "#38BDF8" }}>{localModelStatus}</div>
              )}
            </div>

            {/* Easy Claude Access */}
            <div className="cc-card" style={{ gap: 9 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="cc-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={14} color="#FB923C" />
                  <span>Easy Claude Access</span>
                </div>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: aiStack?.claudeDesktopInstalled
                      ? "rgb(251 146 60 / 0.18)"
                      : "rgb(var(--lens-ink) / 0.07)",
                    color: aiStack?.claudeDesktopInstalled ? "#FDBA74" : "var(--lens-fg-secondary)",
                  }}
                >
                  {aiStack?.claudeDesktopInstalled ? "● Detected" : "Ready"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button
                  type="button"
                  className="cc-btn"
                  style={{ padding: "6px 8px", fontSize: 11.5 }}
                  onClick={() => {
                    if (aiStack?.claudeDesktopExe) {
                      invoke("launch_app_cmd", { path: aiStack.claudeDesktopExe }).catch(() => {});
                    } else {
                      invoke("launch_app_cmd", { path: "https://claude.ai" }).catch(() => {});
                    }
                  }}
                >
                  Open Claude
                </button>
                <button
                  type="button"
                  className="cc-chip"
                  style={{ padding: "6px 8px", fontSize: 11.5 }}
                  onClick={quickImportClaudeMcp}
                >
                  Import MCPs
                </button>
                <button
                  type="button"
                  className="cc-chip"
                  style={{ padding: "6px 8px", fontSize: 11.5 }}
                  onClick={() => invoke("launch_app_cmd", { path: "https://claude.ai/code" }).catch(() => {})}
                >
                  Claude Code ↗
                </button>
                <button
                  type="button"
                  className="cc-chip"
                  style={{ padding: "6px 8px", fontSize: 11.5 }}
                  onClick={() => {
                    setFormName("Claude Agent");
                    setFormKind("mcp-stdio");
                    setFormEndpoint("npx -y @anthropic-ai/claude-code");
                    setFormModel("claude-sonnet-4-5");
                    setSubTab("integrations");
                  }}
                >
                  + Add Claude
                </button>
              </div>
              {importMsg && (
                <div style={{ fontSize: 10.5, color: "#FDBA74" }}>{importMsg}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 2: WORKFLOWS, TILER & DPO TRAINING ==================== */}
      {subTab === "training" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* 1. Smart Window Organizer & Auto-Tiler */}
          <div className="cc-card" style={{ gap: 9 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div className="cc-label" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <LayoutGrid size={14} color="#34D399" />
                  <span>Smart Window Organizer &amp; Auto-Tiler</span>
                </div>
                <div className="cc-desc">
                  Snap open Win32 windows cleanly between Top Bar &amp; Dock — or type &quot;tile split&quot; / &quot;organize windows&quot; in Search.
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
              {[
                { id: "smart-group", label: "Smart Group", icon: <Sparkles size={13} color="#FBBF24" /> },
                { id: "split", label: "50/50 Split", icon: <Columns2 size={13} color="#38BDF8" /> },
                { id: "focus-stack", label: "Master Stack", icon: <LayoutGrid size={13} color="#A78BFA" /> },
                { id: "grid", label: "2×2 Grid", icon: <LayoutGrid size={13} color="#34D399" /> },
                { id: "thirds", label: "3 Columns", icon: <Columns3 size={13} color="#FB7185" /> },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="cc-chip"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "8px 6px",
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                  onClick={() => runTilerLayout(t.id, t.label)}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            {tilerStatus && (
              <div style={{ fontSize: 11.5, color: "#34D399", fontWeight: 500 }}>{tilerStatus}</div>
            )}
          </div>

          {/* 2. "Watch-Me-Once" Workflow Recorder */}
          <div className="cc-card" style={{ gap: 9 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div className="cc-label" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Circle
                    size={12}
                    fill={recording ? "#F43F5E" : "#71717A"}
                    color={recording ? "#F43F5E" : "#71717A"}
                  />
                  <span>Watch-Me-Once Workflow Recorder</span>
                </div>
                <div className="cc-desc">
                  Record app switches, brightness, volume, theme, and tiling steps into a 1-click replayable macro.
                </div>
              </div>
              {!recording ? (
                <button
                  type="button"
                  className="cc-btn"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  onClick={() => {
                    recSnapshotRef.current = null;
                    setRecordedSteps([]);
                    setRecording(true);
                  }}
                >
                  <Circle size={11} fill="#F43F5E" color="#F43F5E" />
                  <span>Start Recording</span>
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    className="cc-input"
                    style={{ width: 145, padding: "5px 8px", fontSize: 11.5 }}
                    placeholder="Macro name..."
                    value={macroName}
                    onChange={(e) => setMacroName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="cc-btn"
                    style={{ background: "#F43F5E", color: "#fff", display: "inline-flex", alignItems: "center", gap: 5 }}
                    onClick={stopAndSaveRecording}
                  >
                    <Square size={11} fill="currentColor" />
                    <span>Save ({recordedSteps.length})</span>
                  </button>
                </div>
              )}
            </div>

            {recording && (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 9,
                  background: "rgb(244 63 94 / 0.08)",
                  border: "1px solid rgb(244 63 94 / 0.25)",
                  fontSize: 11.5,
                  color: "#FDA4AF",
                }}
              >
                {recordedSteps.length === 0
                  ? "Recording active — switch windows, adjust brightness/volume, change theme, or click a Tiler layout..."
                  : recordedSteps.map((s) => s.label).join("  →  ")}
              </div>
            )}

            {trainingStats.macros.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {trainingStats.macros.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "7px 10px",
                      borderRadius: 9,
                      background: "rgb(var(--lens-ink) / 0.035)",
                      border: "1px solid var(--lens-border)",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--lens-fg)" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--lens-fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.steps.map((s) => s.label).join(" → ")}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="cc-chip"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px" }}
                      onClick={() => replayMacro(m)}
                    >
                      <Play size={11} fill="currentColor" />
                      <span>Run</span>
                    </button>
                    <button aria-label="Delete macro"
                      type="button"
                      className="cc-chip"
                      style={{ padding: "4px 7px", color: "#FB7185" }}
                      onClick={() => {
                        invoke("delete_workflow_macro_cmd", { id: m.id })
                          .then(refreshTrainingStats)
                          .catch(() => {});
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Local Training Dataset Logger (dpo_pairs.jsonl) */}
          <div className="cc-card" style={{ gap: 9 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div className="cc-label" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Database size={14} color="#60A5FA" />
                  <span>Local Training Dataset (`dpo_pairs.jsonl`)</span>
                </div>
                <div className="cc-desc">
                  {trainingStats.pairCount} preference pairs logged ({(trainingStats.fileSizeBytes / 1024).toFixed(1)} KB) · Ready for local LoRA / Unsloth fine-tuning.
                </div>
              </div>
              <button
                type="button"
                className="cc-btn-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => invoke("open_training_folder_cmd").catch(() => {})}
              >
                <FolderOpen size={13} />
                <span>Open Folder</span>
              </button>
            </div>

            {trainingStats.recentPairs.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 170, overflowY: "auto" }}>
                {trainingStats.recentPairs.map((pair, idx) => (
                  <div
                    key={`${pair.ts}-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "6px 9px",
                      borderRadius: 8,
                      background: "rgb(var(--lens-ink) / 0.03)",
                      border: "1px solid var(--lens-border)",
                      fontSize: 11.5,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, color: "var(--lens-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        “{pair.prompt}”
                      </div>
                      <div style={{ fontSize: 10.5, color: "#60A5FA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        ✓ {pair.chosen} <span style={{ color: "var(--lens-fg-muted)" }}>({pair.source})</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button aria-label="Good answer"
                        type="button"
                        className="cc-chip"
                        style={{ padding: "3px 7px", color: "#34D399" }}
                        onClick={() => {
                          invoke("record_dpo_pair_cmd", {
                            prompt: pair.prompt,
                            chosen: pair.chosen,
                            rejected: "wrong_action",
                            source: "user-thumbs-up",
                          })
                            .then(refreshTrainingStats)
                            .catch(() => {});
                        }}
                      >
                        <ThumbsUp size={11} />
                      </button>
                      <button aria-label="Bad answer"
                        type="button"
                        className="cc-chip"
                        style={{ padding: "3px 7px", color: "#FB7185" }}
                        onClick={() => {
                          invoke("record_dpo_pair_cmd", {
                            prompt: pair.prompt,
                            chosen: "ask_clarification",
                            rejected: pair.chosen,
                            source: "user-thumbs-down",
                          })
                            .then(refreshTrainingStats)
                            .catch(() => {});
                        }}
                      >
                        <ThumbsDown size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: "var(--lens-fg-muted)", padding: "6px 0" }}>
                Run a command in Dock Search (e.g. &quot;mute chrome, 40% brightness, catppuccin theme&quot;) or tile windows above to start logging DPO pairs automatically.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 1: AGENT CHAT ==================== */}
      {subTab === "chat" && (
        <div
          className="cc-card"
          style={{ flex: 1, minHeight: 360, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingRight: 4,
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  padding: "9px 12px",
                  borderRadius: 11,
                  background: m.role === "user" ? "#fafafa" : "rgb(var(--lens-ink) / 0.06)",
                  color: m.role === "user" ? "#09090b" : "#fafafa",
                  fontSize: 12.5,
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                }}
              >
                <div>{m.text}</div>
                <div
                  style={{
                    fontSize: 9.5,
                    opacity: 0.55,
                    marginTop: 3,
                    textAlign: m.role === "user" ? "right" : "left",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {m.time}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div style={{ display: "flex", gap: 8, paddingTop: 6, borderTop: "1px solid var(--lens-border)" }}>
            <input
              className="cc-input"
              style={{ flex: 1 }}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder="Ask your agent or run a live Lens rewrite (e.g. '85% opacity', 'sharp corners')..."
            />
            <button
              type="button"
              className="cc-btn"
              disabled={sending}
              onClick={handleSend}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Send size={13} />
              <span>{sending ? "..." : "Send"}</span>
            </button>
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 2: INTEGRATIONS & MCP ==================== */}
      {subTab === "integrations" && (
        <>
          <div className="cc-card" style={{ gap: 10 }}>
            <div className="cc-row">
              <div>
                <div className="cc-label">Connected Agents &amp; MCP Servers</div>
                <div className="cc-desc">
                  Manage local LLMs, Claude Desktop MCP servers, or custom stdio/HTTP tools.
                </div>
              </div>
              <button
                type="button"
                className="cc-btn-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                onClick={handleImportClaudeMcp}
              >
                <Download size={13} />
                <span>Import Claude MCP</span>
              </button>
            </div>

            {importMsg && (
              <div style={{ fontSize: 11.5, color: "#34D399" }}>{importMsg}</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {integrations.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "9px 11px",
                    borderRadius: 10,
                    background: "rgb(var(--lens-ink) / 0.035)",
                    border: "1px solid rgb(var(--lens-ink) / 0.08)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--lens-fg)" }}>
                        {item.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 5,
                          background: "rgb(var(--lens-ink) / 0.08)",
                          color: "var(--lens-fg-secondary)",
                        }}
                      >
                        {item.kind}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--lens-fg-muted)",
                        fontFamily: "var(--font-mono)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.endpoint}
                      {item.model ? ` · ${item.model}` : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      role="switch" aria-checked={!!(item.enabled)} aria-label={`Enable ${item.name}`} className={`cc-toggle ${item.enabled ? "on" : ""}`}
                      onClick={() =>
                        persistIntegrations(
                          integrations.map((x) =>
                            x.id === item.id ? { ...x, enabled: !x.enabled } : x
                          )
                        )
                      }
                    />
                    <button aria-label={`Edit ${item.name}`}
                      type="button"
                      className="cc-btn-ghost"
                      style={{ padding: "5px 7px" }}
                      onClick={() => {
                        setEditingId(item.id);
                        setFormName(item.name);
                        setFormKind(item.kind);
                        setFormEndpoint(item.endpoint);
                        setFormModel(item.model || "");
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    {item.id !== "lens-local" && (
                      <button aria-label={`Remove ${item.name}`}
                        type="button"
                        className="cc-btn-ghost"
                        style={{ padding: "5px 7px", color: "#fb7185" }}
                        onClick={() =>
                          persistIntegrations(integrations.filter((x) => x.id !== item.id))
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add / Edit Agent or MCP Server */}
          <div className="cc-card" style={{ gap: 9 }}>
            <div className="cc-label">
              {editingId ? "Edit Integration" : "Add Agent or MCP Server"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
              <input
                className="cc-input"
                placeholder="Name (e.g. GitHub MCP, Local Qwen)"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
              <select
                className="cc-input"
                value={formKind}
                onChange={(e) => setFormKind(e.target.value as AgentIntegration["kind"])}
              >
                <option value="mcp-stdio">MCP (stdio)</option>
                <option value="mcp-http">MCP (HTTP/SSE)</option>
                <option value="ollama">Local Ollama</option>
                <option value="cloud-api">Cloud API</option>
                <option value="desktop-agent">Desktop Agent</option>
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px auto", gap: 8 }}>
              <input
                className="cc-input"
                placeholder="Command or URL (e.g. npx -y ... or http://localhost:11434/api/chat)"
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
              />
              <input
                className="cc-input"
                placeholder="Model (optional)"
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
              />
              <button
                type="button"
                className="cc-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={handleSaveIntegration}
              >
                {editingId ? <Check size={13} /> : <Plus size={13} />}
                <span>{editingId ? "Save" : "Add"}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ==================== SUB-TAB 3: SAFE AGENTS.MD EDITOR ==================== */}
      {subTab === "rules" && (
        <div className="cc-card" style={{ flex: 1, minHeight: 360, gap: 10 }}>
          <div className="cc-row">
            <div>
              <div className="cc-label">AGENTS.md — Global Agent Safety &amp; Consistency Rules</div>
              <div className="cc-desc">
                Saved to %APPDATA%\LensUI\AGENTS.md and injected automatically into connected agents.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="cc-btn-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => {
                  invoke<string>("reset_agents_md_cmd")
                    .then((md) => {
                      setAgentsMd(md);
                      setMdStatus("Reset to safe defaults.");
                    })
                    .catch(() => {});
                }}
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
              <button
                type="button"
                className="cc-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => {
                  invoke("save_agents_md_cmd", { content: agentsMd })
                    .then(() => setMdStatus("Saved AGENTS.md cleanly."))
                    .catch((e) => setMdStatus(`Error: ${String(e)}`));
                }}
              >
                <Save size={12} />
                <span>Save</span>
              </button>
            </div>
          </div>

          {mdStatus && <div style={{ fontSize: 11.5, color: "#34D399" }}>{mdStatus}</div>}

          <textarea
            className="cc-input"
            value={agentsMd}
            onChange={(e) => setAgentsMd(e.target.value)}
            style={{
              flex: 1,
              minHeight: 280,
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              lineHeight: 1.5,
              resize: "none",
            }}
          />
        </div>
      )}
    </>
  );
};

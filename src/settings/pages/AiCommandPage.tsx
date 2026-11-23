import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { AiCard } from "../../components/AiCard";
import { CommandCard } from "../../components/CommandCard";
import { ClipboardCard } from "../../components/ClipboardCard";
import { ConnectionsCard } from "../../bridge/ConnectionsCard";
import { BridgeInbox } from "../../bridge/BridgeInbox";
import { TranscriptionCard } from "../../media/TranscriptionCard";
import { McpCard } from "../../components/McpCard";
import { AgentsPane } from "../../components/AgentsPane";
import { Section, StateNote } from "../ui/primitives";
import type { PageProps } from "./common";

/** Lens › AI & Command. Agents used to be a separate tab; it's a section here now. */
export const AiCommandPage: React.FC<PageProps> = ({ section, config, updateConfig }) => (
  <>
    <StateNote kind="info">Everything here is off until you turn it on. Local models are used first; nothing leaves this PC unless you allow it.</StateNote>
    <BridgeInbox />
    <Section id="engine" title="AI engine" summary="Engine, privacy and keys" forceOpen={section === "engine"}>
      <AiCard onTryIt={() => invoke("toggle_surface", { label: "palette" }).catch(() => {})} />
    </Section>
    <Section id="command" title="Lens Command" summary="Hotkey, Mini, slash commands" forceOpen={section === "command"}>
      <CommandCard config={config} onUpdateConfig={updateConfig} />
    </Section>
    <Section id="clipboard" title="Clipboard history" summary="Encrypted, password-safe" defaultOpen={section === "clipboard"} forceOpen={section === "clipboard"}>
      <ClipboardCard />
    </Section>
    <Section id="connections" title="Connections" summary="Browser, File Explorer, Claude Desktop" defaultOpen={section === "connections"} forceOpen={section === "connections"}>
      <ConnectionsCard />
    </Section>
    <Section id="transcription" title="Transcription" summary="whisper.cpp, local" defaultOpen={section === "transcription"} forceOpen={section === "transcription"}>
      <TranscriptionCard />
    </Section>
    <Section id="mcp" title="AI apps (MCP)" summary="Let Claude Desktop and Claude Code use Lens" defaultOpen={section === "mcp"} forceOpen={section === "mcp"}>
      <McpCard config={config} onUpdateConfig={updateConfig} />
    </Section>
    <Section id="agents" title="Agents" summary="Automations and macros" defaultOpen={section === "agents"} forceOpen={section === "agents"}>
      <AgentsPane config={config} onUpdateConfig={updateConfig} />
    </Section>
  </>
);

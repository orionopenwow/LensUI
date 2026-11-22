import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LensConfig } from "../types/lens";
import { applyThemePack, packById } from "../themes/packs";

interface Props {
  config: LensConfig | null;
  updateConfig: (next: LensConfig) => Promise<void> | void;
}

/**
 * Invisible helper mounted once (in the Dock, which is always running). Applies theme packs that an
 * AI app asked for through MCP (`apply_theme_pack`), because theme packs live in the frontend.
 * Unknown pack ids are ignored.
 */
export function McpBridge({ config, updateConfig }: Props) {
  const cfgRef = useRef(config);
  cfgRef.current = config;
  const updRef = useRef(updateConfig);
  updRef.current = updateConfig;

  useEffect(() => {
    const un = listen<string>("lens://mcp-apply-pack", (e) => {
      const cfg = cfgRef.current;
      const id = typeof e.payload === "string" ? e.payload : "";
      if (!cfg || !packById(id)) return;
      updRef.current(applyThemePack(cfg, id));
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  return null;
}

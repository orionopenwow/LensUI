// Typed wrappers over the feeds_* commands (src-tauri/src/commands/feeds.rs).
import { invoke } from "@tauri-apps/api/core";
import type { ApprovalDto, DigestDto, FeedsSettings, PostResult, SourceCfg, SourceView, TimelineDto } from "../types/generated";

export type { ApprovalDto, DigestDto, FeedsSettings, PostResult, SourceCfg, SourceView, TimelineDto };

export const feedsApi = {
  settings: () => invoke<FeedsSettings>("feeds_get_settings"),
  setSettings: (settings: FeedsSettings) => invoke<FeedsSettings>("feeds_set_settings", { settings }),
  sources: () => invoke<SourceView[]>("feeds_sources_list"),
  addSource: (source: SourceCfg) => invoke<SourceView[]>("feeds_source_add", { source }),
  removeSource: (id: string) => invoke<SourceView[]>("feeds_source_remove", { id }),
  toggleSource: (id: string, enabled: boolean) => invoke<SourceView[]>("feeds_source_toggle", { id, enabled }),
  timeline: (filter: string, limit = 150) => invoke<TimelineDto>("feeds_timeline", { filter, limit }),
  refresh: (filter: string, id: string | null = null) => invoke<TimelineDto>("feeds_refresh", { id, filter }),
  importOpml: (text: string) => invoke<number>("feeds_opml_import", { text }),
  exportOpml: () => invoke<string>("feeds_opml_export"),
  connectBluesky: (handle: string, appPassword: string, pds: string | null = null) => invoke<SourceCfg>("feeds_connect_bluesky", { handle, appPassword, pds }),
  connectToken: (kind: "github" | "x", account: string, token: string, dailyCap: number | null = null) =>
    invoke<SourceCfg>("feeds_connect_token", { kind, account, token, dailyCap }),
  connectMastodon: (instance: string) => invoke<SourceCfg>("feeds_connect_mastodon", { instance }),
  digest: (hours: number | null = null) => invoke<DigestDto>("feeds_digest", { hours }),
  composeRequest: (text: string, targets: string[]) => invoke<ApprovalDto>("feeds_compose_request", { req: { text, targets } }),
  approve: (approvalId: string) => invoke<null>("feeds_approve", { approvalId }),
  deny: (approvalId: string) => invoke<null>("feeds_deny", { approvalId }),
  post: (approvalId: string) => invoke<PostResult[]>("feeds_post", { approvalId }),
  xEmbed: (kind: "profile" | "list", target: string, dark: boolean) => invoke<string>("feeds_x_embed", { kind, target, dark }),
};

/** New RSS / YouTube-channel source from a pasted URL. The id is derived server-side for OPML;
 *  here a short random id keeps it unique. */
export function rssSource(url: string, label: string, kind: "rss" | "youtube" = "rss"): SourceCfg {
  const id = `${kind}:${Math.random().toString(36).slice(2, 10)}`;
  return { id, kind, label: label || url.replace(/^https?:\/\//, "").split("/")[0], enabled: true, url, host: null, account: null, vaultKey: null, kindOverride: null, dailyCap: null, folder: null };
}

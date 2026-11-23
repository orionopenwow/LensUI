// Parity mock for Lens Apps: the base harness mock plus the apps commands with sample data.
// Live thumbnails are off so screenshots never touch the network (placeholders are local).
import { invoke as baseInvoke } from "../mock/core";
import catalog from "../../../catalog/apps/catalog.json";

declare const __LENS_MEDIA_CACHE__: boolean;
export { convertFileSrc, isTauri } from "../mock/core";

const t0 = Date.UTC(2026, 10, 23, 16, 4, 0);
const handlers: Record<string, (a: any) => any> = {
  apps_catalog: () => catalog,
  apps_settings_get: () => ({ autoUpdate: false, checkUpdates: "weekly", showNonOpenSource: true, liveThumbnails: true }),
  // Serve official media from the local cache copied into out/media by build.mjs.
  apps_media: (a) => {
    // Without the local cache (CI), behave like a refused download so the fallbacks render offline.
    if (!__LENS_MEDIA_CACHE__) throw "that media isn't part of this app's entry (no local cache)";
    return `media/${a.appId}/${encodeURIComponent(String(a.url).split("/").pop() || "")}`;
  },
  apps_installed_icon: () => null,
  apps_settings_set: () => null,
  apps_installed: () => ({ ollama: { version: "0.40.10", available: "0.40.16" }, krita: { version: "5.3.4.1", available: null }, "obs-studio": { version: "33.0.0", available: null } }),
  apps_lens_installed: () => ["ollama", "krita"],
  apps_audit: () => [
    { atMs: t0, action: "install", appId: "krita", method: "winget", result: "ok", detail: "Successfully installed" },
    { atMs: t0 + 600_000, action: "recipe-apply", appId: "krita", method: "recipe", result: "ok", detail: "3 step(s)" },
    { atMs: t0 + 900_000, action: "release-download", appId: "concat", method: "githubRelease", result: "ok", detail: "Concat_0.2.8_x64_en-US.msi checksum=verified" },
    { atMs: t0 + 1_200_000, action: "install", appId: "ollama", method: "winget", result: "ok", detail: "Successfully installed" },
  ].reverse(),
  apps_show: () => SHOW,
  apps_recipe_preview: () => RECIPE,
  apps_catalog_refresh: () => {
    throw "Checking for new apps arrives with signed catalogue updates. This build uses the catalogue it shipped with.";
  },
};

export const SHOW = {
  id: "Ollama.Ollama",
  name: "Ollama",
  version: "0.40.16",
  publisher: "Ollama",
  license: "MIT",
  licenseUrl: "https://github.com/ollama/ollama/blob/main/LICENSE",
  homepage: "https://ollama.com",
  agreements: [{ label: "Terms of Service", text: "https://ollama.com/terms" }],
  installerType: "inno",
  installerSize: 1_181_116_006,
  installerUrl: "https://github.com/ollama/ollama/releases/download/v0.40.16/OllamaSetup.exe",
  installerSha256: "3f0a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728",
};

export const RECIPE = [
  { index: 0, kind: "addToDock", description: "Pin Concat to the Dock" },
  { index: 1, kind: "openWith", description: 'Show "Open in Concat" in Lens right-click menus for .mp4, .mov, .mkv, .webm (your Windows defaults stay as they are)' },
  { index: 2, kind: "rightClick", description: "Add 1 right-click action(s): open_in_app" },
  { index: 3, kind: "voiceVerbs", description: 'Voice: "Lens, open concat", "Lens, edit this video in concat"' },
  { index: 4, kind: "guideLesson", description: 'Add the Guide lesson "Edit a video with Concat"' },
];

export const RELEASE = {
  token: "rel-1",
  appId: "concat",
  tag: "v0.2.8",
  fileName: "Concat_0.2.8_x64_en-US.msi",
  size: 96_468_992,
  sha256: "9c1d5e7f2a4b6c8d0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d",
  checksum: "verified",
  signatureStatus: "NotSigned",
  publisher: null,
  sourceUrl: "https://github.com/jub0t/Concat/releases/download/v0.2.8/Concat_0.2.8_x64_en-US.msi",
};

export async function invoke(cmd: string, args?: any) {
  const h = handlers[cmd];
  if (h) return h(args);
  return baseInvoke(cmd, args);
}

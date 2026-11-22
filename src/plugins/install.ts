import { invoke } from "@tauri-apps/api/core";
import { readZip } from "./zip";
import type { PluginManifest } from "./types";

/** Base64 for Uint8Array without blowing the call stack on large files. */
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

interface PluginFilePayload {
  path: string;
  dataB64: string;
}

async function send(files: PluginFilePayload[]): Promise<PluginManifest> {
  return invoke<PluginManifest>("install_plugin_files_cmd", { files });
}

/** Files from <input type="file" webkitdirectory> (each has webkitRelativePath). */
export async function installFromFolder(list: FileList): Promise<PluginManifest> {
  const files: PluginFilePayload[] = [];
  if (list.length > 200) throw new Error("A plugin can contain at most 200 files.");
  let total = 0;
  for (const f of Array.from(list)) {
    total += f.size;
    if (f.size > 2 * 1024 * 1024) throw new Error(`'${f.name}' is larger than 2 MB.`);
    if (total > 8 * 1024 * 1024) throw new Error("The plugin is larger than 8 MB.");
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    files.push({ path: rel, dataB64: toBase64(new Uint8Array(await f.arrayBuffer())) });
  }
  return send(files);
}

/** A single .zip file the user picked. */
export async function installFromZip(file: File): Promise<PluginManifest> {
  if (file.size > 12 * 1024 * 1024) throw new Error("The archive is too large.");
  const entries = await readZip(await file.arrayBuffer());
  return send(entries.map((e) => ({ path: e.path, dataB64: toBase64(e.data) })));
}

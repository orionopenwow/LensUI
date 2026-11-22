/**
 * Minimal, defensive .zip reader for plugin packages (no dependency).
 * Supports "stored" and "deflate" entries via the browser's DecompressionStream.
 * Rejects encrypted, zip64 and oversized archives; caps entry count and total size.
 */
export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

const MAX_ENTRIES = 200;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

async function inflateRaw(data: Uint8Array, expected: number): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  // Copy into a plain ArrayBuffer-backed view (BlobPart rejects SharedArrayBuffer-typed views).
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(ds);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > Math.min(MAX_ENTRY_BYTES, expected)) {
      await reader.cancel();
      throw new Error("A file in the archive is larger than it claims.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export async function readZip(buf: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (bytes.length < 22) throw new Error("Not a .zip file.");
  // Find the End Of Central Directory record (it may be followed by a comment).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a .zip file.");
  const count = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new Error("Zip64 archives are not supported.");
  if (count > MAX_ENTRIES) throw new Error(`A plugin can contain at most ${MAX_ENTRIES} files.`);
  const decoder = new TextDecoder();
  const out: ZipEntry[] = [];
  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error("The archive is damaged.");
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (flags & 0x1) throw new Error("Encrypted archives are not supported.");
    if (size > MAX_ENTRY_BYTES) throw new Error(`'${name.slice(0, 80)}' is larger than 2 MB.`);
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new Error("The plugin is larger than 8 MB.");
    if (localOffset + 30 > bytes.length || dv.getUint32(localOffset, true) !== 0x04034b50) throw new Error("The archive is damaged.");
    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    if (start + compSize > bytes.length) throw new Error("The archive is damaged.");
    const raw = bytes.subarray(start, start + compSize);
    let data: Uint8Array;
    if (method === 0) {
      if (compSize !== size) throw new Error("The archive is damaged.");
      data = raw.slice();
    } else if (method === 8) {
      data = await inflateRaw(raw, size);
      if (data.length !== size) throw new Error("The archive is damaged.");
    } else {
      throw new Error(`'${name.slice(0, 80)}' uses an unsupported compression method.`);
    }
    // Paths are validated again in Rust (win_plugins::prepare_install); this is only a courtesy.
    out.push({ path: name.replace(/\\/g, "/"), data });
  }
  return out;
}

// Lens Remote's pairing QR code and status text, and the Equalizer / Remote settings wiring.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { alignmentPositions, dataCodewords, encodeQr, qrSvg } from "../music/qr";
import { remoteLine } from "../music/remoteText";

const ROOT = join(import.meta.dir, "..", "..");

describe("QR code encoder", () => {
  test("picks the smallest version that fits and has the right size", () => {
    expect(encodeQr("hi").version).toBe(1);
    const url = "http://192.168.1.23:43120/pair?t=" + "a".repeat(64);
    const c = encodeQr(url);
    expect(c.size).toBe(c.version * 4 + 17);
    expect(dataCodewords(c.version)).toBeGreaterThanOrEqual(url.length + 2);
    expect(dataCodewords(c.version - 1)).toBeLessThan(url.length + 2);
    expect(() => encodeQr("x".repeat(400))).toThrow();
  });

  test("known spec values: capacities and alignment positions", () => {
    // Level M data codewords for versions 1–10 (ISO/IEC 18004 table 7).
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(dataCodewords)).toEqual([16, 28, 44, 64, 86, 108, 124, 154, 182, 216]);
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(10)).toEqual([6, 28, 50]);
  });

  test("finder patterns, timing and the dark module are where scanners look", () => {
    const c = encodeQr("http://10.0.0.5:43120/pair?t=0123");
    const m = c.modules;
    const n = c.size;
    for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      // Outer ring dark, ring inside light, 3×3 core dark.
      expect(m[y0][x0] && m[y0 + 6][x0 + 6] && m[y0 + 3][x0 + 3]).toBe(true);
      expect(m[y0 + 1][x0 + 1] || m[y0 + 5][x0 + 5]).toBe(false);
    }
    for (let i = 8; i < n - 8; i++) expect(m[6][i]).toBe(i % 2 === 0);
    expect(m[n - 8][8]).toBe(true);
  });

  test("the same text always gives the same code; the SVG has a quiet zone", () => {
    const a = encodeQr("lens");
    expect(encodeQr("lens").modules).toEqual(a.modules);
    const svg = qrSvg(a);
    expect(svg).toContain(`viewBox="0 0 ${a.size + 8} ${a.size + 8}"`);
    expect(svg).toContain("M4 4h1v1h-1z");
  });
});

describe("Lens Remote text", () => {
  test("says where it is, how many phones and when it stops", () => {
    expect(remoteLine(null)).toBe("Off");
    expect(remoteLine({ on: false, pairUrl: null, address: "", phones: 0, idleMin: 10, note: "Stopped after 10 minutes without use." })).toBe("Stopped after 10 minutes without use.");
    expect(remoteLine({ on: true, pairUrl: "x", address: "192.168.1.20:43120", phones: 0, idleMin: 10, note: null })).toBe("On at 192.168.1.20:43120 · no phone paired yet · stops after 10 min without use");
    expect(remoteLine({ on: true, pairUrl: null, address: "a", phones: 2, idleMin: 5, note: null })).toContain("2 phones paired");
  });
});

describe("wiring", () => {
  test("Remote is Tester mode only and the Equalizer change is registered for Remove all", () => {
    const cmd = readFileSync(join(ROOT, "src-tauri/src/commands/music.rs"), "utf8");
    expect(cmd).toMatch(/fn music_remote_start[\s\S]{0,200}tester_on\(&app\)/);
    const changes = readFileSync(join(ROOT, "src-tauri/src/changes.rs"), "utf8");
    expect(changes).toContain('id: "equalizer-apo-preset"');
    expect(changes).toContain('"music/eq.rs"');
    const card = readFileSync(join(ROOT, "src/components/MusicCard.tsx"), "utf8");
    expect(card).toContain("tester={!!config?.tester?.enabled}");
  });

  test("the phone page loads nothing from the web", () => {
    const rs = readFileSync(join(ROOT, "src-tauri/src/music/remote.rs"), "utf8");
    const page = rs.slice(rs.indexOf("pub const PAGE_HTML"), rs.indexOf("// ------------------------------------------------------------------------------- the service"));
    expect(page).not.toMatch(/https?:\/\//);
  });
});

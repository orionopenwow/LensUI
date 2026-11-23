import { describe, expect, test } from "bun:test";
import { wifiTile, bluetoothTile, soundTile, displayTile, latestOnly } from "../quicksettings/live";

const wifi = (o: object) => ({ available: true, reason: "", radioOn: true, adapter: "Wi-Fi", connectedSsid: null, networks: [], ...o }) as never;
const bt = (o: object) => ({ available: true, reason: "", radioOn: true, devices: [], ...o }) as never;
const scr = (supported: boolean) => ({ id: "x", name: "D", kind: "external", supported, brightness: supported ? 50 : null, note: "" });

describe("Quick Settings tiles show real state", () => {
  test("Wi-Fi", () => {
    expect(wifiTile(null).sub).toBe("Checking…");
    expect(wifiTile(wifi({ connectedSsid: "Home" }))).toEqual({ sub: "Home", active: true, disabled: false });
    expect(wifiTile(wifi({ radioOn: false })).sub).toBe("Off");
    expect(wifiTile(wifi({ available: false, reason: "No Wi-Fi adapter" }))).toEqual({ sub: "No Wi-Fi adapter", active: false, disabled: true });
    expect(wifiTile(wifi({})).sub).toBe("Not connected");
  });
  test("Bluetooth", () => {
    expect(bluetoothTile(bt({ radioOn: false })).sub).toBe("Off");
    expect(bluetoothTile(bt({ devices: [{ connected: true }, { connected: false }, { connected: true }] })).sub).toBe("2 connected");
    expect(bluetoothTile(bt({})).sub).toBe("On · nothing connected");
  });
  test("Sound and Display", () => {
    expect(soundTile(16.4, false)).toEqual({ sub: "16%", active: true, disabled: false });
    expect(soundTile(40, true).sub).toBe("Muted");
    expect(displayTile([scr(true), scr(false)]).sub).toBe("2 screens · 1 adjustable");
    expect(displayTile([scr(true)]).sub).toBe("1 screen");
  });
});

describe("latestOnly", () => {
  test("one call in flight; the last value wins", async () => {
    const sent: number[] = [];
    let release: () => void = () => {};
    const send = (v: number) => {
      sent.push(v);
      return new Promise<void>((r) => (release = r));
    };
    const f = latestOnly(send);
    f(1); f(2); f(3); f(4);
    expect(sent).toEqual([1]);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual([1, 4]);
  });
});

import { describe, expect, test } from "bun:test";
import { controllerLine, thumbdeskPin, type ThumbDeskInfo } from "../components/controller";

const base: ThumbDeskInfo = {
  installed: true,
  path: "C:\\Users\\x\\AppData\\Roaming\\LensUI\\apps\\portable\\thumbdesk\\ThumbDesk.exe",
  running: true,
  pinned: false,
  status: { version: "2.3.0", connected: true, controller: "DualSense Wireless Controller", runtimeEnabled: true, guardSuspended: false, voiceListening: false },
};

describe("controller card", () => {
  test("says plainly what ThumbDesk is doing", () => {
    expect(controllerLine({ ...base, installed: false, path: null, running: false, status: null })).toBe("Not installed.");
    expect(controllerLine({ ...base, running: false, status: null })).toContain("Not running");
    expect(controllerLine({ ...base, status: { ...base.status!, connected: false } })).toContain("No controller connected");
    expect(controllerLine(base)).toBe("DualSense Wireless Controller connected and driving the desktop.");
    expect(controllerLine({ ...base, status: { ...base.status!, guardSuspended: true } })).toContain("Paused while a protected or Steam game");
    expect(controllerLine({ ...base, status: { ...base.status!, voiceListening: true } })).toContain("Listening");
  });

  test("pins Lens's copy to the Dock", () => {
    expect(thumbdeskPin(base.path!)).toEqual({ id: "thumbdesk", name: "ThumbDesk", path: base.path!, iconHint: null });
  });

  test("the catalogue entry installs a verified portable program from ThumbDesk's releases", async () => {
    const cat = (await import("../../catalog/apps/catalog.json")).default as { apps: { id: string; install: Record<string, unknown>; collections: string[] }[] };
    const td = cat.apps.find((a) => a.id === "thumbdesk")!;
    expect(td.install).toMatchObject({ method: "githubRelease", repo: "orionopenwow/ThumbDesk", portable: true, hints: ["thumbdesk.exe"] });
    expect(td.collections).toContain("lens-family");
  });
});

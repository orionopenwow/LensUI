// Renders Lens Cleaner for screenshots: ?scene=…&preset=…[&shape=expressive]
//   home · scanning · cleanup · expanded · smart · approval · space-list · treemap · sunburst ·
//   biggest · done · share · undo · empty · apps · timeline · downloads · settings · flow (video)
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { CleanerApp, type CleanerDemo } from "../../../src/cleaner/CleanerApp";
import { defaultTicked } from "../../../src/cleaner/model";
import { REPORT } from "./mockCore";

const GB = 1_000_000_000;
const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "home";
const report = REPORT as any;
const cleanup = { screen: "cleanup" as const, tab: "cleanup" as const, report, ticked: defaultTicked(report) };
const DONE = { freed: 32.5 * GB, root: "C:\\", total: 238 * GB, freeBefore: 9.6 * GB, freeAfter: 42.1 * GB, binned: 0, skipped: [["C:\\Users\\levi\\AppData\\Local\\Temp\\chrome_drag1234\\lock", "In use right now, so it was skipped."]] as [string, string][] };

function demo(): CleanerDemo | undefined {
  switch (scene) {
    case "scanning":
      return { flow: { screen: "scanning" }, scan: { done: { "recycle-bin": 4.2 * GB, "browser-cache": 9.8 * GB, "shader-cache": 3.4 * GB, "windows-update": 8.9 * GB, "big-downloads": 41.6 * GB, "windows-old": 24.1 * GB, temp: 6.4 * GB }, found: 23.8 * GB } };
    case "cleanup":
      return { flow: cleanup };
    case "expanded":
      return { flow: { ...cleanup, expanded: "big-downloads", picks: { "big-downloads": [report.categories.find((c: any) => c.id === "big-downloads").items[2].path] } } };
    case "smart":
      return {
        flow: cleanup,
        preview: {
          title: "Smart Clean: here's exactly what will happen",
          smart: true,
          preview: {
            id: "plan-1",
            entries: report.categories.filter((c: any) => c.method === "deleteFiles" && c.preTicked).flatMap((c: any) => c.items.map((i: any) => ({ category: c.id, path: i.path, size: i.size, action: "delete" }))),
            entryCount: 70_473,
            steps: [{ category: "recycle-bin", kind: "emptyBin", target: "", label: "Empty the Recycle Bin", size: 4.2 * GB }],
            total: 29.1 * GB,
            confirmToken: null,
            refused: [],
          },
        },
      };
    case "approval":
      return {
        flow: { screen: "space", tab: "space" },
        space: { selected: ["C:\\Users\\levi\\Downloads\\Dune Part Two 2160p.mkv", "C:\\Users\\levi\\Downloads\\ubuntu-24.04-desktop-amd64.iso"] },
        preview: {
          title: "Move to the Recycle Bin",
          userFiles: true,
          preview: {
            id: "plan-2",
            entries: [
              { category: "user", path: "C:\\Users\\levi\\Downloads\\Dune Part Two 2160p.mkv", size: 22.4 * GB, action: "recycle" },
              { category: "user", path: "C:\\Users\\levi\\Downloads\\ubuntu-24.04-desktop-amd64.iso", size: 6.1 * GB, action: "recycle" },
            ],
            entryCount: 2,
            steps: [],
            total: 28.5 * GB,
            confirmToken: null,
            refused: [["C:\\Users\\levi\\Documents\\thesis.docx", "Documents is protected; Lens never cleans it."]],
          },
        },
      };
    case "space-list":
      return { flow: { screen: "space", tab: "space" }, space: { mode: "list" } };
    case "treemap":
      return { flow: { screen: "space", tab: "space" }, space: { mode: "treemap" } };
    case "sunburst":
      return { flow: { screen: "space", tab: "space" }, space: { mode: "sunburst" } };
    case "biggest":
      return { flow: { screen: "space", tab: "space" }, space: { mode: "list", filter: "video", selected: ["C:\\Users\\levi\\Videos\\Graduation 4K.mp4"], moving: { path: "C:\\Users\\levi\\Downloads\\Dune Part Two 2160p.mkv", done: 14.6 * GB, total: 22.4 * GB } } };
    case "done":
      return { flow: { screen: "done", report }, done: DONE };
    case "share":
      return { flow: { screen: "done", report }, done: DONE, share: true };
    case "undo":
      return { flow: { screen: "done", report }, done: { ...DONE, binned: 4 }, undo: 4 };
    case "empty":
      return { flow: { screen: "cleanup", tab: "cleanup", report: { categories: [], safeBytes: 12_000_000, reviewBytes: 0, elapsedMs: 3000 } } };
    case "apps":
      return { flow: { ...cleanup, tab: "apps" } };
    case "timeline":
      return { flow: { ...cleanup, tab: "timeline" } };
    case "downloads":
      return { flow: { ...cleanup, tab: "downloads" } };
    case "settings":
      return { settings: true };
    default:
      return undefined;
  }
}

function App() {
  useLensState();
  return <CleanerApp demo={demo()} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

// Top Bar pill shown while a drive is low on space (only when the alert is turned on in
// Lens Cleaner). Clicking it opens Lens Cleaner; nothing is cleaned from here.
import React, { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { EVENTS, on } from "./api";
import { driveName, fmtSize } from "./model";
import "./cleaner.css";

export const LowSpacePill: React.FC = () => {
  const [low, setLow] = useState<[string, number][]>([]);
  useEffect(() => on<[string, number][]>(EVENTS.lowSpace, setLow), []);
  if (!low.length) return null;
  const [root, free] = low[0];
  return (
    <button type="button" className="cl-lowpill" aria-label={`${driveName(root)} is almost full, ${fmtSize(free)} free. Open Lens Cleaner.`} onClick={() => invoke("open_surface", { label: "cleaner" }).catch(() => {})}>
      <HardDrive size={12} strokeWidth={2.6} aria-hidden /> {driveName(root)} · {fmtSize(free)} left
    </button>
  );
};

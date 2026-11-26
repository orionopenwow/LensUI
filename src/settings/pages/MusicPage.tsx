import React from "react";
import { MusicCard } from "../../components/MusicCard";
import type { PageProps } from "./common";

/** Lens › Music: now playing across apps, lyrics, theme follows music (docs/MUSIC.md). */
export const MusicPage: React.FC<PageProps> = ({ config, updateConfig }) => <MusicCard config={config} updateConfig={updateConfig} />;

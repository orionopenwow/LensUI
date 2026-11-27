import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ command }) => ({
  plugins: [react()],
  clearScreen: false,
  define: {
    // Lens Mission Control (docs/MISSION_CONTROL.md) is compiled in only for the dev server that
    // Launch-Lens-UI.bat starts with LENS_ADMIN=1. `vite build` (every release and edition) always
    // gets false, so the surface and its code are left out of the bundle (tools/mission/guard.mjs).
    __LENS_ADMIN__: JSON.stringify(command === "serve" && process.env.LENS_ADMIN === "1"),
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));

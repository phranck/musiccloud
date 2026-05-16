import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

const DEFAULT_DEV_BACKEND_URL = "http://localhost:4000";

function buildDevProxy() {
  const backendUrl = process.env.BACKEND_URL?.trim() || DEFAULT_DEV_BACKEND_URL;
  return {
    "/api": { target: backendUrl, changeOrigin: true },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), UnoCSS()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/@dnd-kit/")) {
            return "dnd-kit";
          }
          if (id.includes("/node_modules/recharts/")) {
            return "recharts";
          }
        },
      },
    },
  },
  server: {
    port: Number(process.env.PORT) || 4001,
    allowedHosts: ["localhost", "dashboard.musiccloud.test"],
    ...(command === "serve" ? { proxy: buildDevProxy() } : {}),
  },
}));

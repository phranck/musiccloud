import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

function buildDevProxy() {
  const backendUrl = process.env.BACKEND_URL?.trim();
  if (!backendUrl) {
    throw new Error(
      "Missing BACKEND_URL. Define it in .env.local — manually or via pewee.",
    );
  }
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

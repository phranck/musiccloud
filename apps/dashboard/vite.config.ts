import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

export default defineConfig({
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
    port: 4001,
    allowedHosts: ["localhost"],
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});

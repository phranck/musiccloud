import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  server: {
    port: 4001,
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});

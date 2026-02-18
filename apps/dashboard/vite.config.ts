import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  server: {
    port: 5000,
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});

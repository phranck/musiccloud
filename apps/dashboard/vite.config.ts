import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

const DEFAULT_DEV_BACKEND_URL = "http://localhost:4000";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nodeModulePattern(packageName: string) {
  const packagePath = packageName.split("/").map(escapeRegExp).join(String.raw`[\\/]`);
  return new RegExp(String.raw`node_modules[\\/]${packagePath}(?:[\\/]|$)`);
}

const nodeModuleGroup = (name: string, packageName: string, priority: number) => ({
  name,
  priority,
  test: nodeModulePattern(packageName),
});

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
    rolldownOptions: {
      preserveEntrySignatures: "allow-extension",
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            nodeModuleGroup("react-vendor", "react", 100),
            nodeModuleGroup("react-dom-vendor", "react-dom", 100),
            nodeModuleGroup("codemirror-react", "@uiw/react-codemirror", 90),
            nodeModuleGroup("codemirror-setup", "@uiw/codemirror-extensions-basic-setup", 90),
            nodeModuleGroup("codemirror-view", "@codemirror/view", 85),
            nodeModuleGroup("codemirror-state", "@codemirror/state", 85),
            nodeModuleGroup("codemirror-language", "@codemirror/language", 85),
            nodeModuleGroup("codemirror-markdown", "@codemirror/lang-markdown", 80),
            nodeModuleGroup("codemirror-autocomplete", "@codemirror/autocomplete", 75),
            nodeModuleGroup("codemirror-commands", "@codemirror/commands", 75),
            nodeModuleGroup("codemirror-search", "@codemirror/search", 75),
            nodeModuleGroup("codemirror-lint", "@codemirror/lint", 75),
            nodeModuleGroup("codemirror-theme", "@codemirror/theme-one-dark", 75),
            nodeModuleGroup("lezer", "@lezer", 70),
            nodeModuleGroup("dnd-kit", "@dnd-kit", 60),
            nodeModuleGroup("recharts", "recharts", 60),
          ],
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

#!/usr/bin/env node
// Dev-only startup script: loads .env.local and spawns the built server.
// The surrounding tsup watcher can outlive this child, so external process
// supervision must verify the owned listener and /health/backend rather than
// treating the watcher's PID as Backend readiness.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(appDir, ".env.local");

/**
 * The `NODE_ENV` this start gives the server when nothing set one: `development`.
 * This script only ever runs the local dev server, so the run is a development
 * environment, and code that is allowed only there, such as the support prompts'
 * always-show switch, works locally. A value from the shell or `.env.local` still
 * wins. Every other `NODE_ENV` read in the backend compares against `production`
 * alone, so naming the run changes nothing else.
 */
const DEVELOPMENT_ENV = "development";

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key) process.env[key] ??= val;
  }
}

process.env.NODE_ENV ??= DEVELOPMENT_ENV;

const server = spawn(process.execPath, ["dist/server.js"], {
  stdio: "inherit",
  cwd: dirname(fileURLToPath(import.meta.url)),
});

server.on("exit", (code) => process.exit(code ?? 0));

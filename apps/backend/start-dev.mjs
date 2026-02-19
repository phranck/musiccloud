#!/usr/bin/env node
// Dev-only startup script: loads .env.local and spawns the built server.
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envFile = resolve(root, ".env.local");

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key) process.env[key] ??= val;
  }
}

const server = spawn(process.execPath, ["dist/server.js"], {
  stdio: "inherit",
  cwd: dirname(fileURLToPath(import.meta.url)),
});

server.on("exit", (code) => process.exit(code ?? 0));

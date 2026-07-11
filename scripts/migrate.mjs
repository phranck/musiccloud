/**
 * Local entry point for the guarded backend Drizzle migration runner.
 *
 * Keeping this file as a thin launcher ensures `pnpm db:migrate` and the
 * deployed backend execute the same connection-role safety policy.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "pnpm",
  ["--dir", "apps/backend", "exec", "tsx", "src/db/migrate-cli.ts"],
  { cwd: projectRoot, env: process.env, stdio: "inherit" },
);

if (result.error) {
  console.error("Failed to launch the guarded migration runner:", result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}

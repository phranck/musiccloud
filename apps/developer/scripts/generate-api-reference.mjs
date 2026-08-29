import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const developerDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(developerDir, "../..");
const backendDir = path.join(repoRoot, "apps/backend");
const generatedDir = path.join(developerDir, "src/generated");

/**
 * Exports the public OpenAPI document the portal builds its API reference from.
 *
 * The exporter writes `openapi.json` and `openapi.metadata.json` into the
 * generated directory, which is git-ignored and rebuilt on every build.
 */
async function exportOpenApi() {
  await mkdir(generatedDir, { recursive: true });
  await execFileAsync(
    "pnpm",
    ["--dir", backendDir, "exec", "tsx", "src/scripts/export-public-openapi.ts", "--out-dir", generatedDir],
    {
      cwd: repoRoot,
      env: process.env,
      maxBuffer: 1024 * 1024 * 5,
    },
  );
}

await exportOpenApi().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

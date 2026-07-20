import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseSdkCatalog } from "../src/lib/sdk-catalog.ts";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const developerDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(developerDir, "../..");
const backendDir = path.join(repoRoot, "apps/backend");
const generatedDir = path.join(developerDir, "src/generated");
const catalogFileName = "sdk-catalog.json";

/**
 * Keeps generated inputs either fully written or not replaced. Zerops and local
 * builds can be interrupted, so the portal never reads a half-written catalog.
 */
async function writeAtomic(filePath, content) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath, content);
  await rename(tempPath, filePath);
}

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

async function readContractMetadata() {
  const raw = await readFile(path.join(generatedDir, "openapi.metadata.json"), "utf8");
  const metadata = JSON.parse(raw);
  if (!metadata || typeof metadata.version !== "string" || typeof metadata.sha256 !== "string") {
    throw new Error("Generated OpenAPI metadata is missing version or sha256.");
  }
  return { version: metadata.version, sha256: metadata.sha256 };
}

async function loadCatalog(contract) {
  const catalogFile = process.env.SDK_CATALOG_FILE;
  if (catalogFile) {
    return JSON.parse(await readFile(path.resolve(catalogFile), "utf8"));
  }

  // Production builds consume the versioned release asset; local development
  // can override it with SDK_CATALOG_URL, but validation remains mandatory.
  const catalogUrl =
    process.env.SDK_CATALOG_URL ??
    `https://github.com/phranck/musiccloud/releases/download/api-sdk-v${contract.version}/${catalogFileName}`;
  const response = await fetch(catalogUrl);
  if (!response.ok) {
    throw new Error(`Could not download SDK catalog from ${catalogUrl}: HTTP ${response.status}`);
  }
  return response.json();
}

async function main() {
  await exportOpenApi();
  const contract = await readContractMetadata();
  const catalog = parseSdkCatalog(await loadCatalog(contract), contract, {
    allowStaleContract: process.env.SDK_CATALOG_ALLOW_STALE_CONTRACT === "true",
  });
  await writeAtomic(path.join(generatedDir, catalogFileName), `${JSON.stringify(catalog, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { exportPublicOpenApiContract } from "../openapi/export-public-openapi.js";

function parseOutDir(argv: string[]): string {
  const index = argv.indexOf("--out-dir");
  const outDir = index >= 0 ? argv[index + 1] : undefined;
  if (!outDir) {
    throw new Error("Usage: tsx src/scripts/export-public-openapi.ts --out-dir <path>");
  }
  return outDir;
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath, content);
  await rename(tempPath, filePath);
}

async function main(): Promise<void> {
  const outDir = path.resolve(parseOutDir(process.argv.slice(2)));
  const exported = await exportPublicOpenApiContract();
  await mkdir(outDir, { recursive: true });

  await writeAtomic(path.join(outDir, "openapi.json"), exported.json);
  await writeAtomic(
    path.join(outDir, "openapi.metadata.json"),
    `${JSON.stringify(
      {
        version: exported.version,
        sha256: exported.sha256,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Exported public OpenAPI ${exported.version} (${exported.sha256})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(backendRoot, "src/services/plugins/registry.ts");
const docsRoot = path.join(backendRoot, "docs/adapters");

const registry = readFileSync(registryPath, "utf8");
const pluginBlock = /const PLUGINS:[\s\S]*?=\s*\[([\s\S]*?)\];/.exec(registry)?.[1];

if (!pluginBlock) {
  console.error("Could not find PLUGINS array in registry.ts");
  process.exit(1);
}

const pluginNames = [...pluginBlock.matchAll(/\b([a-zA-Z0-9]+Plugin)\b/g)].map((match) => match[1]);
const importPaths = new Map(
  [...registry.matchAll(/import \{ ([a-zA-Z0-9]+Plugin) \} from "\.\/([^"]+)\/index\.js";/g)].map((match) => [
    match[1],
    match[2],
  ]),
);

const errors = [];

for (const pluginName of pluginNames) {
  const serviceId = importPaths.get(pluginName);
  if (!serviceId) {
    errors.push(`No import path found for ${pluginName}`);
    continue;
  }

  const docPath = path.join(docsRoot, `${serviceId}.md`);
  if (!existsSync(docPath)) {
    errors.push(`Missing adapter runbook: apps/backend/docs/adapters/${serviceId}.md`);
    continue;
  }

  const content = readFileSync(docPath, "utf8");
  for (const required of ["Last reviewed:", "## Maintenance", "## Verification"]) {
    if (!content.includes(required)) {
      errors.push(`${serviceId}.md is missing required section marker: ${required}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Adapter runbooks OK (${pluginNames.length} registered plugins).`);

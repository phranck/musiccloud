import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SdkAdapterError } from "../orchestrator.mjs";

const execFileAsync = promisify(execFile);
const excludedTreeNames = new Set([
  ".build",
  ".git",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "node_modules",
  "vendor",
]);

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

export async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function commandFailure(error, command, args) {
  const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
  const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
  return new Error(
    [stderr, stdout, error instanceof Error ? error.message : String(error)].filter(Boolean).join("\n") ||
      `Command failed: ${command} ${args.join(" ")}`,
  );
}

export async function runCommand(stage, command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      maxBuffer: 1024 * 1024 * 100,
    });
    if (result.stdout?.trim()) console.log(result.stdout.trim());
    if (result.stderr?.trim()) console.error(result.stderr.trim());
    return result;
  } catch (error) {
    throw new SdkAdapterError(stage, commandFailure(error, command, args));
  }
}

export function assertAdapterTarget(target, language, adapterId) {
  if (target.language !== language || target.generator.id !== adapterId) {
    throw new SdkAdapterError(
      "manifest resolution",
      new Error(`Adapter ${adapterId} cannot generate ${target.language}/${target.generator.id}.`),
    );
  }
}

export function replaceOrVerify(source, search, replacement, stage, { all = false } = {}) {
  if (source.includes(search)) {
    return all ? source.replaceAll(search, replacement) : source.replace(search, replacement);
  }
  if (source.includes(replacement)) return source;
  throw new SdkAdapterError(
    stage,
    new Error(`Cannot apply deterministic replacement: expected source text is absent (${search}).`),
  );
}

export async function resetScratch(target) {
  const scratch = repoPath(target.output);
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  return scratch;
}

function copyFilter(source) {
  return !source.split(path.sep).some((segment) => excludedTreeNames.has(segment));
}

async function copyInput(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true, filter: copyFilter });
}

export async function assembleOwnedInputs(scratch, target, release) {
  const ownedRoot = path.join(scratch, ".musiccloud");
  await mkdir(ownedRoot, { recursive: true });
  await Promise.all([
    copyInput(repoPath(target.inputs.profile), path.join(ownedRoot, "language-profile.json")),
    copyInput(repoPath(target.inputs.matrix), path.join(ownedRoot, "generator-matrix.json")),
    copyInput(repoPath(target.inputs.publicSurface), path.join(ownedRoot, "public-surface.json")),
    copyInput(repoPath(target.inputs.operationProfiles), path.join(ownedRoot, "operation-profiles.json")),
    copyInput(repoPath(target.inputs.contractAdapter), path.join(ownedRoot, "contract-adapter.mjs")),
    copyInput(repoPath(target.inputs.goldenSnapshot), path.join(ownedRoot, "public-api.txt")),
    copyInput(repoPath(target.inputs.goldenUsage), path.join(ownedRoot, "usage")),
    copyInput(repoPath(target.inputs.errorContract), path.join(ownedRoot, "error-contract")),
  ]);
  const harnessPath = repoPath(path.join(target.inputs.harnessesRoot, target.language));
  if (await exists(harnessPath)) {
    await copyInput(harnessPath, path.join(ownedRoot, "harness"));
  }

  const inputRecord = {
    sdkVersion: release.sdkVersion,
    apiVersion: release.apiVersion,
    openApiSha256: release.openApiSha256,
    targetId: target.targetId,
    configurationRevision: target.configurationRevision,
    inputs: target.inputs,
  };
  await writeFile(path.join(ownedRoot, "inputs.json"), `${JSON.stringify(inputRecord, null, 2)}\n`);

  const currentReadme = (await exists(path.join(scratch, "README.md")))
    ? await readFile(path.join(scratch, "README.md"), "utf8")
    : `# musiccloud ${target.displayName} SDK\n`;
  await writeFile(
    path.join(scratch, "README.md"),
    `${currentReadme.trimEnd()}\n\n## musiccloud release candidate\n\nThis Preview candidate was generated from OpenAPI ${release.apiVersion} (${release.openApiSha256}) with ${target.generator.name} ${target.generator.version}. The approved public naming profile, golden usage, typed error contract, and exact generator inputs are stored under \`.musiccloud/\`. Generated internals are not a stable public API until the downstream conformance gates pass.\n`,
  );
  await writeFile(
    path.join(scratch, "THIRD_PARTY_NOTICES.md"),
    `# Third-party generator provenance\n\n- Generator: ${target.generator.name} ${target.generator.version}\n- License: ${target.generator.license}\n- Source: ${target.generator.source}\n- Artifact: ${target.generator.artifact.locator}\n- Digest: ${target.generator.artifact.digestAlgorithm}:${target.generator.artifact.digest}\n\nThe generator executable and its build caches are not included in this archive.\n`,
  );
}

export async function copyCandidate(scratch, candidateDir) {
  await rm(candidateDir, { recursive: true, force: true });
  await cp(scratch, candidateDir, { recursive: true, force: true, filter: copyFilter });
}

export async function copyFileInto(sourceRelative, destination) {
  await copyInput(repoPath(sourceRelative), destination);
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function findFiles(root, predicate) {
  const found = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && predicate(child)) found.push(child);
    }
  }
  if (await exists(root)) await visit(root);
  return found.toSorted();
}

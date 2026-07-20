import { execFile } from "node:child_process";
import crypto, { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { validateSdkGeneratorProfiles } from "../validate-sdk-generator-profiles.mjs";

const execFileAsync = promisify(execFile);
const ARCHIVE_TIMESTAMP = new Date("1980-01-01T00:00:00.000Z");
const ARCHIVE_EXCLUDED_DIRECTORIES = new Set([
  ".build",
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
const ARCHIVE_EXCLUDED_FILES = new Set([".coverage"]);

export class SdkAdapterError extends Error {
  constructor(stage, cause) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "SdkAdapterError";
    this.stage = stage;
  }
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function resolveManifestValue(value, placeholders) {
  if (typeof value === "string") {
    return Object.entries(placeholders).reduce(
      (resolved, [placeholder, replacement]) => resolved.replaceAll(placeholder, replacement),
      value,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveManifestValue(item, placeholders));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveManifestValue(item, placeholders)]),
    );
  }
  return value;
}

function selectedAdapterFor(profiles, language) {
  const entry = profiles.matrix.languages.find((candidate) => candidate.language === language);
  const selected = entry?.adapters.filter((adapter) => adapter.role === "selected") ?? [];
  if (selected.length !== 1) {
    throw new Error(`SDK release manifest requires exactly one selected ${language} adapter.`);
  }
  return selected[0];
}

/** Resolves every release fact once from the validated profile graph. */
export function resolveReleaseManifest(profiles) {
  validateSdkGeneratorProfiles(profiles);
  return {
    schemaVersion: 2,
    sdkVersion: profiles.manifest.release.sdkVersion,
    releaseTag: profiles.manifest.release.tag,
    atomic: profiles.manifest.release.atomic,
    publish: profiles.manifest.release.publish,
    apiVersion: profiles.manifest.contract.version,
    openApiSha256: profiles.manifest.contract.sha256,
    targets: profiles.manifest.targets.map((target) => {
      const generator = selectedAdapterFor(profiles, target.language);
      const languageProfile = profiles.languages[target.language];
      const configuration = resolveManifestValue(languageProfile.generator.config, {
        "<sdk-version>": profiles.manifest.release.sdkVersion,
      });
      return {
        ...target,
        generator,
        configuration,
        naming: languageProfile.naming,
        publicSurface: languageProfile.publicSurface,
        supportedPlatformRuntime: languageProfile.runtime,
        inputs: {
          profile: target.profile,
          matrix: profiles.manifest.inputs.matrix,
          publicSurface: profiles.manifest.inputs.surface,
          operationProfiles: profiles.manifest.inputs.operationProfiles,
          harnessesRoot: profiles.manifest.inputs.harnessesRoot,
          contractAdapter: profiles.manifest.inputs.contractAdapter,
          errorContract: target.errorContract,
          goldenSnapshot: target.goldenSnapshot,
          goldenUsage: target.goldenUsage,
        },
        configurationRevision: sha256(
          JSON.stringify({
            target,
            languageProfile,
            configuration,
            publicSurface: profiles.surface,
          }),
        ),
      };
    }),
  };
}

async function readFrozenContract(contractDir, release) {
  const [openApiBytes, metadataBytes] = await Promise.all([
    readFile(path.join(contractDir, "openapi.json")),
    readFile(path.join(contractDir, "openapi.metadata.json"), "utf8"),
  ]);
  const metadata = JSON.parse(metadataBytes);
  const actualSha256 = sha256(openApiBytes);
  if (metadata.version !== release.apiVersion || metadata.sha256 !== release.openApiSha256) {
    throw new Error("SDK release manifest does not match exported OpenAPI metadata.");
  }
  if (actualSha256 !== release.openApiSha256) {
    throw new Error("SDK release manifest fingerprint does not match openapi.json bytes.");
  }
  return {
    openApiPath: path.join(contractDir, "openapi.json"),
    version: metadata.version,
    sha256: actualSha256,
  };
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function collectArchiveFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory() && ARCHIVE_EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    if (entry.isFile() && ARCHIVE_EXCLUDED_FILES.has(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await collectArchiveFiles(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function normalizeArchiveTree(root, files) {
  const directories = new Set([root]);
  for (const relative of files) {
    const filePath = path.join(root, relative);
    await utimes(filePath, ARCHIVE_TIMESTAMP, ARCHIVE_TIMESTAMP);
    let directory = path.dirname(filePath);
    while (directory.startsWith(root)) {
      directories.add(directory);
      if (directory === root) break;
      directory = path.dirname(directory);
    }
  }
  for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
    await utimes(directory, ARCHIVE_TIMESTAMP, ARCHIVE_TIMESTAMP);
  }
}

async function createArchive(candidateDir, archivePath) {
  const files = await collectArchiveFiles(candidateDir);
  if (files.length === 0) throw new Error(`Cannot archive empty SDK candidate ${candidateDir}.`);
  await normalizeArchiveTree(candidateDir, files);
  await execFileAsync("zip", ["-X", "-q", archivePath, ...files], {
    cwd: candidateDir,
    maxBuffer: 1024 * 1024 * 10,
  });
  return sha256(await readFile(archivePath));
}

async function hashInputTree(root, relative = "") {
  const hash = crypto.createHash("sha256");
  async function visit(currentRelative) {
    const entries = await readdir(path.join(root, currentRelative), { withFileTypes: true });
    for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
      const child = path.join(currentRelative, entry.name);
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        hash.update(child.split(path.sep).join("/"));
        hash.update("\0");
        hash.update(await readFile(path.join(root, child)));
        hash.update("\0");
      }
    }
  }
  await visit(relative);
  return hash.digest("hex");
}

function targetManifest(release, target) {
  return {
    schemaVersion: 1,
    sdkVersion: release.sdkVersion,
    apiVersion: release.apiVersion,
    openApiSha256: release.openApiSha256,
    language: target.language,
    targetId: target.targetId,
    displayName: target.displayName,
    stability: target.stability,
    package: target.package,
    runtime: target.runtime,
    artifact: target.artifact,
    generator: target.generator,
    configuration: target.configuration,
    naming: target.naming,
    publicSurface: target.publicSurface,
    supportedPlatformRuntime: target.supportedPlatformRuntime,
    inputs: target.inputs,
    configurationRevision: target.configurationRevision,
    inputRevision: target.inputRevision,
    documentation: target.artifact.documentation,
    manpages: target.artifact.manpages,
  };
}

async function promoteStaging(stagingDir, outDir) {
  await mkdir(path.dirname(outDir), { recursive: true });
  const backupDir = `${outDir}.backup-${randomUUID()}`;
  const hadPreviousOutput = await pathExists(outDir);
  if (hadPreviousOutput) await rename(outDir, backupDir);
  try {
    await rename(stagingDir, outDir);
  } catch (error) {
    if (hadPreviousOutput && !(await pathExists(outDir))) await rename(backupDir, outDir);
    throw error;
  }
  if (hadPreviousOutput) await rm(backupDir, { recursive: true, force: true });
}

function wrapTargetError(target, error) {
  const stage = error instanceof SdkAdapterError ? error.stage : "generation";
  const cause = error instanceof Error ? error.message : String(error);
  return new Error(`SDK target ${target.language} (${target.generator.id}) failed during ${stage}: ${cause}`, {
    cause: error,
  });
}

async function generateTarget({ adapter, candidateDir, contract, release, target }) {
  if (adapter.language !== target.language) {
    throw new Error(`Adapter language ${adapter.language} does not match target ${target.language}.`);
  }
  await mkdir(candidateDir, { recursive: true });
  try {
    await adapter.generate({ candidateDir, contract, release, target });
    const resolvedTarget = {
      ...target,
      inputRevision: await hashInputTree(path.join(candidateDir, ".musiccloud")),
    };
    await writeFile(
      path.join(candidateDir, "sdk-target-manifest.json"),
      `${JSON.stringify(targetManifest(release, resolvedTarget), null, 2)}\n`,
    );
    return resolvedTarget;
  } catch (error) {
    throw wrapTargetError(target, error);
  }
}

function catalogAsset({ archiveName, archiveUrl, archiveSha256, release, target }) {
  return {
    language: target.language,
    displayName: target.displayName,
    stability: target.stability,
    package: target.package,
    runtime: target.runtime,
    generator: target.generator,
    configurationRevision: target.configurationRevision,
    inputRevision: target.inputRevision,
    archiveName,
    archiveUrl,
    sha256: archiveSha256,
    documentation: target.artifact.documentation,
    manpages: target.artifact.manpages,
    quickstart: Object.fromEntries(
      Object.entries(target.quickstart).map(([key, value]) => [key, value.replaceAll("<version>", release.sdkVersion)]),
    ),
  };
}

/** Runs either an atomic five-target release or an explicitly non-release diagnostic target. */
export async function runSdkRelease({
  contractDir,
  outDir,
  sourceSha,
  releaseBaseUrl,
  profiles,
  adapters,
  target: requestedLanguage,
}) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) {
    throw new Error("SDK release sourceSha must be a 40-character lowercase Git SHA.");
  }
  const release = resolveReleaseManifest(profiles);
  const contract = await readFrozenContract(contractDir, release);
  const selectedTargets = requestedLanguage
    ? release.targets.filter((target) => target.language === requestedLanguage)
    : release.targets;
  if (requestedLanguage && selectedTargets.length !== 1) {
    throw new Error(`Unknown SDK target: ${requestedLanguage}.`);
  }
  if (!requestedLanguage && selectedTargets.length !== 5) {
    throw new Error("Atomic SDK release requires exactly five targets.");
  }

  const stagingDir = `${outDir}.staging-${randomUUID()}`;
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(path.join(stagingDir, "generated"), { recursive: true });
  try {
    const generatedTargets = [];
    for (const target of selectedTargets) {
      const adapter = adapters.get(target.language);
      if (!adapter) throw new Error(`No SDK adapter registered for ${target.language}.`);
      generatedTargets.push(
        await generateTarget({
          adapter,
          candidateDir: path.join(stagingDir, "generated", target.language),
          contract,
          release,
          target,
        }),
      );
    }

    if (requestedLanguage) {
      const diagnostic = {
        mode: "diagnostic",
        sdkVersion: release.sdkVersion,
        apiVersion: release.apiVersion,
        openApiSha256: release.openApiSha256,
        sourceSha,
        target: targetManifest(release, generatedTargets[0]),
      };
      await writeFile(path.join(stagingDir, "sdk-diagnostic.json"), `${JSON.stringify(diagnostic, null, 2)}\n`);
      await promoteStaging(stagingDir, outDir);
      return diagnostic;
    }

    const resolvedReleaseBaseUrl =
      releaseBaseUrl ?? `https://github.com/phranck/musiccloud/releases/download/${release.releaseTag}`;
    const assets = [];
    for (const target of generatedTargets) {
      const archiveName = `${target.artifact.archiveBaseName}-${release.sdkVersion}.zip`;
      const archivePath = path.join(stagingDir, archiveName);
      const archiveSha256 = await createArchive(path.join(stagingDir, "generated", target.language), archivePath);
      assets.push(
        catalogAsset({
          archiveName,
          archiveUrl: `${resolvedReleaseBaseUrl}/${archiveName}`,
          archiveSha256,
          release,
          target,
        }),
      );
    }
    const catalog = {
      schemaVersion: 2,
      sdkVersion: release.sdkVersion,
      releaseTag: release.releaseTag,
      apiVersion: release.apiVersion,
      openApiSha256: release.openApiSha256,
      sourceSha,
      assets,
    };
    await writeFile(path.join(stagingDir, "sdk-catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
    await promoteStaging(stagingDir, outDir);
    return catalog;
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

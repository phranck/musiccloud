#!/usr/bin/env node
import crypto from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv from "ajv";

const LANGUAGES = ["typescript", "python", "swift", "php", "go"];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function schemaError(ajv, label) {
  return `${label} does not match its schema: ${ajv.errorsText(ajv.errors, { separator: "; " })}`;
}

/**
 * Loads the complete profile graph so callers validate one coherent snapshot
 * rather than independently parsing files that may disagree.
 */
export async function loadSdkGeneratorProfiles(
  profilesRoot = path.join(repoRoot, "sdk/generator-profiles"),
) {
  const schemaRoot = path.join(profilesRoot, "schema");
  const languageEntries = await Promise.all(
    LANGUAGES.map(async (language) => [
      language,
      await readJson(path.join(profilesRoot, "languages", `${language}.json`)),
    ]),
  );

  return {
    profilesRoot,
    schemas: {
      matrix: await readJson(path.join(schemaRoot, "generator-matrix.schema.json")),
      language: await readJson(path.join(schemaRoot, "language-profile.schema.json")),
      surface: await readJson(path.join(schemaRoot, "public-surface.schema.json")),
      manifest: await readJson(path.join(schemaRoot, "candidate-manifest.schema.json")),
    },
    matrix: await readJson(path.join(profilesRoot, "generator-matrix.json")),
    languages: Object.fromEntries(languageEntries),
    surface: await readJson(path.join(profilesRoot, "public-surface.json")),
    manifest: await readJson(path.join(profilesRoot, "candidate-manifest.json")),
    operationProfiles: await readJson(
      path.join(repoRoot, "apps/backend/src/docs/public-operation-profiles.json"),
    ),
  };
}

function assertEqualSets(actual, expected, message) {
  if (
    actual.length !== expected.length ||
    actual.toSorted().some((value, index) => value !== expected.toSorted()[index])
  ) {
    throw new Error(message);
  }
}

/**
 * Validates JSON Schemas plus the references and invariants that span files.
 * These cross-file rules are deliberately centralized because #89 consumes the
 * graph atomically.
 */
export function validateSdkGeneratorProfiles(profiles) {
  const ajv = new Ajv({ allErrors: true, strict: true, validateFormats: false });
  const validators = {
    matrix: ajv.compile(profiles.schemas.matrix),
    language: ajv.compile(profiles.schemas.language),
    surface: ajv.compile(profiles.schemas.surface),
    manifest: ajv.compile(profiles.schemas.manifest),
  };

  if (!validators.matrix(profiles.matrix)) {
    throw new Error(schemaError(ajv, "generator matrix"));
  }
  for (const language of LANGUAGES) {
    if (!validators.language(profiles.languages[language])) {
      throw new Error(schemaError(ajv, `language profile ${language}`));
    }
  }
  if (!validators.surface(profiles.surface)) {
    throw new Error(schemaError(ajv, "public surface"));
  }
  if (!validators.manifest(profiles.manifest)) {
    throw new Error(schemaError(ajv, "candidate manifest"));
  }

  assertEqualSets(
    profiles.matrix.languages.map((entry) => entry.language),
    LANGUAGES,
    "generator matrix must define the five approved languages exactly once.",
  );

  const selectedByLanguage = new Map();
  for (const entry of profiles.matrix.languages) {
    const selected = entry.adapters.filter((adapter) => adapter.role === "selected");
    if (selected.length !== 1) {
      throw new Error(`${entry.language} must define exactly one selected adapter.`);
    }
    const comparison = entry.adapters.filter((adapter) => adapter.role === "comparison");
    if (comparison.length !== 1 || comparison[0].id !== profiles.matrix.comparisonPolicy.adapter.id) {
      throw new Error(
        `${entry.language} must define exactly one isolated ${profiles.matrix.comparisonPolicy.adapter.id} comparison adapter.`,
      );
    }
    selectedByLanguage.set(entry.language, selected[0].id);
  }

  const canonical = profiles.operationProfiles.operations.map((operation) =>
    `${operation.method} ${operation.path} ${operation.operationId}`
  );
  const surface = profiles.surface.operations.map((operation) =>
    `${operation.method} ${operation.path} ${operation.operationId}`
  );
  assertEqualSets(
    surface,
    canonical,
    "public surface must cover every canonical operation exactly once.",
  );
  if (new Set(profiles.operationProfiles.operations.map((operation) => operation.operationId)).size !== canonical.length) {
    throw new Error("canonical operation IDs must be unique.");
  }

  for (const language of LANGUAGES) {
    const publicNames = profiles.surface.operations.map((operation) => operation.public[language]);
    if (new Set(publicNames).size !== publicNames.length) {
      throw new Error(`public surface contains duplicate ${language} names.`);
    }
    if (language === "swift" && publicNames.some((name) => /^get[A-Z]/.test(name))) {
      throw new Error("Swift public request methods must not use mechanical get prefixes.");
    }
    const profile = profiles.languages[language];
    if (profile.language !== language) {
      throw new Error(`language profile filename and language disagree for ${language}.`);
    }
    if (profile.generator.adapterId !== selectedByLanguage.get(language)) {
      throw new Error(`language profile ${language} does not reference its selected adapter.`);
    }
  }

  const targets = profiles.manifest.targets;
  if (targets.map((target) => target.language).join(",") !== LANGUAGES.join(",")) {
    throw new Error("candidate manifest targets must use canonical five-language order.");
  }
  for (const target of targets) {
    if (target.selectedAdapterId !== selectedByLanguage.get(target.language)) {
      throw new Error(`candidate manifest ${target.language} adapter does not match the matrix.`);
    }
    if (target.errorContract !== profiles.languages[target.language].errorContract.path) {
      throw new Error(`candidate manifest ${target.language} error contract does not match its profile.`);
    }
  }
  if (profiles.manifest.release.tag !== `sdk-v${profiles.manifest.release.sdkVersion}`) {
    throw new Error("candidate manifest tag must derive from the shared SDK version.");
  }

  return {
    languages: LANGUAGES,
    operationCount: canonical.length,
    contract: profiles.manifest.contract,
  };
}

async function validateFrozenContract(profiles, contractDir) {
  const [openApiBytes, metadata] = await Promise.all([
    readFile(path.join(contractDir, "openapi.json")),
    readJson(path.join(contractDir, "openapi.metadata.json")),
  ]);
  const openApi = JSON.parse(openApiBytes);
  const sha256 = crypto.createHash("sha256").update(openApiBytes).digest("hex");
  const expected = profiles.manifest.contract;

  if (metadata.version !== expected.version || metadata.sha256 !== expected.sha256) {
    throw new Error("candidate manifest contract does not match exported OpenAPI metadata.");
  }
  if (sha256 !== expected.sha256) {
    throw new Error("candidate manifest fingerprint does not match openapi.json bytes.");
  }

  const actualOperations = [];
  for (const [route, pathItem] of Object.entries(openApi.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = pathItem[method];
      if (!operation) continue;
      actualOperations.push(`${method.toUpperCase()} ${route} ${operation.operationId ?? ""}`);
    }
  }
  const canonical = profiles.operationProfiles.operations.map((operation) =>
    `${operation.method} ${operation.path} ${operation.operationId}`
  );
  assertEqualSets(
    actualOperations,
    canonical,
    "exported OpenAPI operations do not match the canonical operation profiles.",
  );
}

async function validateOwnedPaths(profiles) {
  await Promise.all(
    Object.values(profiles.manifest.inputs).map((inputPath) => access(path.join(repoRoot, inputPath))),
  );
  for (const target of profiles.manifest.targets) {
    await Promise.all([
      access(path.join(repoRoot, target.profile)),
      access(path.join(repoRoot, target.errorContract)),
      access(path.join(repoRoot, target.goldenSnapshot)),
      access(path.join(repoRoot, target.goldenUsage)),
    ]);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(`Missing value for ${key ?? "argument"}.`);
    args[key.slice(2)] = value;
  }
  return {
    profilesRoot: path.resolve(args["profiles-root"] ?? path.join(repoRoot, "sdk/generator-profiles")),
    contractDir: path.resolve(args["contract-dir"] ?? path.join(repoRoot, ".tmp/openapi")),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profiles = await loadSdkGeneratorProfiles(args.profilesRoot);
  const result = validateSdkGeneratorProfiles(profiles);
  await validateFrozenContract(profiles, args.contractDir);
  await validateOwnedPaths(profiles);
  console.log(
    `Validated ${result.languages.length} SDK generator profiles and ${result.operationCount} operations for OpenAPI ${result.contract.version} (${result.contract.sha256}).`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

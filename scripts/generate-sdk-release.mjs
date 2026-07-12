#!/usr/bin/env node
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GENERATOR_VERSION = "7.22.0";
const GENERATOR_IMAGE = `openapitools/openapi-generator-cli:v${GENERATOR_VERSION}`;
const FIXTURE_MODE = process.env.MUSICCLOUD_SDK_GENERATOR_FIXTURE === "true";

/** Local smoke-build directories that must never ship in downloadable SDKs. */
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
]);

/** Files created by local package managers or test tooling during smoke builds. */
const ARCHIVE_EXCLUDED_FILES = new Set([".coverage", "pnpm-lock.yaml"]);

const TARGETS = [
  {
    language: "typescript",
    generator: "typescript-fetch",
    additionalProperties:
      "npmName=@musiccloud/api-client,typescriptThreePlus=true,supportsES6=true,withoutRuntimeChecks=true",
    quickstart: {
      install: "npm install ./musiccloud-typescript-sdk-<version>.zip",
      import:
        "import { Configuration, ResolveApi } from '@musiccloud/api-client';\n\nconst api = new ResolveApi(\n  new Configuration({ apiKey: process.env.MUSICCLOUD_API_KEY }),\n);",
      firstRequest:
        "const result = await api.apiV1ResolvePost({\n  apiV1ResolvePostRequest: {\n    query: 'https://open.spotify.com/track/example',\n  },\n});\n\nconsole.log(result);",
    },
  },
  {
    language: "python",
    generator: "python",
    additionalProperties: "packageName=musiccloud_api_client,projectName=musiccloud-api-client",
    quickstart: {
      install: "pip install ./musiccloud-python-sdk-<version>.zip",
      import:
        "import os\nimport musiccloud_api_client\n\nconfiguration = musiccloud_api_client.Configuration()\nconfiguration.api_key['ApiKeyAuth'] = os.environ['MUSICCLOUD_API_KEY']",
      firstRequest:
        "with musiccloud_api_client.ApiClient(configuration) as client:\n    api = musiccloud_api_client.ResolveApi(client)\n    result = api.api_v1_resolve_post(\n        musiccloud_api_client.ApiV1ResolvePostRequest(\n            query='https://open.spotify.com/track/example',\n        ),\n    )\n    print(result)",
    },
  },
  {
    language: "swift",
    generator: "swift6",
    additionalProperties: "projectName=MusiccloudApiClient,responseAs=AsyncAwait,identifiableModels=false",
    quickstart: {
      install: "unzip musiccloud-swift-sdk-<version>.zip",
      import:
        "import Foundation\nimport MusiccloudApiClient\n\nenum ConfigurationError: LocalizedError {\n  case missingApiKey\n\n  var errorDescription: String? {\n    \"MUSICCLOUD_API_KEY is required.\"\n  }\n}\n\nfunc musiccloudApiKey() throws -> String {\n  guard\n    let apiKey = ProcessInfo.processInfo.environment[\"MUSICCLOUD_API_KEY\"],\n    !apiKey.isEmpty\n  else {\n    throw ConfigurationError.missingApiKey\n  }\n  return apiKey\n}\n\nlet configuration = MusiccloudApiClientAPIConfiguration(\n  customHeaders: [\"X-API-Key\": try musiccloudApiKey()]\n)",
      firstRequest:
        "let request = ApiV1ResolvePostRequest(\n  query: \"https://open.spotify.com/track/example\"\n)\nlet result = try await ResolveAPI.apiV1ResolvePost(\n  apiV1ResolvePostRequest: request,\n  apiConfiguration: configuration\n)\nprint(result)",
    },
  },
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(`Missing value for ${key ?? "argument"}.`);
    args[key.slice(2)] = value;
  }
  for (const required of ["contract-dir", "out-dir", "source-sha"]) {
    if (!args[required]) throw new Error(`Missing --${required}.`);
  }
  return {
    contractDir: path.resolve(args["contract-dir"]),
    outDir: path.resolve(args["out-dir"]),
    sourceSha: args["source-sha"],
    releaseBaseUrl: args["release-base-url"],
  };
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function readContract(contractDir) {
  const openApiPath = path.join(contractDir, "openapi.json");
  const metadataPath = path.join(contractDir, "openapi.metadata.json");
  const [openApiBytes, metadataBytes] = await Promise.all([readFile(openApiPath), readFile(metadataPath, "utf8")]);
  const metadata = JSON.parse(metadataBytes);
  const actualSha256 = sha256Bytes(openApiBytes);
  if (!/^\d+\.\d+\.\d+$/.test(metadata.version ?? "")) {
    throw new Error("SDK generation failed: OpenAPI metadata version must be semver.");
  }
  if (metadata.sha256 !== actualSha256) {
    throw new Error("SDK generation failed: OpenAPI metadata sha256 does not match openapi.json.");
  }
  return {
    openApiPath,
    version: metadata.version,
    sha256: actualSha256,
  };
}

async function writeAtomic(filePath, content) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath, content);
  await rename(tempPath, filePath);
}

async function run(command, args, options = {}) {
  try {
    await execFileAsync(command, args, {
      maxBuffer: 1024 * 1024 * 20,
      ...options,
    });
  } catch (error) {
    const stderr = error?.stderr ? `\n${error.stderr}` : "";
    const stdout = error?.stdout ? `\n${error.stdout}` : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}${stdout}${stderr}`);
  }
}

async function generateWithDocker(contractDir, generatedRoot, target) {
  // Keep bind-mounted output writable by the Node process that adds metadata and archives it.
  const dockerUser = `${process.getuid()}:${process.getgid()}`;
  await run("docker", [
    "run",
    "--rm",
    "--user",
    dockerUser,
    "-v",
    `${contractDir}:/local/contract:ro`,
    "-v",
    `${generatedRoot}:/local/generated`,
    GENERATOR_IMAGE,
    "generate",
    "-i",
    "/local/contract/openapi.json",
    "-g",
    target.generator,
    "-o",
    `/local/generated/${target.language}`,
    "--additional-properties",
    target.additionalProperties,
  ]);
}

async function generateFixtureSdk(generatedRoot, target) {
  const dir = path.join(generatedRoot, target.language);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "README.md"),
    `# musiccloud ${target.language} SDK fixture\n\nGenerated by ${target.generator} fixture mode.\n`,
  );
  await writeFile(path.join(dir, "generator-config.json"), `${JSON.stringify(target, null, 2)}\n`);
  if (target.language === "swift") {
    await writeFile(
      path.join(dir, "Package.swift"),
      "// swift-tools-version:6.0\n\nimport PackageDescription\n\nlet package = Package(name: \"MusiccloudApiClient\", swiftLanguageModes: [.v6])\n",
    );
  }
}

async function writeGeneratorConfig(generatedRoot, target) {
  await writeFile(
    path.join(generatedRoot, target.language, "musiccloud-generator-config.json"),
    `${JSON.stringify(
      {
        generatorVersion: GENERATOR_VERSION,
        image: GENERATOR_IMAGE,
        language: target.language,
        generator: target.generator,
        additionalProperties: target.additionalProperties,
      },
      null,
      2,
    )}\n`,
  );
}

async function smokeBuild(generatedRoot, target) {
  if (FIXTURE_MODE) return;
  const cwd = path.join(generatedRoot, target.language);
  if (target.language === "typescript") {
    await run("pnpm", ["install", "--ignore-scripts", "--frozen-lockfile=false"], { cwd });
    await run("pnpm", ["run", "build"], { cwd });
    return;
  }
  if (target.language === "python") {
    await run("python3", ["-m", "venv", ".venv"], { cwd });
    const python = path.join(cwd, ".venv/bin/python");
    await run(python, ["-m", "pip", "install", "."], { cwd });
    await run(python, ["-c", "import musiccloud_api_client"], { cwd });
    return;
  }
  if (target.language === "swift") {
    await run("swift", ["build"], { cwd });
  }
}

async function normalizeMtimes(dir) {
  const fixed = new Date("2020-01-01T00:00:00.000Z");
  async function visit(entry) {
    const info = await stat(entry);
    if (info.isDirectory()) {
      const children = await readdir(entry);
      for (const child of children) await visit(path.join(entry, child));
    }
    await utimes(entry, fixed, fixed);
  }
  await visit(dir);
}

/**
 * Removes local build caches before deterministic timestamp normalization.
 * Generated package outputs such as TypeScript `dist` remain part of the SDK.
 */
async function pruneArchiveTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (ARCHIVE_EXCLUDED_DIRECTORIES.has(entry.name)) {
          await rm(entryPath, { recursive: true, force: true });
          return;
        }
        await pruneArchiveTree(entryPath);
        return;
      }
      if (ARCHIVE_EXCLUDED_FILES.has(entry.name) || /\.py[co]$/.test(entry.name)) {
        await rm(entryPath, { force: true });
      }
    }),
  );
}

async function archiveSdk(sourceDir, outDir, archiveName) {
  await pruneArchiveTree(sourceDir);
  await normalizeMtimes(sourceDir);
  const archivePath = path.join(outDir, archiveName);
  await rm(archivePath, { force: true });

  // `zip -X` strips extra file attributes; the sorted file list and normalized
  // mtimes keep archives stable across repeated CI runs. The `find` exclusions
  // repeat the prune policy so files created concurrently cannot leak in.
  const excludedDirectories = [...ARCHIVE_EXCLUDED_DIRECTORIES]
    .map((directory) => `! -path '*/${directory}/*'`)
    .join(" ");
  const excludedFiles = [...ARCHIVE_EXCLUDED_FILES].map((file) => `! -name '${file}'`).join(" ");
  await run(
    "sh",
    [
      "-c",
      `find . -type f ${excludedDirectories} ${excludedFiles} ! -name '*.pyc' ! -name '*.pyo' | LC_ALL=C sort | zip -X -q "${archivePath}" -@`,
    ],
    { cwd: sourceDir },
  );
  return {
    archivePath,
    sha256: sha256Bytes(await readFile(archivePath)),
  };
}

function buildCatalogAsset(target, version, releaseBaseUrl, archiveName, sha256) {
  return {
    language: target.language,
    generator: target.generator,
    archiveName,
    archiveUrl: `${releaseBaseUrl.replace(/\/$/, "")}/${archiveName}`,
    sha256,
    quickstart: {
      install: target.quickstart.install.replace("<version>", version),
      import: target.quickstart.import,
      firstRequest: target.quickstart.firstRequest,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(args.sourceSha)) {
    throw new Error("SDK generation failed: --source-sha must be a 40- or 64-character lowercase hex SHA.");
  }

  const contract = await readContract(args.contractDir);
  const releaseBaseUrl =
    args.releaseBaseUrl ?? `https://github.com/phranck/musiccloud/releases/download/api-sdk-v${contract.version}`;
  const generatedRoot = path.join(args.outDir, "generated");
  await rm(args.outDir, { recursive: true, force: true });
  await mkdir(generatedRoot, { recursive: true });

  const assets = [];
  for (const target of TARGETS) {
    if (FIXTURE_MODE) {
      await generateFixtureSdk(generatedRoot, target);
    } else {
      await generateWithDocker(args.contractDir, generatedRoot, target);
    }
    await writeGeneratorConfig(generatedRoot, target);
    await smokeBuild(generatedRoot, target);

    const archiveName = `musiccloud-${target.language}-sdk-${contract.version}.zip`;
    const archive = await archiveSdk(path.join(generatedRoot, target.language), args.outDir, archiveName);
    assets.push(buildCatalogAsset(target, contract.version, releaseBaseUrl, archiveName, archive.sha256));
  }

  if (assets.length !== TARGETS.length) {
    throw new Error("SDK generation failed: a required SDK target is missing.");
  }

  const catalog = {
    apiVersion: contract.version,
    openApiSha256: contract.sha256,
    sourceSha: args.sourceSha,
    generatorVersion: GENERATOR_VERSION,
    assets,
  };
  await writeAtomic(path.join(args.outDir, "sdk-catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Generated SDK release artifacts for API ${contract.version} (${contract.sha256})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

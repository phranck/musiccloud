#!/usr/bin/env node
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const GENERATOR_VERSION = "7.22.0";
const GENERATOR_IMAGE = `openapitools/openapi-generator-cli:v${GENERATOR_VERSION}`;
const FIXTURE_MODE = process.env.MUSICCLOUD_SDK_GENERATOR_FIXTURE === "true";
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ERROR_CONTRACT_ROOT = path.join(REPOSITORY_ROOT, "sdk/error-contract");

const ERROR_HANDLING_DOCS = {
  typescript: `## Typed error handling

\`MusiccloudApiError\` preserves the public code, safe message, error ID, HTTP status, context, and retry metadata. \`MusiccloudProtocolError\` and \`MusiccloudTransportError\` remain separate failure types.

\`\`\`ts
import { MusiccloudApiError, MusiccloudErrorCode } from "@musiccloud/api-client";

try {
  await api.resolve({ resolveRequest: request });
} catch (error) {
  if (error instanceof MusiccloudApiError) {
    if (error.code === MusiccloudErrorCode.rateLimited) {
      console.warn(error.retryAfterSeconds, error.errorId);
    } else {
      console.error(\`Unhandled \${error.code}; report \${error.errorId}\`);
    }
  }
}
\`\`\`
`,
  python: `## Typed error handling

\`MusiccloudApiError\` preserves the public code, safe message, error ID, HTTP status, context, and retry metadata. \`MusiccloudProtocolError\` and \`MusiccloudTransportError\` remain separate failure types.

\`\`\`python
from musiccloud_api_client import MusiccloudApiError, MusiccloudErrorCode

try:
    api.resolve(resolve_request)
except MusiccloudApiError as error:
    if error.code == MusiccloudErrorCode.RATE_LIMITED:
        print(error.retry_after_seconds, error.error_id)
    else:
        print(f"Unhandled {error.code}; report {error.error_id}")
\`\`\`
`,
  swift: `## Typed error handling

Generated calls throw \`MusiccloudError.api\`, \`.protocolFailure\`, or \`.transportFailure\`. API errors preserve the public code, safe message, error ID, HTTP status, context, and retry metadata.

\`\`\`swift
import MusiccloudApiClient

do {
    _ = try await ResolveAPI.resolve(resolveRequest: request)
} catch MusiccloudError.api(let error) {
    if error.code == MusiccloudErrorCode.rateLimited {
        print(error.retryAfterSeconds as Any, error.errorId)
    } else {
        print("Unhandled \\(error.code); report \\(error.errorId)")
    }
}
\`\`\`
`,
};

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
        "const result = await api.resolve({\n  resolveRequest: {\n    query: 'https://open.spotify.com/track/example',\n  },\n});\n\nconsole.log(result);",
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
        "with musiccloud_api_client.ApiClient(configuration) as client:\n    api = musiccloud_api_client.ResolveApi(client)\n    result = api.resolve(\n        musiccloud_api_client.ResolveRequest(\n            query='https://open.spotify.com/track/example',\n        ),\n    )\n    print(result)",
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
        "let request = ResolveRequest(\n  query: \"https://open.spotify.com/track/example\"\n)\nlet result = try await ResolveAPI.resolve(\n  resolveRequest: request,\n  apiConfiguration: configuration\n)\nprint(result)",
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
  if (target.language === "typescript") {
    const modelsDir = path.join(dir, "src/models");
    await mkdir(modelsDir, { recursive: true });
    await writeFile(
      path.join(modelsDir, "index.ts"),
      "export interface FixtureNullableModel {\n  alwaysNull: Null;\n}\n",
    );
    await writeFile(path.join(dir, "src/index.ts"), "export * from './runtime';\nexport * from './models/index';\n");
    await writeFile(
      path.join(dir, "src/runtime.ts"),
      "export async function fixtureRequest(response: Response): Promise<Response> {\n" +
        "  throw new ResponseError(response, 'Response returned an error code');\n" +
        "}\n\n" +
        "export function fixtureFetch(e: Error): never {\n" +
        "  throw new FetchError(e, 'The request failed and the interceptors did not return an alternative response');\n" +
        "}\n\n" +
        "export class ResponseError extends Error { constructor(public response: Response, message: string) { super(message); } }\n" +
        "export class FetchError extends Error { constructor(public cause: Error, message: string) { super(message); } }\n",
    );
  }
  if (target.language === "python") {
    const packageDir = path.join(dir, "musiccloud_api_client");
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, "__init__.py"), '__all__ = ["ApiClient"]\n');
    await writeFile(
      path.join(packageDir, "api_client.py"),
      "class ApiException(Exception):\n" +
        "    @classmethod\n" +
        "    def from_response(cls, **kwargs):\n" +
        "        return cls()\n\n" +
        "def deserialize_error(response_data, response_text, return_data):\n" +
        "    if not 200 <= response_data.status <= 299:\n" +
        "        raise ApiException.from_response(\n" +
        "            http_resp=response_data,\n" +
        "            body=response_text,\n" +
        "            data=return_data,\n" +
        "        )\n",
    );
    await writeFile(
      path.join(packageDir, "rest.py"),
      "import urllib3\n\n" +
        "class ApiException(Exception):\n" +
        "    pass\n\n" +
        "class RESTResponse:\n" +
        "    def __init__(self, response):\n" +
        "        self.response = response\n" +
        "        self.data = None\n\n" +
        "    def read(self):\n" +
        "        if self.data is None:\n" +
        "            self.data = self.response.data\n" +
        "        return self.data\n\n" +
        "def request(pool_manager):\n" +
        "    try:\n" +
        "        return pool_manager.request()\n" +
        "    except urllib3.exceptions.SSLError as e:\n" +
        "            msg = \"\\n\".join([type(e).__name__, str(e)])\n" +
        "            raise ApiException(status=0, reason=msg)\n",
    );
  }
  if (target.language === "swift") {
    await writeFile(
      path.join(dir, "Package.swift"),
      "// swift-tools-version:6.0\n\nimport PackageDescription\n\nlet package = Package(name: \"MusiccloudApiClient\", swiftLanguageModes: [.v6])\n",
    );
    const infrastructureDir = path.join(dir, "Sources/MusiccloudApiClient/Infrastructure");
    await mkdir(infrastructureDir, { recursive: true });
    await writeFile(
      path.join(infrastructureDir, "Models.swift"),
      "import Foundation\n\npublic enum ErrorResponse: Error, Sendable {\n    case error(Int, Data?, URLResponse?, Error)\n}\n",
    );
    await writeFile(
      path.join(infrastructureDir, "URLSessionImplementations.swift"),
      "import Foundation\n#if !os(macOS)\nimport MobileCoreServices\n#endif\n\nfunc mimeType(for pathExtension: String) -> String {\n        if #available(macOS 11.0, iOS 14.0, tvOS 14.0, watchOS 7.0, *) {\n            return \"application/octet-stream\"\n        } else {\n            if let uti = UTTypeCreatePreferredIdentifierForTag(kUTTagClassFilenameExtension, pathExtension as NSString, nil)?.takeRetainedValue(),\n                    let mimetype = UTTypeCopyPreferredTagWithClass(uti, kUTTagClassMIMEType)?.takeRetainedValue() {\n                return mimetype as String\n            }\n            return \"application/octet-stream\"\n        }\n}\n",
    );
  }
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`SDK error integration failed: generator output changed (${label}).`);
  }
  return source.replace(search, replacement);
}

async function installTypeScriptErrorRuntime(generatedRoot, target) {
  if (target.language !== "typescript") return;
  const sourceDir = path.join(generatedRoot, target.language, "src");
  await copyFile(
    path.join(ERROR_CONTRACT_ROOT, "typescript/musiccloud-errors.ts"),
    path.join(sourceDir, "musiccloud-errors.ts"),
  );

  const runtimePath = path.join(sourceDir, "runtime.ts");
  const runtime = await readFile(runtimePath, "utf8");
  const importLine =
    'import { classifyMusiccloudTransportError, musiccloudErrorFromResponse } from "./musiccloud-errors";\n';
  const withHttpErrors = replaceRequired(
    runtime,
    "throw new ResponseError(response, 'Response returned an error code');",
    "throw await musiccloudErrorFromResponse(response);",
    "typescript HTTP response",
  );
  const withTransportErrors = replaceRequired(
    withHttpErrors,
    "throw new FetchError(e, 'The request failed and the interceptors did not return an alternative response');",
    "throw classifyMusiccloudTransportError(e);",
    "typescript transport response",
  );
  await writeFile(runtimePath, `${importLine}${withTransportErrors}`);

  const indexPath = path.join(sourceDir, "index.ts");
  const index = await readFile(indexPath, "utf8");
  await writeFile(indexPath, `${index.trimEnd()}\nexport * from './musiccloud-errors';\n`);
}

async function installPythonErrorRuntime(generatedRoot, target) {
  if (target.language !== "python") return;
  const packageDir = path.join(generatedRoot, target.language, "musiccloud_api_client");
  await copyFile(
    path.join(ERROR_CONTRACT_ROOT, "python/musiccloud_errors.py"),
    path.join(packageDir, "musiccloud_errors.py"),
  );

  const apiClientPath = path.join(packageDir, "api_client.py");
  const apiClient = await readFile(apiClientPath, "utf8");
  const generatedRaise =
    "raise ApiException.from_response(\n" +
    "                    http_resp=response_data,\n" +
    "                    body=response_text,\n" +
    "                    data=return_data,\n" +
    "                )";
  const fixtureRaise =
    "raise ApiException.from_response(\n" +
    "            http_resp=response_data,\n" +
    "            body=response_text,\n" +
    "            data=return_data,\n" +
    "        )";
  const replacement =
    "raise parse_musiccloud_error_response(\n" +
    "                    response_data.status,\n" +
    "                    response_data.headers,\n" +
    "                    response_data.data.decode(\"utf-8\", errors=\"replace\"),\n" +
    "                )";
  const matchedRaise = apiClient.includes(generatedRaise) ? generatedRaise : fixtureRaise;
  const withTypedRaise = replaceRequired(apiClient, matchedRaise, replacement, "python HTTP response");
  await writeFile(
    apiClientPath,
    `from musiccloud_api_client.musiccloud_errors import parse_musiccloud_error_response\n${withTypedRaise}`,
  );

  const restPath = path.join(packageDir, "rest.py");
  const rest = await readFile(restPath, "utf8");
  const generatedTransport =
    "except urllib3.exceptions.SSLError as e:\n" +
    "            msg = \"\\n\".join([type(e).__name__, str(e)])\n" +
    "            raise ApiException(status=0, reason=msg)";
  const withTransport = replaceRequired(
    rest,
    generatedTransport,
    "except urllib3.exceptions.HTTPError as e:\n            raise classify_musiccloud_transport_error(e) from None",
    "python transport response",
  );
  const generatedRead =
    "    def read(self):\n" +
    "        if self.data is None:\n" +
    "            self.data = self.response.data\n" +
    "        return self.data";
  const typedRead =
    "    def read(self):\n" +
    "        try:\n" +
    "            if self.data is None:\n" +
    "                self.data = self.response.data\n" +
    "            return self.data\n" +
    "        except Exception as e:\n" +
    "            raise classify_musiccloud_transport_error(e) from None";
  const withReadTransport = replaceRequired(
    withTransport,
    generatedRead,
    typedRead,
    "python response body transport",
  );
  await writeFile(
    restPath,
    `from musiccloud_api_client.musiccloud_errors import classify_musiccloud_transport_error\n${withReadTransport}`,
  );

  const initPath = path.join(packageDir, "__init__.py");
  const init = await readFile(initPath, "utf8");
  await writeFile(
    initPath,
    `${init.trimEnd()}\n\nfrom musiccloud_api_client.musiccloud_errors import (\n` +
      "    MusiccloudApiError,\n" +
      "    MusiccloudErrorCode,\n" +
      "    MusiccloudProtocolError,\n" +
      "    MusiccloudTransportError,\n" +
      ")\n" +
      '__all__.extend(["MusiccloudApiError", "MusiccloudErrorCode", "MusiccloudProtocolError", "MusiccloudTransportError"])\n',
  );
}

async function installSwiftErrorRuntime(generatedRoot, target) {
  if (target.language !== "swift") return;
  const infrastructureDir = path.join(generatedRoot, target.language, "Sources/MusiccloudApiClient/Infrastructure");
  await copyFile(
    path.join(ERROR_CONTRACT_ROOT, "swift/Sources/MusiccloudErrors/MusiccloudErrors.swift"),
    path.join(infrastructureDir, "MusiccloudErrors.swift"),
  );

  const modelsPath = path.join(infrastructureDir, "Models.swift");
  const models = await readFile(modelsPath, "utf8");
  const generatedError = "public enum ErrorResponse: Error, Sendable {\n    case error(Int, Data?, URLResponse?, Error)\n}";
  const patchedModels = replaceRequired(
    models,
    generatedError,
    "public typealias ErrorResponse = MusiccloudError",
    "swift error response",
  );
  await writeFile(modelsPath, patchedModels);
}

async function installErrorRuntime(generatedRoot, target) {
  await installTypeScriptErrorRuntime(generatedRoot, target);
  await installPythonErrorRuntime(generatedRoot, target);
  await installSwiftErrorRuntime(generatedRoot, target);
}

async function appendErrorHandlingDocs(generatedRoot, target) {
  const readmePath = path.join(generatedRoot, target.language, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(readmePath, `${readme.trimEnd()}\n\n${ERROR_HANDLING_DOCS[target.language]}`);
}

/**
 * OpenAPI Generator v7.22.0 renders OpenAPI's valid `type: null` as a
 * non-existent `Null` TypeScript identifier. Restrict the compatibility patch
 * to generated property types so a null-only response field stays `null`.
 */
async function patchTypeScriptNullLiterals(generatedRoot, target) {
  if (target.language !== "typescript") return;

  const modelsPath = path.join(generatedRoot, target.language, "src/models/index.ts");
  let source;
  try {
    source = await readFile(modelsPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  const patchedSource = source.replace(/:\s*Null;/g, ": null;");
  if (patchedSource !== source) await writeFile(modelsPath, patchedSource);
}

async function patchSwiftLinuxCompatibility(generatedRoot, target) {
  if (target.language !== "swift") return;

  const implementationPath = path.join(
    generatedRoot,
    target.language,
    "Sources/MusiccloudApiClient/Infrastructure/URLSessionImplementations.swift",
  );
  const source = await readFile(implementationPath, "utf8");
  const legacyImportGuard = "#if !os(macOS)\nimport MobileCoreServices\n#endif";
  const foundationNetworkingImport = "#if canImport(FoundationNetworking)\nimport FoundationNetworking\n#endif";
  const legacyMimeTypeFallback =
    "        } else {\n            if let uti = UTTypeCreatePreferredIdentifierForTag(kUTTagClassFilenameExtension, pathExtension as NSString, nil)?.takeRetainedValue(),\n                    let mimetype = UTTypeCopyPreferredTagWithClass(uti, kUTTagClassMIMEType)?.takeRetainedValue() {\n                return mimetype as String\n            }\n            return \"application/octet-stream\"\n        }";
  const portableMimeTypeFallback =
    "        } else {\n            #if canImport(MobileCoreServices)\n            if let uti = UTTypeCreatePreferredIdentifierForTag(kUTTagClassFilenameExtension, pathExtension as NSString, nil)?.takeRetainedValue(),\n                    let mimetype = UTTypeCopyPreferredTagWithClass(uti, kUTTagClassMIMEType)?.takeRetainedValue() {\n                return mimetype as String\n            }\n            return \"application/octet-stream\"\n            #else\n            return \"application/octet-stream\"\n            #endif\n        }";

  // OpenAPI Generator v7.22.0 treats Linux as non-macOS and omits FoundationNetworking here.
  const mobileCoreServicesGuard = "#if canImport(MobileCoreServices)\nimport MobileCoreServices\n#endif";
  const withPortableMobileCoreServices = source.replace(legacyImportGuard, mobileCoreServicesGuard);
  const withFoundationNetworking = withPortableMobileCoreServices.includes(foundationNetworkingImport)
    ? withPortableMobileCoreServices
    : withPortableMobileCoreServices.replace("import Foundation\n", `import Foundation\n${foundationNetworkingImport}\n`);
  const patchedSource = withFoundationNetworking.replace(legacyMimeTypeFallback, portableMimeTypeFallback);

  if (patchedSource !== source) await writeFile(implementationPath, patchedSource);
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
    await patchTypeScriptNullLiterals(generatedRoot, target);
    await patchSwiftLinuxCompatibility(generatedRoot, target);
    await installErrorRuntime(generatedRoot, target);
    await appendErrorHandlingDocs(generatedRoot, target);
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

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const fixturePath = path.join(repoRoot, "scripts/fixtures/openapi-sdk-fixture.json");

test("runs Docker generation with the invoking host ownership", async () => {
  const generator = await readFile(path.join(repoRoot, "scripts/generate-sdk-release.mjs"), "utf8");

  assert.match(generator, /const dockerUser = `\$\{process\.getuid\(\)\}:\$\{process\.getgid\(\)\}`;/);
  assert.match(generator, /"--user",\s*dockerUser,/);
});

test("keeps shared typed-error examples aligned with generated method names", async () => {
  const readme = await readFile(path.join(repoRoot, "sdk/error-contract/README.md"), "utf8");

  assert.match(readme, /api\.resolve\(\{ resolveRequest: request \}\)/);
  assert.match(readme, /api\.resolve\(resolve_request\)/);
  assert.match(readme, /ResolveAPI\.resolve\(resolveRequest: request\)/);
  assert.doesNotMatch(readme, /apiV1ResolvePost|api_v1_resolve_post/);
});

test("generates a release catalog and archives for every SDK target", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "musiccloud-sdk-release-"));
  const contractDir = path.join(tempRoot, "contract");
  const outputDir = path.join(tempRoot, "sdk");
  const fixtureBin = path.join(tempRoot, "bin");
  await mkdir(contractDir, { recursive: true });
  await mkdir(fixtureBin, { recursive: true });

  const systemFind = spawnSync("which", ["find"], { encoding: "utf8" }).stdout.trim();
  const findWrapper = path.join(fixtureBin, "find");
  await writeFile(
    findWrapper,
    `#!/bin/sh
mkdir -p .build/cache .venv/bin node_modules/example package/__pycache__ .pytest_cache
printf cache > .build/cache/module.bin
printf python > .venv/bin/python
printf module > node_modules/example/index.js
printf bytecode > package/__pycache__/module.pyc
printf pytest > .pytest_cache/state
printf lock > pnpm-lock.yaml
exec "${systemFind}" "$@"
`,
  );
  await chmod(findWrapper, 0o755);

  const openApiJson = await readFile(fixturePath, "utf8");
  const sha256 = crypto.createHash("sha256").update(openApiJson).digest("hex");
  await writeFile(path.join(contractDir, "openapi.json"), openApiJson);
  await writeFile(path.join(contractDir, "openapi.metadata.json"), `${JSON.stringify({ version: "2.1.0", sha256 })}\n`);

  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts/generate-sdk-release.mjs"),
      "--contract-dir",
      contractDir,
      "--out-dir",
      outputDir,
      "--source-sha",
      "0123456789abcdef0123456789abcdef01234567",
      "--release-base-url",
      "https://github.com/phranck/musiccloud/releases/download/api-sdk-v2.1.0",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${fixtureBin}:${process.env.PATH}`,
        MUSICCLOUD_SDK_GENERATOR_FIXTURE: "true",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const catalog = JSON.parse(await readFile(path.join(outputDir, "sdk-catalog.json"), "utf8"));

  assert.deepEqual(
    catalog.assets.map((asset) => asset.language),
    ["typescript", "python", "swift"],
  );
  assert.equal(catalog.openApiSha256, sha256);
  for (const asset of catalog.assets) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    const archivePath = path.join(outputDir, asset.archiveName);
    assert.ok(existsSync(archivePath), `${asset.archiveName} should exist`);
    const archiveEntries = spawnSync("unzip", ["-Z1", archivePath], { encoding: "utf8" });
    assert.equal(archiveEntries.status, 0, archiveEntries.stderr || archiveEntries.stdout);
    assert.doesNotMatch(
      archiveEntries.stdout,
      /(^|\/)(?:\.build|\.venv|node_modules|__pycache__|\.pytest_cache)(?:\/|$)|(^|\/)pnpm-lock\.yaml$/m,
    );
  }

  const swift = catalog.assets.find((asset) => asset.language === "swift");
  assert.equal(swift.generator, "swift6");
  assert.doesNotMatch(swift.quickstart.import, /(?:\]|\)|[A-Za-z0-9_])!/);
  assert.match(swift.quickstart.import, /ConfigurationError\.missingApiKey/);
  assert.match(swift.quickstart.import, /guard\s+let apiKey/);
  assert.match(swift.quickstart.import, /MusiccloudApiClientAPIConfiguration/);
  assert.match(swift.quickstart.firstRequest, /apiConfiguration:\s*configuration/);

  const swiftPackage = await readFile(path.join(outputDir, "generated/swift/Package.swift"), "utf8");
  assert.match(swiftPackage, /swift-tools-version:6\.0/);
  assert.match(swiftPackage, /swiftLanguageModes:\s*\[\.v6\]/);

  const swiftUrlSession = await readFile(
    path.join(outputDir, "generated/swift/Sources/MusiccloudApiClient/Infrastructure/URLSessionImplementations.swift"),
    "utf8",
  );
  assert.doesNotMatch(swiftUrlSession, /#if !os\(macOS\)\nimport MobileCoreServices/);
  assert.match(swiftUrlSession, /#if canImport\(MobileCoreServices\)\nimport MobileCoreServices/);
  assert.match(swiftUrlSession, /#if canImport\(FoundationNetworking\)\nimport FoundationNetworking/);
  assert.match(swiftUrlSession, /#if canImport\(MobileCoreServices\)\n\s*if let uti/);

  const typescriptModels = await readFile(path.join(outputDir, "generated/typescript/src/models/index.ts"), "utf8");
  assert.doesNotMatch(typescriptModels, /:\s*Null;/);
  assert.match(typescriptModels, /alwaysNull:\s*null;/);

  const typescriptErrors = await readFile(
    path.join(outputDir, "generated/typescript/src/musiccloud-errors.ts"),
    "utf8",
  );
  const typescriptRuntime = await readFile(path.join(outputDir, "generated/typescript/src/runtime.ts"), "utf8");
  const typescriptIndex = await readFile(path.join(outputDir, "generated/typescript/src/index.ts"), "utf8");
  assert.match(typescriptErrors, /class MusiccloudApiError/);
  assert.match(typescriptRuntime, /throw await musiccloudErrorFromResponse\(response\)/);
  assert.match(typescriptRuntime, /throw classifyMusiccloudTransportError\(e\)/);
  assert.match(typescriptIndex, /export \* from ['"]\.\/musiccloud-errors['"]/);

  const pythonErrors = await readFile(
    path.join(outputDir, "generated/python/musiccloud_api_client/musiccloud_errors.py"),
    "utf8",
  );
  const pythonClient = await readFile(
    path.join(outputDir, "generated/python/musiccloud_api_client/api_client.py"),
    "utf8",
  );
  const pythonRest = await readFile(path.join(outputDir, "generated/python/musiccloud_api_client/rest.py"), "utf8");
  const pythonInit = await readFile(
    path.join(outputDir, "generated/python/musiccloud_api_client/__init__.py"),
    "utf8",
  );
  assert.match(pythonErrors, /class MusiccloudApiError/);
  assert.match(pythonClient, /raise parse_musiccloud_error_response\(/);
  assert.match(pythonRest, /raise classify_musiccloud_transport_error\(e\)/);
  assert.match(pythonRest, /except Exception as e:\n\s+raise classify_musiccloud_transport_error\(e\)/);
  assert.match(pythonInit, /from musiccloud_api_client\.musiccloud_errors import/);

  const swiftErrors = await readFile(
    path.join(outputDir, "generated/swift/Sources/MusiccloudApiClient/Infrastructure/MusiccloudErrors.swift"),
    "utf8",
  );
  const swiftModels = await readFile(
    path.join(outputDir, "generated/swift/Sources/MusiccloudApiClient/Infrastructure/Models.swift"),
    "utf8",
  );
  assert.match(swiftErrors, /public enum MusiccloudError/);
  assert.match(swiftModels, /public typealias ErrorResponse = MusiccloudError/);

  for (const [language, expectedType] of [
    ["typescript", "MusiccloudApiError"],
    ["python", "MusiccloudApiError"],
    ["swift", "MusiccloudError.api"],
  ]) {
    const readme = await readFile(path.join(outputDir, `generated/${language}/README.md`), "utf8");
    assert.match(readme, /Typed error handling/);
    assert.match(readme, new RegExp(expectedType.replace(".", "\\.")));
    assert.match(readme, /Unhandled/);
    assert.match(readme, /report/);
    assert.doesNotMatch(readme, /\x1b/);
  }

  const typescriptReadme = await readFile(path.join(outputDir, "generated/typescript/README.md"), "utf8");
  const pythonReadme = await readFile(path.join(outputDir, "generated/python/README.md"), "utf8");
  const swiftReadme = await readFile(path.join(outputDir, "generated/swift/README.md"), "utf8");
  assert.match(typescriptReadme, /api\.resolve\(/);
  assert.doesNotMatch(typescriptReadme, /api\.apiV1ResolvePost\(/);
  assert.match(pythonReadme, /api\.resolve\(/);
  assert.doesNotMatch(pythonReadme, /api\.api_v1_resolve_post\(/);
  assert.match(swiftReadme, /ResolveAPI\.resolve\(/);
  assert.doesNotMatch(swiftReadme, /ResolveAPI\.apiV1ResolvePost\(/);
});

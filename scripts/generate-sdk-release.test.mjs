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
});

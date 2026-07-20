import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const generatorScript = path.join(repoRoot, "scripts/generate-sdk-release.mjs");
const languages = ["typescript", "python", "swift", "php", "go"];
const fixtureRoot = await mkdtemp(path.join(tmpdir(), "musiccloud-sdk-cli-fixture-"));
const contractDir = path.join(fixtureRoot, "contract");
const profilesRoot = path.join(fixtureRoot, "profiles");
const openApi = await readFile(path.join(repoRoot, "scripts/fixtures/openapi-sdk-fixture.json"));
const openApiSha256 = crypto.createHash("sha256").update(openApi).digest("hex");
await Promise.all([
  mkdir(contractDir, { recursive: true }),
  cp(path.join(repoRoot, "sdk/generator-profiles"), profilesRoot, { recursive: true }),
]);
const manifestPath = path.join(profilesRoot, "candidate-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.contract.version = "2.1.0";
manifest.contract.sha256 = openApiSha256;
await Promise.all([
  writeFile(path.join(contractDir, "openapi.json"), openApi),
  writeFile(
    path.join(contractDir, "openapi.metadata.json"),
    `${JSON.stringify({ version: "2.1.0", sha256: openApiSha256 }, null, 2)}\n`,
  ),
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
]);

function runGenerator(outDir, extraArgs = [], extraEnv = {}) {
  return spawnSync(
    process.execPath,
    [
      generatorScript,
      "--contract-dir",
      contractDir,
      "--out-dir",
      outDir,
      "--source-sha",
      "0123456789abcdef0123456789abcdef01234567",
      "--release-base-url",
      "https://github.com/phranck/musiccloud/releases/download/sdk-v0.1.0",
      "--profiles-root",
      profilesRoot,
      ...extraArgs,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        MUSICCLOUD_SDK_GENERATOR_FIXTURE: "true",
        ...extraEnv,
      },
    },
  );
}

test("CLI fixture emits the five-target Catalog v2 and SDK-versioned archives", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "musiccloud-sdk-release-"));
  const outDir = path.join(tempRoot, "sdk");
  const result = runGenerator(outDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const catalog = JSON.parse(await readFile(path.join(outDir, "sdk-catalog.json"), "utf8"));
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.sdkVersion, "0.1.0");
  assert.equal(catalog.releaseTag, "sdk-v0.1.0");
  assert.equal(catalog.apiVersion, "2.1.0");
  assert.deepEqual(
    catalog.assets.map((asset) => asset.language),
    languages,
  );
  for (const asset of catalog.assets) {
    assert.equal(asset.archiveName, `musiccloud-${asset.language}-sdk-0.1.0.zip`);
    assert.equal(asset.stability, "preview");
    assert.equal(asset.generator.id.length > 0, true);
    assert.equal(asset.generator.version.length > 0, true);
    assert.match(asset.generator.artifact.digest, /\S/);
    assert.doesNotMatch(JSON.stringify(asset), /mc_live_|fixture-secret/i);
    await access(path.join(outDir, asset.archiveName));
  }
});

test("CLI target mode produces a diagnostic tree without a release catalog", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "musiccloud-sdk-diagnostic-"));
  const outDir = path.join(tempRoot, "sdk");
  const result = runGenerator(outDir, ["--target", "go"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const diagnostic = JSON.parse(await readFile(path.join(outDir, "sdk-diagnostic.json"), "utf8"));
  assert.equal(diagnostic.mode, "diagnostic");
  assert.equal(diagnostic.target.language, "go");
  await assert.rejects(access(path.join(outDir, "sdk-catalog.json")));
});

test("CLI failure injection identifies the selected adapter and emits no release candidate", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "musiccloud-sdk-failure-"));
  const outDir = path.join(tempRoot, "sdk");
  const result = runGenerator(outDir, [], {
    MUSICCLOUD_SDK_FAIL_TARGET: "php",
    MUSICCLOUD_SDK_FAIL_STAGE: "native gate: Composer validation",
  });
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /SDK target php \(jane-openapi-7-12\) failed during native gate: Composer validation: injected fixture failure/,
  );
  await assert.rejects(access(path.join(outDir, "sdk-catalog.json")));
});

test("keeps shared typed-error examples aligned with semantic generated operation names", async () => {
  const readme = await readFile(path.join(repoRoot, "sdk/error-contract/README.md"), "utf8");

  assert.match(readme, /api\.resolve\(\{ resolveRequest: request \}\)/);
  assert.match(readme, /api\.resolve\(resolve_request\)/);
  assert.match(readme, /ResolveAPI\.resolve\(resolveRequest: request\)/);
  assert.doesNotMatch(readme, /apiV1ResolvePost|api_v1_resolve_post/);
});

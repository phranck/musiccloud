#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const sdkDir = path.resolve(process.argv[2] ?? ".tmp/sdk");
const generatedDir = path.join(sdkDir, "generated");
const catalog = JSON.parse(await readFile(path.join(sdkDir, "sdk-catalog.json"), "utf8"));
const expectedLanguages = ["typescript", "python", "swift", "php", "go"];
const errorRuntimeByLanguage = {
  typescript: "runtime/musiccloud-errors.ts",
  python: "package/musiccloud/musiccloud_errors.py",
  swift: "generated/MusiccloudErrors.swift",
  php: "src/MusiccloudErrors.php",
  go: "musicclouderrors/musiccloud_errors.go",
};

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function collectFiles(root, relative = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(root, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

assert.equal(catalog.schemaVersion, 2);
assert.match(catalog.sdkVersion, /^\d+\.\d+\.\d+$/);
assert.equal(catalog.releaseTag, `sdk-v${catalog.sdkVersion}`);
assert.match(catalog.apiVersion, /^\d+\.\d+\.\d+$/);
assert.match(catalog.openApiSha256, /^[a-f0-9]{64}$/);
assert.match(catalog.sourceSha, /^[a-f0-9]{40}$/);
assert.deepEqual(
  catalog.assets.map((asset) => asset.language),
  expectedLanguages,
);

for (const asset of catalog.assets) {
  const candidateDir = path.join(generatedDir, asset.language);
  const manifest = JSON.parse(await readFile(path.join(candidateDir, "sdk-target-manifest.json"), "utf8"));

  assert.equal(manifest.sdkVersion, catalog.sdkVersion, `${asset.language} SDK version`);
  assert.equal(manifest.apiVersion, catalog.apiVersion, `${asset.language} API version`);
  assert.equal(manifest.openApiSha256, catalog.openApiSha256, `${asset.language} OpenAPI fingerprint`);
  assert.equal(manifest.language, asset.language, `${asset.language} target identity`);
  assert.deepEqual(manifest.package, asset.package, `${asset.language} package provenance`);
  assert.deepEqual(manifest.runtime, asset.runtime, `${asset.language} runtime provenance`);
  assert.deepEqual(manifest.generator, asset.generator, `${asset.language} generator provenance`);
  assert.match(manifest.configurationRevision, /^[a-f0-9]{64}$/);
  assert.equal(manifest.configurationRevision, asset.configurationRevision);
  assert.match(manifest.inputRevision, /^[a-f0-9]{64}$/);
  assert.equal(manifest.inputRevision, asset.inputRevision);

  for (const relative of [
    ".musiccloud/inputs.json",
    ".musiccloud/generator-matrix.json",
    ".musiccloud/public-surface.json",
    ".musiccloud/operation-profiles.json",
    ".musiccloud/contract-adapter.mjs",
    ".musiccloud/public-api.txt",
    ".musiccloud/usage",
    ".musiccloud/error-contract",
    errorRuntimeByLanguage[asset.language],
    "README.md",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    const file = path.join(candidateDir, relative);
    assert.ok((await stat(file)).isFile() || (await stat(file)).isDirectory(), `${asset.language}: ${relative}`);
  }
  if (asset.language !== "python") {
    assert.ok(
      (await stat(path.join(candidateDir, ".musiccloud/harness"))).isDirectory(),
      `${asset.language}: .musiccloud/harness`,
    );
  }

  const archiveBytes = await readFile(path.join(sdkDir, asset.archiveName));
  assert.equal(sha256(archiveBytes), asset.sha256, `${asset.language} archive checksum`);
  assert.ok(asset.archiveUrl.endsWith(`/${asset.archiveName}`));

  for (const relative of await collectFiles(candidateDir)) {
    const contents = await readFile(path.join(candidateDir, relative));
    assert.doesNotMatch(
      contents.toString("utf8"),
      /\bmc_(?:live|test)_[A-Za-z0-9_-]{12,}\b/,
      `${asset.language} candidate contains an API-key-shaped value in ${relative}`,
    );
  }
}

console.log("Five-target generated SDK candidate integrity passed.");

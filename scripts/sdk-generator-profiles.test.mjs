import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSdkGeneratorProfiles, validateSdkGeneratorProfiles } from "./validate-sdk-generator-profiles.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profilesRoot = path.join(repoRoot, "sdk/generator-profiles");

test("validates the checked-in five-language generator inputs", async () => {
  const profiles = await loadSdkGeneratorProfiles(profilesRoot);
  const result = validateSdkGeneratorProfiles(profiles);

  assert.deepEqual(result.languages, ["typescript", "python", "swift", "php", "go"]);
  assert.equal(result.operationCount, 13);
  assert.equal(result.contract.version, "2.1.10");
  assert.equal(result.contract.sha256, "1813049b6d9390fb88413b1880c35f6dcef720f9f3fce04e99ae994242214699");
});

test("requires one selected and one isolated comparison adapter per language", async () => {
  const profiles = structuredClone(await loadSdkGeneratorProfiles(profilesRoot));
  profiles.matrix.languages[0].adapters = profiles.matrix.languages[0].adapters.filter(
    (adapter) => adapter.role !== "selected",
  );

  assert.throws(() => validateSdkGeneratorProfiles(profiles), /typescript must define exactly one selected adapter/);
});

test("rejects surface drift from the canonical operation profile", async () => {
  const profiles = structuredClone(await loadSdkGeneratorProfiles(profilesRoot));
  profiles.surface.operations.pop();

  assert.throws(
    () => validateSdkGeneratorProfiles(profiles),
    /public surface must cover every canonical operation exactly once/,
  );
});

test("preserves the approved share call shapes and Swift request naming", async () => {
  const profiles = await loadSdkGeneratorProfiles(profilesRoot);
  const share = profiles.surface.operations.find((operation) => operation.operationId === "retrieveShare");
  const preview = profiles.surface.operations.find((operation) => operation.operationId === "refreshSharePreview");

  assert.deepEqual(share.public, {
    typescript: "shares.retrieve",
    python: "shares.retrieve",
    swift: "share",
    php: "shares.retrieve",
    go: "Shares.Get",
  });
  assert.deepEqual(preview.public, {
    typescript: "shares.refreshPreview",
    python: "shares.refresh_preview",
    swift: "sharePreview",
    php: "shares.refreshPreview",
    go: "Shares.RefreshPreview",
  });
  for (const operation of profiles.surface.operations) {
    assert.doesNotMatch(operation.public.swift, /^get[A-Z]/);
  }
});

test("keeps one atomic SDK version and the typed error handoff for all five targets", async () => {
  const profiles = await loadSdkGeneratorProfiles(profilesRoot);
  const manifest = profiles.manifest;

  assert.equal(manifest.release.atomic, true);
  assert.match(manifest.release.sdkVersion, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(
    manifest.targets.map((target) => target.language),
    ["typescript", "python", "swift", "php", "go"],
  );
  for (const target of manifest.targets) {
    assert.equal(target.errorContract, `sdk/error-contract/${target.language}`);
    assert.equal(target.stability, "preview");
  }
});

test("declares release, package, runtime, documentation, and quickstart metadata per target", async () => {
  const profiles = await loadSdkGeneratorProfiles(profilesRoot);

  for (const target of profiles.manifest.targets) {
    const selectedAdapter = profiles.matrix.languages
      .find((entry) => entry.language === target.language)
      .adapters.find((adapter) => adapter.role === "selected");

    assert.equal(target.targetId, `${target.language}-sdk`);
    assert.equal(target.runtime.name, selectedAdapter.runtime.name);
    assert.equal(target.runtime.constraint, selectedAdapter.runtime.constraint);
    assert.match(target.displayName, /\S/);
    assert.match(target.package.name, /\S/);
    assert.match(target.package.module, /\S/);
    assert.match(target.package.channel, /^(npm|pypi|swift-package|composer|go-module)$/);
    assert.match(target.artifact.archiveBaseName, new RegExp(`^musiccloud-${target.language}-sdk$`));
    assert.equal(target.artifact.repository, "https://github.com/phranck/musiccloud");
    assert.ok(target.artifact.documentation.includes("README.md"));
    assert.deepEqual(target.artifact.manpages, []);
    assert.match(target.quickstart.install, /<version>/);
    assert.match(target.quickstart.import, /\S/);
    assert.match(target.quickstart.firstRequest, /\S/);
  }
});

test("declares every adapter and harness input handed to the release orchestrator", async () => {
  const profiles = await loadSdkGeneratorProfiles(profilesRoot);

  assert.deepEqual(profiles.manifest.inputs, {
    matrix: "sdk/generator-profiles/generator-matrix.json",
    surface: "sdk/generator-profiles/public-surface.json",
    profilesRoot: "sdk/generator-profiles/languages",
    operationProfiles: "apps/backend/src/docs/public-operation-profiles.json",
    harnessesRoot: "sdk/generator-profiles/harnesses",
    contractAdapter: "scripts/prepare-sdk-generator-contract.mjs",
    defectFixture: "scripts/fixtures/sdk-generator-contract-defects.json",
  });
});

test("schemas reject unknown properties instead of accepting configuration typos", async () => {
  const profiles = structuredClone(await loadSdkGeneratorProfiles(profilesRoot));
  profiles.languages.typescript.generator.unknownOption = true;

  assert.throws(() => validateSdkGeneratorProfiles(profiles), /language profile typescript does not match its schema/);
});

test("normalizes every binary media type through the Python generator's supported bytes source", async () => {
  const profiles = await loadSdkGeneratorProfiles(profilesRoot);

  assert.deepEqual(profiles.languages.python.generator.config.content_type_overrides, {
    "audio/flac": "application/octet-stream",
    "audio/mpeg": "application/octet-stream",
    "audio/ogg": "application/octet-stream",
    "image/jpeg": "application/octet-stream",
  });
});

test("uses Hey API's non-deprecated tag grouping configuration", async () => {
  const profiles = await loadSdkGeneratorProfiles(profilesRoot);
  const sdkPlugin = profiles.languages.typescript.generator.config.plugins.find(
    (plugin) => typeof plugin === "object" && plugin.name === "@hey-api/sdk",
  );

  assert.deepEqual(sdkPlugin, {
    name: "@hey-api/sdk",
    operations: { strategy: "byTags" },
  });
});

test("golden public API snapshots match the declarative surface", async () => {
  const profiles = await loadSdkGeneratorProfiles(profilesRoot);

  for (const language of Object.keys(profiles.languages)) {
    const snapshot = await readFile(path.join(profilesRoot, "snapshots", `${language}.txt`), "utf8");
    const expected = profiles.surface.operations
      .map((operation) => `${operation.operationId} -> ${operation.public[language]}`)
      .sort()
      .join("\n");
    assert.equal(snapshot.trim(), expected);
  }
});

test("ships native golden usage contracts for the approved share call shapes", async () => {
  const profiles = await loadSdkGeneratorProfiles(profilesRoot);
  const expectedCalls = {
    typescript: ["client.shares.retrieve(shortId)", "client.shares.refreshPreview(shortId)"],
    python: ["client.shares.retrieve(short_id)", "client.shares.refresh_preview(short_id)"],
    swift: ["client.share(for: shortID)", "client.sharePreview(for: shortID)"],
    php: ["$client->shares()->retrieve($shortId)", "$client->shares()->refreshPreview($shortId)"],
    go: ["client.Shares.Get(ctx, shortID)", "client.Shares.RefreshPreview(ctx, shortID)"],
  };

  for (const target of profiles.manifest.targets) {
    const usage = await readFile(path.join(repoRoot, target.goldenUsage), "utf8");
    for (const call of expectedCalls[target.language])
      assert.match(usage, new RegExp(call.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

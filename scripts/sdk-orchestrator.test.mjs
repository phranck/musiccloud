import assert from "node:assert/strict";
import crypto from "node:crypto";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createSdkAdapters } from "./sdk-orchestrator/adapters/index.mjs";
import { replaceOrVerify } from "./sdk-orchestrator/adapters/common.mjs";
import { resolveReleaseManifest, runSdkRelease, SdkAdapterError } from "./sdk-orchestrator/orchestrator.mjs";
import { loadSdkGeneratorProfiles } from "./validate-sdk-generator-profiles.mjs";

const profileLanguages = ["typescript", "python", "swift", "php", "go"];
const fixtureSourceSha = "0123456789abcdef0123456789abcdef01234567";

test("registers one explicit selected-generator adapter per language", () => {
  const adapters = createSdkAdapters();

  assert.deepEqual([...adapters.keys()], profileLanguages);
  assert.deepEqual(
    [...adapters.values()].map((adapter) => adapter.adapterId),
    ["hey-api-0-99", "openapi-python-client-0-29", "swift-openapi-generator-1-13", "jane-openapi-7-12", "ogen-1-23"],
  );
  for (const adapter of adapters.values()) assert.equal(typeof adapter.generate, "function");
});

test("keeps deterministic package metadata replacements idempotent and drift-sensitive", () => {
  const replaced = replaceOrVerify(
    'module "candidate"',
    '"candidate"',
    '"MusicCloudSDK"',
    "package assembly: fixture",
  );
  assert.equal(replaced, 'module "MusicCloudSDK"');
  assert.equal(
    replaceOrVerify(
      replaced,
      '"candidate"',
      '"MusicCloudSDK"',
      "package assembly: fixture",
    ),
    replaced,
  );
  assert.throws(
    () => replaceOrVerify("module drifted", '"candidate"', '"MusicCloudSDK"', "package assembly: fixture"),
    /expected source text is absent/,
  );
});

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "musiccloud-sdk-orchestrator-"));
  const contractDir = path.join(root, "contract");
  const openApi = `${JSON.stringify({ openapi: "3.1.0", info: { title: "fixture", version: "2.1.10" }, paths: {} }, null, 2)}\n`;
  const sha256 = crypto.createHash("sha256").update(openApi).digest("hex");
  await mkdir(contractDir, { recursive: true });
  await writeFile(path.join(contractDir, "openapi.json"), openApi);
  await writeFile(
    path.join(contractDir, "openapi.metadata.json"),
    `${JSON.stringify({ version: "2.1.10", sha256 }, null, 2)}\n`,
  );
  const profiles = structuredClone(await loadSdkGeneratorProfiles());
  profiles.manifest.contract.sha256 = sha256;
  return { root, contractDir, profiles };
}

function fixtureAdapters({ failLanguage, failStage = "native gate" } = {}) {
  return new Map(
    profileLanguages.map((language) => [
      language,
      {
        language,
        async generate(context) {
          assert.equal(context.target.language, language);
          if (language === failLanguage) {
            throw new SdkAdapterError(failStage, new Error("injected fixture failure"));
          }
          await mkdir(context.candidateDir, { recursive: true });
          await mkdir(path.join(context.candidateDir, ".musiccloud"), { recursive: true });
          await writeFile(path.join(context.candidateDir, "README.md"), `${language} SDK\n`);
          await writeFile(path.join(context.candidateDir, "generated.txt"), `${language}\n`);
          await writeFile(path.join(context.candidateDir, ".musiccloud/input.txt"), `${language} input\n`);
        },
      },
    ]),
  );
}

test("resolves one exact five-target release manifest from the selected adapters", async () => {
  const profiles = await loadSdkGeneratorProfiles();
  const release = resolveReleaseManifest(profiles);

  assert.equal(release.sdkVersion, "0.1.0");
  assert.equal(release.releaseTag, "sdk-v0.1.0");
  assert.equal(release.apiVersion, "2.1.10");
  assert.notEqual(release.sdkVersion, release.apiVersion);
  assert.deepEqual(
    release.targets.map((target) => target.language),
    profileLanguages,
  );
  assert.deepEqual(
    release.targets.map((target) => target.generator.id),
    ["hey-api-0-99", "openapi-python-client-0-29", "swift-openapi-generator-1-13", "jane-openapi-7-12", "ogen-1-23"],
  );
  for (const target of release.targets) {
    assert.equal(target.targetId, `${target.language}-sdk`);
    assert.equal(target.generator.version.length > 0, true);
    assert.equal(target.generator.artifact.digest.length > 0, true);
    assert.deepEqual(target.runtime, target.generator.runtime);
    assert.equal(Object.keys(target.configuration).length > 0, true);
    assert.equal(Object.keys(target.naming).length > 0, true);
    assert.equal(Object.keys(target.publicSurface).length > 0, true);
    assert.match(target.configurationRevision, /^[a-f0-9]{64}$/);
  }
});

test("resolves package versions from the single shared SDK version source", async () => {
  const profiles = structuredClone(await loadSdkGeneratorProfiles());
  profiles.manifest.release.sdkVersion = "0.2.0";
  profiles.manifest.release.tag = "sdk-v0.2.0";

  const release = resolveReleaseManifest(profiles);
  const python = release.targets.find((target) => target.language === "python");
  assert.equal(python.configuration.package_version_override, "0.2.0");
});

test("promotes all five targets and Catalog v2 only after every adapter succeeds", async () => {
  const fixture = await createFixture();
  const outDir = path.join(fixture.root, "sdk");
  const catalog = await runSdkRelease({
    contractDir: fixture.contractDir,
    outDir,
    sourceSha: fixtureSourceSha,
    releaseBaseUrl: "https://github.com/phranck/musiccloud/releases/download/sdk-v0.1.0",
    profiles: fixture.profiles,
    adapters: fixtureAdapters(),
  });

  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.sdkVersion, "0.1.0");
  assert.equal(catalog.releaseTag, "sdk-v0.1.0");
  assert.deepEqual(
    catalog.assets.map((asset) => asset.language),
    profileLanguages,
  );
  for (const asset of catalog.assets) {
    assert.equal(asset.archiveName, `musiccloud-${asset.language}-sdk-0.1.0.zip`);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.match(asset.configurationRevision, /^[a-f0-9]{64}$/);
    assert.match(asset.inputRevision, /^[a-f0-9]{64}$/);
    await access(path.join(outDir, asset.archiveName));
    const targetManifest = JSON.parse(
      await readFile(path.join(outDir, "generated", asset.language, "sdk-target-manifest.json"), "utf8"),
    );
    assert.equal(targetManifest.inputRevision, asset.inputRevision);
  }
});

test("rejects an invalid source revision before generating a release", async () => {
  const fixture = await createFixture();

  await assert.rejects(
    runSdkRelease({
      contractDir: fixture.contractDir,
      outDir: path.join(fixture.root, "sdk"),
      sourceSha: "fixture-source",
      profiles: fixture.profiles,
      adapters: fixtureAdapters(),
    }),
    /sourceSha must be a 40-character lowercase Git SHA/,
  );
});

test("attributes an injected target failure and leaves the previous release untouched", async () => {
  const fixture = await createFixture();
  const outDir = path.join(fixture.root, "sdk");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "previous-release.txt"), "preserve me\n");

  await assert.rejects(
    runSdkRelease({
      contractDir: fixture.contractDir,
      outDir,
      sourceSha: fixtureSourceSha,
      profiles: fixture.profiles,
      adapters: fixtureAdapters({ failLanguage: "go" }),
    }),
    /SDK target go \(ogen-1-23\) failed during native gate: injected fixture failure/,
  );

  assert.equal(await readFile(path.join(outDir, "previous-release.txt"), "utf8"), "preserve me\n");
  await assert.rejects(access(path.join(outDir, "sdk-catalog.json")));
});

test("runs one target for diagnosis without emitting a partial release catalog", async () => {
  const fixture = await createFixture();
  const outDir = path.join(fixture.root, "diagnostic");
  const result = await runSdkRelease({
    contractDir: fixture.contractDir,
    outDir,
    sourceSha: fixtureSourceSha,
    profiles: fixture.profiles,
    adapters: fixtureAdapters(),
    target: "php",
  });

  assert.equal(result.mode, "diagnostic");
  assert.equal(result.sourceSha, fixtureSourceSha);
  assert.equal(result.target.language, "php");
  assert.match(result.target.inputRevision, /^[a-f0-9]{64}$/);
  await access(path.join(outDir, "generated", "php", "sdk-target-manifest.json"));
  await access(path.join(outDir, "sdk-diagnostic.json"));
  await assert.rejects(access(path.join(outDir, "sdk-catalog.json")));
  for (const language of profileLanguages.filter((language) => language !== "php")) {
    await assert.rejects(access(path.join(outDir, "generated", language)));
  }
});

test("produces byte-identical archives and catalog content for identical inputs", async () => {
  const fixture = await createFixture();
  const firstOut = path.join(fixture.root, "first");
  const secondOut = path.join(fixture.root, "second");
  const options = {
    contractDir: fixture.contractDir,
    sourceSha: fixtureSourceSha,
    releaseBaseUrl: "https://github.com/phranck/musiccloud/releases/download/sdk-v0.1.0",
    profiles: fixture.profiles,
    adapters: fixtureAdapters(),
  };

  const first = await runSdkRelease({ ...options, outDir: firstOut });
  const second = await runSdkRelease({ ...options, outDir: secondOut });
  assert.deepEqual(first, second);
  assert.deepEqual(
    await readFile(path.join(firstOut, "sdk-catalog.json")),
    await readFile(path.join(secondOut, "sdk-catalog.json")),
  );
  for (const asset of first.assets) {
    assert.deepEqual(
      await readFile(path.join(firstOut, asset.archiveName)),
      await readFile(path.join(secondOut, asset.archiveName)),
    );
  }
});

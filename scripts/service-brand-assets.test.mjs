import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = path.join(root, "scripts/service-brand-assets.mjs");

/**
 * Creates an owned source-only repository fixture and removes it after the test.
 * @param {import("node:test").TestContext} context Test owning the temporary directory.
 * @returns {string} Physical fixture path, independent of the real platform outputs.
 */
function sourceFixture(context) {
  const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "musiccloud-brand-assets-")));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  cpSync(path.join(root, "assets"), path.join(directory, "assets"), { recursive: true });
  mkdirSync(path.join(directory, "packages/shared/src"), { recursive: true });
  cpSync(path.join(root, "packages/shared/src/services.ts"), path.join(directory, "packages/shared/src/services.ts"));
  return directory;
}

/**
 * Runs the public generator CLI against one repository root.
 * @param {string} directory Repository or private fixture to synchronize.
 * @param {string} mode Either --check or --write.
 * @returns {import("node:child_process").SpawnSyncReturns<string>} Exit status and diagnostic output.
 */
function generate(directory, mode) {
  return spawnSync(process.execPath, [script, mode, "--root", directory], { cwd: directory, encoding: "utf8" });
}

test("web and Apple artwork are reproducible from the shared curated source", () => {
  assert.ok(existsSync(new URL("../assets/service-brands/manifest.json", import.meta.url)),
    "A single curated service-brand manifest must exist");
  const result = generate(root, "--check");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("reused glyph and color variants share one emitted web file", (context) => {
  const directory = sourceFixture(context);
  const result = generate(directory, "--write");
  assert.equal(result.status, 0, result.stderr);
  for (const app of ["frontend", "dashboard"]) {
    const folder = path.join(directory, `apps/${app}/public/icons/service-brands`);
    assert.ok(existsSync(path.join(folder, "tidal.svg")));
    assert.ok(!existsSync(path.join(folder, "tidal-glyph.svg")), "One curated source must not create redundant variant copies");
  }
  const mapping = readFileSync(path.join(directory, "packages/dashboard-ui/src/platform-icon/platformIconFiles.ts"), "utf8");
  assert.match(mapping, /\[Service\.Tidal\]: "service-brands\/tidal\.svg"/);
});

test("a canonical edit reaches both web apps and Apple while check mode stays read-only", (context) => {
  const directory = sourceFixture(context);
  assert.equal(generate(directory, "--write").status, 0);
  const source = path.join(directory, "assets/service-brands/spotify/icon.svg");
  const output = path.join(directory, "apps/frontend/public/icons/service-brands/spotify.svg");
  const before = readFileSync(output);
  const changed = Buffer.concat([readFileSync(source), Buffer.from("\n<!-- source propagation fixture -->\n")]);
  writeFileSync(source, changed);

  const check = generate(directory, "--check");
  assert.equal(check.status, 1);
  assert.match(check.stdout, /Out of date: apps\/frontend\/public\/icons\/service-brands\/spotify.svg/);
  assert.deepEqual(readFileSync(output), before, "Check mode must not rewrite an output");
  const stale = path.join(directory, "apps/frontend/public/icons/service-brands/obsolete.svg");
  const unrelated = path.join(directory, "apps/frontend/public/icons/unrelated.png");
  writeFileSync(stale, "obsolete");
  writeFileSync(unrelated, "untouched");
  assert.equal(generate(directory, "--write").status, 0);
  for (const relative of [
    "apps/frontend/public/icons/service-brands/spotify.svg",
    "apps/dashboard/public/icons/service-brands/spotify.svg",
    "apps/Apple/App/Supporting Files/Assets.xcassets/ServiceBrandIcons/spotify.imageset/icon.svg",
  ]) assert.deepEqual(readFileSync(path.join(directory, relative)), changed);
  assert.ok(!existsSync(stale));
  assert.equal(readFileSync(unrelated, "utf8"), "untouched");
  assert.equal(generate(directory, "--check").status, 0, "Regeneration must be idempotent");
});

test("a source symlink cannot escape the curated directory", (context) => {
  const directory = sourceFixture(context);
  const outside = path.join(directory, "outside.svg");
  writeFileSync(outside, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const source = path.join(directory, "assets/service-brands/spotify/icon.svg");
  unlinkSync(source);
  symlinkSync(outside, source);

  const result = generate(directory, "--write");
  assert.equal(result.status, 1, "A source alias must not copy unrelated files into platform bundles");
  assert.match(result.stderr, /Curated artwork must stay inside its source directory/);
});

test("a generated subtree alias cannot overwrite or prune curated inputs", (context) => {
  const directory = sourceFixture(context);
  const original = readFileSync(path.join(directory, "assets/service-brands/manifest.json"));
  const output = path.join(directory, "apps/frontend/public/icons/service-brands");
  mkdirSync(path.dirname(output), { recursive: true });
  symlinkSync(path.join(directory, "assets/service-brands"), output, "dir");

  const result = generate(directory, "--write");
  assert.equal(result.status, 1, "Generation must refuse a symlinked output tree before writing or pruning");
  assert.deepEqual(readFileSync(path.join(directory, "assets/service-brands/manifest.json")), original);
});

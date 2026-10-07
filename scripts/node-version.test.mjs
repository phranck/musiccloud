import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

/** Reads a repository file as text. */
function readRepositoryFile(path) {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

/** The Node major that `.nvmrc` pins, which every other place has to match. */
const pinnedMajor = (await readRepositoryFile(".nvmrc")).trim();

test("pins one Node major in .nvmrc", () => {
  assert.match(pinnedMajor, /^\d+$/);
});

test("lets every CI setup-node step read .nvmrc", async () => {
  const workflow = await readRepositoryFile(".github/workflows/ci.yml");
  const setupSteps = workflow.match(/uses: actions\/setup-node@v\d+\n(?: {8}.*\n)*/g) ?? [];

  assert.notEqual(setupSteps.length, 0);
  for (const step of setupSteps) {
    assert.match(step, /node-version-file: \.nvmrc/);
    assert.doesNotMatch(step, /node-version: /);
  }
});

test("builds and runs every Zerops Node service on the pinned major", async () => {
  // zerops.yml cannot read .nvmrc, so this is where the two are held together.
  const zerops = await readRepositoryFile("zerops.yml");
  const majors = [...zerops.matchAll(/base: alpine\/nodejs@(\d+)/g)].map((match) => match[1]);

  assert.notEqual(majors.length, 0);
  for (const major of majors) assert.equal(major, pinnedMajor);
});

test("declares the pinned major as the engines minimum", async () => {
  const manifest = JSON.parse(await readRepositoryFile("package.json"));

  assert.equal(manifest.engines?.node, `>=${pinnedMajor}`);
});

test("types Node APIs against the pinned major in every workspace", async () => {
  // The lockfile is what every workspace resolves, including the optional
  // `@types/node` peer of Vite and Astro in workspaces that declare none. That
  // peer takes the newest match unless the root override holds it to the pin.
  const lockfile = await readRepositoryFile("pnpm-lock.yaml");
  const majors = new Set([...lockfile.matchAll(/@types\/node@(\d+)\./g)].map((match) => match[1]));

  assert.deepEqual([...majors], [pinnedMajor]);
});

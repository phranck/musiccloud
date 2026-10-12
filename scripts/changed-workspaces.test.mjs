import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { affectedWorkspaces, outputName, Purpose, readWorkspaces } from "./changed-workspaces.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const repositoryWorkspaces = readWorkspaces(root);

/** The output names a change marks as affected, sorted. */
function marked(workspaces, files, purpose) {
  return [...affectedWorkspaces(workspaces, files, purpose)]
    .filter(([, isAffected]) => isAffected)
    .map(([name]) => outputName(name))
    .sort();
}

test("a change in a leaf marks its dependents and not its dependencies", () => {
  const fixture = [
    { name: "@musiccloud/base", folder: "packages/base", dependencies: [] },
    { name: "@musiccloud/leaf", folder: "packages/leaf", dependencies: ["@musiccloud/base"] },
    { name: "@musiccloud/site", folder: "apps/site", dependencies: ["@musiccloud/leaf"] },
    { name: "@musiccloud/other", folder: "apps/other", dependencies: ["@musiccloud/base"] },
  ];

  assert.deepEqual(marked(fixture, ["packages/leaf/src/index.ts"], Purpose.Deploy), ["site"]);
  // Validation also builds what an affected workspace builds against.
  assert.deepEqual(marked(fixture, ["packages/leaf/src/index.ts"], Purpose.Validate), ["base", "leaf", "site"]);
});

test("a dashboard-ui change deploys and validates both sites that ship it", () => {
  const files = ["packages/dashboard-ui/src/index.ts"];

  assert.deepEqual(marked(repositoryWorkspaces, files, Purpose.Deploy), ["dashboard", "developer"]);
  assert.deepEqual(marked(repositoryWorkspaces, files, Purpose.Validate), [
    "dashboard",
    "dashboard_ui",
    "developer",
    "shared",
  ]);
});

test("a backend change deploys the portal, whose build exports the backend's contract, and not the dashboard", () => {
  const files = ["apps/backend/src/server.ts"];

  assert.deepEqual(marked(repositoryWorkspaces, files, Purpose.Deploy), ["backend", "developer"]);
});

test("a portal change does not validate the backend", () => {
  assert.equal(
    affectedWorkspaces(repositoryWorkspaces, ["apps/developer/src/middleware.ts"], Purpose.Validate).get(
      "@musiccloud/backend",
    ),
    false,
  );
});

test("a change to the CI workflow validates everything and deploys nothing", () => {
  const files = [".github/workflows/ci.yml"];

  assert.deepEqual(marked(repositoryWorkspaces, files, Purpose.Deploy), []);
  assert.deepEqual(marked(repositoryWorkspaces, files, Purpose.Validate), [
    "backend",
    "dashboard",
    "dashboard_ui",
    "developer",
    "frontend",
    "shared",
  ]);
});

test("a change to zerops.yml or a root tsconfig deploys every service", () => {
  for (const file of ["zerops.yml", "tsconfig.base.json"]) {
    assert.deepEqual(marked(repositoryWorkspaces, [file], Purpose.Deploy), ["backend", "dashboard", "developer", "frontend"], file);
  }
});

test("prints the names both detect jobs declare as outputs", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  for (const [jobName, purpose] of [
    ["detect-validation-changes", Purpose.Validate],
    ["detect-changes", Purpose.Deploy],
  ]) {
    const job = workflow.slice(workflow.indexOf(`  ${jobName}:`));
    const outputs = job.slice(job.indexOf("    outputs:\n"), job.indexOf("    steps:\n"));
    const declared = [...outputs.matchAll(/^ {6}([a-z_]+):/gm)].map((match) => match[1]).sort();
    const printed = [...affectedWorkspaces(repositoryWorkspaces, [], purpose).keys()].map(outputName).sort();

    assert.deepEqual(declared, printed, jobName);
  }
});

test("names every deployable workspace after a setup in zerops.yml", async () => {
  const zerops = await readFile(new URL("../zerops.yml", import.meta.url), "utf8");
  const setups = [...zerops.matchAll(/^ {2}- setup: ([a-z-]+)$/gm)].map((match) => match[1]).sort();
  const services = [...affectedWorkspaces(repositoryWorkspaces, [], Purpose.Deploy).keys()].map(outputName).sort();

  assert.deepEqual(services, setups);
});

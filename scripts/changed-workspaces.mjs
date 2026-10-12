#!/usr/bin/env node
/**
 * @file Which workspaces a change affects, for the CI's validation and deploy
 * jobs.
 *
 * Usage: `node scripts/changed-workspaces.mjs <validate|deploy> <base> <head>`
 *
 * Prints one `name=true` or `name=false` line per workspace, ready to append
 * to `$GITHUB_OUTPUT`. The name is the package name without `@musiccloud/`,
 * with `-` written as `_` (`dashboard_ui`).
 *
 * Everything the answer depends on comes from the workspace manifests: a
 * workspace is affected when one of its files changed or when a workspace it
 * depends on is affected. A base that is empty, all zeros or unknown to this
 * checkout means the whole tree changed, which is the first push of a branch
 * or a history rewritten under it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** What the answer is for. */
export const Purpose = {
  /** Which workspaces the CI type-checks and tests. */
  Validate: "validate",
  /** Which services the CI deploys. */
  Deploy: "deploy",
};

/** The scope every reported workspace belongs to. */
const SCOPE = "@musiccloud/";

/** The folder of the deployable workspaces, whose names are the `setup:` names in `zerops.yml`. */
const SERVICES_FOLDER = "apps";

/** Root files that every workspace builds from, whatever the purpose. */
const SHARED_ROOT_FILES = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];

/** A root TypeScript configuration, which every workspace's configuration extends. */
const ROOT_TSCONFIG = /^tsconfig[^/]*\.json$/;

/** Root files that change how every workspace is validated. */
const VALIDATION_FILES = [".github/workflows/ci.yml", ".github/workflows/deploy-service.yml"];

/** Root files that change how every service is deployed. */
const DEPLOYMENT_FILES = ["zerops.yml"];

/**
 * Dependencies that no manifest declares, as package name to the packages
 * whose build reads it.
 *
 * The developer portal's build exports the backend's OpenAPI document
 * (`apps/developer/scripts/generate-api-reference.mjs`), so a backend change
 * changes the portal. It counts for what a change affects and not for what a
 * workspace builds against, so a portal change does not validate the backend.
 */
const UNDECLARED_DEPENDENTS = {
  "@musiccloud/backend": ["@musiccloud/developer"],
};

/** The SHA git uses for a ref that did not exist before a push. */
const ZERO_SHA = /^0+$/;

/**
 * One workspace of the repository.
 *
 * @typedef {object} Workspace
 * @property {string} name - The package name, such as `@musiccloud/backend`.
 * @property {string} folder - Its folder relative to the repository root, such as `apps/backend`.
 * @property {string[]} dependencies - The workspace packages it declares a `workspace:` dependency on.
 */

/**
 * Reads the workspaces `pnpm-workspace.yaml` lists.
 *
 * @param {string} root - The repository root.
 * @returns {Workspace[]} Every folder with a `package.json` under the listed globs.
 */
export function readWorkspaces(root) {
  const globs = [...readFileSync(join(root, "pnpm-workspace.yaml"), "utf8").matchAll(/^\s*-\s*"?([^"\n]+?)\/\*"?\s*$/gm)].map(
    (match) => match[1],
  );
  return globs.flatMap((parent) =>
    readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, parent, entry.name, "package.json")))
      .map((entry) => {
        const manifest = JSON.parse(readFileSync(join(root, parent, entry.name, "package.json"), "utf8"));
        const declared = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
        return {
          name: manifest.name,
          folder: `${parent}/${entry.name}`,
          dependencies: Object.keys(declared).filter((name) => String(declared[name]).startsWith("workspace:")),
        };
      }),
  );
}

/**
 * The files that changed between two commits, or every tracked file when the
 * base cannot be compared.
 *
 * @param {string} root - The repository root.
 * @param {string} base - The base commit, possibly empty or all zeros.
 * @param {string} head - The head commit.
 * @returns {string[]} Paths relative to the repository root.
 */
export function changedFiles(root, base, head) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const usableBase =
    base !== "" &&
    !ZERO_SHA.test(base) &&
    (() => {
      try {
        git("cat-file", "-e", `${base}^{commit}`);
        return true;
      } catch {
        return false;
      }
    })();
  const listing = usableBase ? git("diff", "--name-only", base, head) : git("ls-tree", "-r", "--name-only", head);
  return listing.split("\n").filter(Boolean);
}

/** Whether a change to this root file reaches every workspace for the purpose. */
function reachesEveryWorkspace(file, purpose) {
  if (SHARED_ROOT_FILES.includes(file) || ROOT_TSCONFIG.test(file)) return true;
  return purpose === Purpose.Validate ? VALIDATION_FILES.includes(file) : DEPLOYMENT_FILES.includes(file);
}

/**
 * Decides, per workspace, whether a change affects it for the purpose.
 *
 * `validate` reports every `@musiccloud/` workspace, and adds the workspaces
 * an affected one builds against, because their output has to exist and type
 * check before it does. `deploy` reports the workspaces under `apps/`.
 *
 * @param {Workspace[]} workspaces - The repository's workspaces.
 * @param {string[]} files - The changed files.
 * @param {string} purpose - A {@link Purpose} value.
 * @returns {Map<string, boolean>} Package name to whether it is affected, for the reported workspaces.
 */
export function affectedWorkspaces(workspaces, files, purpose) {
  const affected = new Set();
  if (files.some((file) => reachesEveryWorkspace(file, purpose))) {
    for (const workspace of workspaces) affected.add(workspace.name);
  }
  for (const workspace of workspaces) {
    if (files.some((file) => file.startsWith(`${workspace.folder}/`))) affected.add(workspace.name);
  }

  const dependents = (name) => [
    ...workspaces.filter((workspace) => workspace.dependencies.includes(name)).map((workspace) => workspace.name),
    ...(UNDECLARED_DEPENDENTS[name] ?? []),
  ];
  const pending = [...affected];
  while (pending.length > 0) {
    for (const dependent of dependents(pending.pop())) {
      if (!affected.has(dependent)) {
        affected.add(dependent);
        pending.push(dependent);
      }
    }
  }

  if (purpose === Purpose.Validate) {
    const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
    const builtAgainst = [...affected];
    while (builtAgainst.length > 0) {
      for (const dependency of byName.get(builtAgainst.pop())?.dependencies ?? []) {
        if (!affected.has(dependency)) {
          affected.add(dependency);
          builtAgainst.push(dependency);
        }
      }
    }
  }

  const reported = workspaces.filter((workspace) =>
    purpose === Purpose.Validate
      ? workspace.name.startsWith(SCOPE)
      : workspace.folder.startsWith(`${SERVICES_FOLDER}/`),
  );
  return new Map(reported.map((workspace) => [workspace.name, affected.has(workspace.name)]));
}

/**
 * The output name of a workspace: its package name without the scope, with
 * `-` written as `_`, because GitHub expressions read a `-` as subtraction.
 *
 * @param {string} name - The package name.
 * @returns {string} The name used in `$GITHUB_OUTPUT`.
 */
export function outputName(name) {
  return name.replace(SCOPE, "").replaceAll("-", "_");
}

function main() {
  const [purpose, base = "", head] = process.argv.slice(2);
  if (!Object.values(Purpose).includes(purpose) || !head) {
    console.error("Usage: node scripts/changed-workspaces.mjs <validate|deploy> <base> <head>");
    process.exit(2);
  }
  const root = relative(process.cwd(), fileURLToPath(new URL("..", import.meta.url))) || ".";
  const affected = affectedWorkspaces(readWorkspaces(root), changedFiles(root, base, head), purpose);
  for (const [name, isAffected] of affected) console.log(`${outputName(name)}=${isAffected}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

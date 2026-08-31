import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

/**
 * Slices one job out of the workflow by name. Using the next job's own header
 * as the end marker keeps these assertions from being rewritten every time an
 * unrelated job is added or removed between them.
 */
function job(name) {
  const start = workflow.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `workflow has no job named ${name}`);
  const next = workflow.slice(start + 1).search(/^ {2}[a-z][a-z0-9-]*:$/m);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

test("uses read-only GITHUB_TOKEN permissions with one scoped job exception", () => {
  const workflowPrelude = workflow.slice(0, workflow.indexOf("\njobs:\n"));
  const detectChangesJob = job("detect-changes");
  const deployJobs = workflow.slice(workflow.indexOf("  deploy-backend:"));
  const jobLevelPermissionBlocks = workflow.match(/^ {4}permissions:\n(?:^ {6}[a-z-]+: (?:read|write)\n?)+/gm) ?? [];

  assert.match(workflowPrelude, /\npermissions:\n {2}contents: read\n$/);
  assert.equal(jobLevelPermissionBlocks.length, 1);
  assert.match(detectChangesJob, /permissions:\n {6}contents: read\n {6}actions: read\n/);
  assert.doesNotMatch(detectChangesJob, /^ {6}[a-z-]+: write$/m);
  // Nothing writes to the repository any more, so no job may ask for it.
  assert.equal((workflow.match(/^\s+contents: write$/gm) ?? []).length, 0);
  assert.doesNotMatch(deployJobs, /^ {4}permissions:/m);
  assert.doesNotMatch(deployJobs, /\$\{\{ github\.token \}\}/);
  assert.match(deployJobs, /STATUS_TOKEN: \$\{\{ secrets\.STATUS_DISPATCH_TOKEN \}\}/);
  assert.match(deployJobs, /ZEROPS_TOKEN: \$\{\{ secrets\.ZEROPS_TOKEN \}\}/);
});

test("carries no SDK generation", () => {
  assert.doesNotMatch(workflow, /sdk/i);
});

test("verifies the public backend health endpoint after a backend deploy", () => {
  assert.match(
    job("deploy-backend"),
    /\.\/scripts\/zerops-deploy\.sh vftiwXaYQGCnnwEEaiGPYA[\s\S]*?curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 3 https:\/\/api\.musiccloud\.io\/health\/backend/,
  );
});

test("probes every deployed host, because Zerops confirms the artifact and not the process", () => {
  for (const [name, host] of [
    ["deploy-frontend", "https://musiccloud.io/"],
    ["deploy-developer", "https://developer.musiccloud.io/"],
    ["deploy-dashboard", "https://dashboard.musiccloud.io/"],
  ]) {
    assert.match(job(name), new RegExp(`curl --fail[^\\n]*${host.replace(/[/.]/g, "\\$&")}`), name);
  }
});

test("deploys the developer site without waiting on anything but its own change detection", () => {
  const developerJob = job("deploy-developer");

  assert.match(developerJob, /needs: detect-changes/);
  assert.match(developerJob, /if: needs\.detect-changes\.outputs\.developer == 'true'/);
});

test("does not deploy the dashboard for backend-only or CI-only changes", () => {
  const dashboardCase =
    job("detect-changes").match(/case "\$file" in\n(?:(?!case "\$file" in)[\s\S])*?dashboard=true ;;/)?.[0] ?? "";

  assert.doesNotMatch(dashboardCase, /apps\/backend\/\*|\.github\/workflows\/ci\.yml/);
});

test("takes the deployment diff base from a successful push run", () => {
  // The baseline is the last green run on main. Only a push run deploys, so
  // only a push run may serve as the mark for what has already been deployed.
  assert.match(job("detect-changes"), /--event push/);
});

test("validates only affected workspaces after early path detection", () => {
  const validationDetectionJob = job("detect-validation-changes");
  const typecheckJob = job("typecheck");

  assert.match(validationDetectionJob, /if: always\(\)/);
  assert.match(validationDetectionJob, /github\.event\.pull_request\.base\.sha/);
  assert.match(validationDetectionJob, /PUSH_BEFORE_SHA: \$\{\{ github\.event\.before \}\}/);
  assert.match(validationDetectionJob, /shared=true/);
  assert.match(validationDetectionJob, /dashboard_ui=true/);
  assert.match(typecheckJob, /needs: detect-validation-changes/);
  assert.doesNotMatch(typecheckJob, /needs: lint/);
  assert.match(typecheckJob, /outputs\.backend == 'true'/);
  assert.match(typecheckJob, /outputs\.frontend == 'true'/);
  assert.match(typecheckJob, /outputs\.developer == 'true'/);
  // The portal's API reference is generated from the exported contract, which
  // needs the shared package built first.
  assert.match(
    typecheckJob,
    /- name: Generate developer API reference[\s\S]*?pnpm --filter @musiccloud\/developer run prebuild[\s\S]*?- name: Developer[\s\S]*?pnpm --filter @musiccloud\/developer typecheck/,
  );
  assert.match(typecheckJob, /- name: Build shared package[\s\S]*?- name: Generate developer API reference/);
  assert.match(typecheckJob, /outputs\.dashboard == 'true'/);
  assert.match(typecheckJob, /outputs\.dashboard_ui == 'true'/);
  assert.match(
    typecheckJob,
    /node --test scripts\/ci-workflow\.test\.mjs scripts\/zerops-deploy\.test\.mjs scripts\/readme-links\.test\.mjs/,
  );
  assert.match(typecheckJob, /needs\.detect-validation-changes\.outputs\.shared == 'true'/);
});

test("restores the pnpm store before every dependency installation", () => {
  for (const name of ["lint", "typecheck"]) {
    assert.match(
      job(name),
      /- name: Restore pnpm store[\s\S]*?uses: actions\/cache@v4[\s\S]*?path: ~\/\.local\/share\/pnpm\/store[\s\S]*?pnpm install --frozen-lockfile/,
      name,
    );
  }
});

test("keeps CI independent from the removed project-local app runner", async () => {
  const typecheckJob = job("typecheck");

  assert.match(
    typecheckJob,
    /- name: Workflow and deployment contracts[\s\S]*?node --test scripts\/ci-workflow\.test\.mjs scripts\/zerops-deploy\.test\.mjs scripts\/readme-links\.test\.mjs/,
  );
  assert.doesNotMatch(typecheckJob, /\bapp(?:\.test\.mjs)?\b/);
  await assert.rejects(access(new URL("../app", import.meta.url)));
});

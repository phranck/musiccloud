import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const deployService = await readFile(new URL("../.github/workflows/deploy-service.yml", import.meta.url), "utf8");
const zerops = await readFile(new URL("../zerops.yml", import.meta.url), "utf8");

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
  // Every deploy job hands its secrets to the one deploy workflow, which reads
  // the deploy token and never the GITHUB_TOKEN.
  assert.equal((deployJobs.match(/^ {4}uses: \.\/\.github\/workflows\/deploy-service\.yml$/gm) ?? []).length, 4);
  assert.equal((deployJobs.match(/^ {4}secrets: inherit$/gm) ?? []).length, 4);
  assert.match(deployService, /\npermissions:\n {2}contents: read\n/);
  assert.doesNotMatch(deployService, /\$\{\{ github\.token \}\}/);
  assert.match(deployService, /ZEROPS_TOKEN: \$\{\{ secrets\.ZEROPS_TOKEN \}\}/);
});

test("carries no SDK generation", () => {
  assert.doesNotMatch(workflow, /sdk/i);
});

test("verifies the public backend health endpoint after a backend deploy", () => {
  const backendJob = job("deploy-backend");

  assert.match(backendJob, /host: api\.musiccloud\.io\n/);
  assert.match(backendJob, /probe-paths: \/health\/backend\n/);
  assert.match(backendJob, /zerops-service-id: vftiwXaYQGCnnwEEaiGPYA\n/);
});

test("probes every deployed host, because Zerops confirms the artifact and not the process", () => {
  for (const [name, host] of [
    ["deploy-frontend", "musiccloud.io"],
    ["deploy-developer", "developer.musiccloud.io"],
    ["deploy-dashboard", "dashboard.musiccloud.io"],
  ]) {
    assert.match(job(name), new RegExp(`host: ${host.replace(/\./g, "\\.")}\\n[\\s\\S]*?probe-paths: \\/`), name);
  }
  // The deploy runs, then every named path has to answer.
  assert.match(
    deployService,
    /\.\/scripts\/zerops-deploy\.sh "\$ZEROPS_SERVICE_ID"[\s\S]*?for path in \$PROBE_PATHS; do\n\s*curl --fail --silent --show-error --output \/dev\/null --retry 10 --retry-all-errors --retry-delay 3 "https:\/\/\$\{HOST\}\$\{path\}"/,
  );
});

test("deploys the developer site without waiting on anything but its own change detection", () => {
  const developerJob = job("deploy-developer");

  assert.match(developerJob, /needs: detect-changes/);
  assert.match(developerJob, /if: needs\.detect-changes\.outputs\.developer == 'true'/);
});

test("deploys the dashboard again after every backend deploy, because its nginx keeps the backend's address", () => {
  const dashboardJob = job("deploy-dashboard");

  assert.match(dashboardJob, /needs: \[detect-changes, deploy-backend\]/);
  const condition = dashboardJob.match(/^ {4}if: (.*)$/m)?.[1] ?? "";
  // A backend that deployed is enough on its own, whatever changed.
  assert.match(condition, /needs\.deploy-backend\.result == 'success' \|\|/);
  // Without a backend deploy, only a dashboard change deploys it.
  assert.match(
    condition,
    /\(needs\.deploy-backend\.result == 'skipped' && needs\.detect-changes\.outputs\.dashboard == 'true'\)/,
  );
});

test("probes the dashboard's proxy to the backend, not only its static page", () => {
  assert.match(job("deploy-dashboard"), /probe-paths: \/ \/api\/admin\/auth\/setup-status\n/);
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
  assert.match(validationDetectionJob, /node scripts\/changed-workspaces\.mjs validate /);
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
  assert.match(typecheckJob, /node --test scripts\/\*\.test\.mjs/);
  assert.match(typecheckJob, /needs\.detect-validation-changes\.outputs\.shared == 'true'/);
});

test("runs the backend's integration tests against a database of the job's own", () => {
  const typecheckJob = job("typecheck");

  assert.match(typecheckJob, /services:\n {6}postgres:\n {8}image: postgres:18\n/);
  assert.match(typecheckJob, /POSTGRES_DB: musiccloud_test/);
  assert.match(typecheckJob, /TEST_DATABASE_URL: postgresql:\/\/musiccloud@localhost:5432\/musiccloud_test/);
  // The schema has to exist before the tests that read it, and the migration
  // runner reads DATABASE_URL, which it gets for that one step only.
  assert.match(
    typecheckJob,
    /- name: Migrate the integration database[\s\S]*?DATABASE_URL: \$\{\{ env\.TEST_DATABASE_URL \}\}[\s\S]*?run: pnpm db:migrate[\s\S]*?- name: Backend tests/,
  );
  assert.equal((typecheckJob.match(/^\s+DATABASE_URL:/gm) ?? []).length, 1);
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
    /- name: Workflow and deployment contracts[\s\S]*?node --test scripts\/\*\.test\.mjs/,
  );
  assert.doesNotMatch(typecheckJob, /\bapp(?:\.test\.mjs)?\b/);
  await assert.rejects(access(new URL("../app", import.meta.url)));
});

test("derives both change maps from the workspace graph, with no hand-written path list", () => {
  assert.doesNotMatch(workflow, /case "\$file" in/);
  assert.match(job("detect-changes"), /node scripts\/changed-workspaces\.mjs deploy /);
});

/**
 * Corepack runs the version `packageManager` names in package.json. A second
 * statement of it is a second answer that can drift from the first.
 */
test("names the pnpm version in package.json alone", () => {
  for (const [file, text] of [
    ["ci.yml", workflow],
    ["deploy-service.yml", deployService],
    ["zerops.yml", zerops],
  ]) {
    assert.doesNotMatch(text, /pnpm@\d/, file);
  }
});

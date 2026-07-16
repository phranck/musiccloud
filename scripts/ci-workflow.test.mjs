import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("uses read-only GITHUB_TOKEN permissions with two scoped job exceptions", () => {
  const workflowPrelude = workflow.slice(0, workflow.indexOf("\njobs:\n"));
  const detectChangesJob = workflow.slice(
    workflow.indexOf("  detect-changes:"),
    workflow.indexOf("  validate-api-sdk-contract:"),
  );
  const publishJob = workflow.slice(
    workflow.indexOf("  publish-api-sdks:"),
    workflow.indexOf("  deploy-backend:"),
  );
  const deployJobs = workflow.slice(workflow.indexOf("  deploy-backend:"));
  const jobLevelPermissionBlocks = workflow.match(/^    permissions:\n(?:^      [a-z-]+: (?:read|write)\n?)+/gm) ?? [];
  const contentsWritePermissions = workflow.match(/^\s+contents: write$/gm) ?? [];

  assert.match(workflowPrelude, /\npermissions:\n  contents: read\n$/);
  assert.equal(jobLevelPermissionBlocks.length, 2);
  assert.match(detectChangesJob, /permissions:\n      contents: read\n      actions: read\n/);
  assert.doesNotMatch(detectChangesJob, /^      [a-z-]+: write$/m);
  assert.match(publishJob, /permissions:\n      contents: write\n    outputs:/);
  assert.equal(contentsWritePermissions.length, 1);
  assert.doesNotMatch(deployJobs, /^    permissions:/m);
  assert.doesNotMatch(deployJobs, /\$\{\{ github\.token \}\}/);
  assert.match(deployJobs, /STATUS_TOKEN: \$\{\{ secrets\.STATUS_DISPATCH_TOKEN \}\}/);
  assert.match(deployJobs, /ZEROPS_TOKEN: \$\{\{ secrets\.ZEROPS_TOKEN \}\}/);
});

test("builds the shared package before every CI OpenAPI export", () => {
  const validationJob = workflow.slice(
    workflow.indexOf("  validate-api-sdk-contract:"),
    workflow.indexOf("  publish-api-sdks:"),
  );
  const publishJob = workflow.slice(workflow.indexOf("  publish-api-sdks:"));

  for (const job of [validationJob, publishJob]) {
    assert.match(
      job,
      /- name: Install dependencies[\s\S]*?- name: Build shared package[\s\S]*?pnpm --filter @musiccloud\/shared build[\s\S]*?pnpm openapi:export/,
    );
  }
});

test("verifies the public backend health endpoint after a backend deploy", () => {
  const backendJob = workflow.slice(
    workflow.indexOf("  deploy-backend:"),
    workflow.indexOf("  deploy-frontend:"),
  );

  assert.match(
    backendJob,
    /\.\/scripts\/zerops-deploy\.sh vftiwXaYQGCnnwEEaiGPYA[\s\S]*?curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 3 https:\/\/api\.musiccloud\.io\/health\/backend/,
  );
});

test("reuses an immutable SDK release when its OpenAPI contract is unchanged", () => {
  const publishJob = workflow.slice(
    workflow.indexOf("  publish-api-sdks:"),
    workflow.indexOf("  deploy-backend:"),
  );

  assert.match(
    publishJob,
    /for \(const field of \["apiVersion", "openApiSha256", "generatorVersion"\]\)/,
  );
  assert.doesNotMatch(
    publishJob,
    /for \(const field of \[[^\]]*"sourceSha"[^\]]*\]\)/,
  );
});

test("does not deploy the dashboard for backend-only or CI-only changes", () => {
  const detectChangesJob = workflow.slice(
    workflow.indexOf("  detect-changes:"),
    workflow.indexOf("  validate-api-sdk-contract:"),
  );
  const dashboardCase =
    detectChangesJob.match(/case "\$file" in\n(?:(?!case "\$file" in)[\s\S])*?dashboard=true ;;/)?.[0] ?? "";

  assert.doesNotMatch(dashboardCase, /apps\/backend\/\*|\.github\/workflows\/ci\.yml/);
});

test("keeps CI independent from the removed project-local app runner", async () => {
  const typecheckJob = workflow.slice(
    workflow.indexOf("  typecheck:"),
    workflow.indexOf("  detect-changes:"),
  );

  assert.match(
    typecheckJob,
    /- name: Workflow and deployment contracts[\s\S]*?node --test scripts\/ci-workflow\.test\.mjs scripts\/zerops-deploy\.test\.mjs[\s\S]*?- name: Workspace tests[\s\S]*?pnpm -r --if-present test:run/,
  );
  assert.doesNotMatch(typecheckJob, /\bapp(?:\.test\.mjs)?\b/);
  await assert.rejects(access(new URL("../app", import.meta.url)));
});

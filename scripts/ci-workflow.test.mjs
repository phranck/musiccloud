import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

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
    /zcli push --serviceId vftiwXaYQGCnnwEEaiGPYA[\s\S]*?curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 3 https:\/\/api\.musiccloud\.io\/health\/backend/,
  );
});

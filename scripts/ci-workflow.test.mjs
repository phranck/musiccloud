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

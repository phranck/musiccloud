import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import test from "node:test";

const execFileAsync = promisify(execFile);
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const localLinks = [...readme.matchAll(/\[[^\]]+\]\((?!https?:|mailto:|#)([^)#]+)(?:#[^)]+)?\)/g)].map(
  ([, target]) => target.replace(/\/$/, ""),
);

test("keeps every local README link in Git", async () => {
  for (const target of localLinks) {
    await assert.doesNotReject(execFileAsync("git", ["ls-files", "--error-unmatch", "--", target]));
  }
});

test("keeps the Resolver Flow landing page and both language PDFs in Git", async () => {
  for (const target of [
    "docs/resolve-flow/README.md",
    "docs/resolve-flow/de/resolve-flow.pdf",
    "docs/resolve-flow/en/resolve-flow.pdf",
  ]) {
    await assert.doesNotReject(execFileAsync("git", ["ls-files", "--error-unmatch", "--", target]));
  }
});

#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractRoot = path.join(repoRoot, "sdk/error-contract");
const phpImage = "php:8.3-cli@sha256:2a3f699b6cb31e5638c5432e4d37d4047853ba6351a692c91e0a073af00a55cc";
const python39Image = "python:3.9.23-slim@sha256:151b796af055298f244bc4d203bc19e19b0e63c8aa26c4fed2fc6809ea9b7caf";

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} failed (${signal ?? `exit ${code}`}).`));
      }
    });
  });
}

await run(process.execPath, [
  "--experimental-strip-types",
  "--test",
  path.join(contractRoot, "typescript/musiccloud-errors.test.ts"),
]);
await run("python3", ["-m", "unittest", "discover", "-s", "sdk/error-contract/python", "-p", "test_*.py"], {
  env: {
    ...process.env,
    PYTHONPATH: path.join(contractRoot, "python"),
  },
});
await run("docker", [
  "run",
  "--rm",
  "-v",
  `${repoRoot}:/workspace:ro`,
  "-w",
  "/workspace",
  "-e",
  "PYTHONPATH=/workspace/sdk/error-contract/python",
  python39Image,
  "python",
  "-B",
  "-m",
  "unittest",
  "discover",
  "-s",
  "sdk/error-contract/python",
  "-p",
  "test_*.py",
]);
await run("swift", ["test", "--package-path", path.join(contractRoot, "swift")]);
await run("docker", [
  "run",
  "--rm",
  "-v",
  `${repoRoot}:/workspace:ro`,
  "-w",
  "/workspace",
  phpImage,
  "php",
  "-l",
  "sdk/error-contract/php/MusiccloudErrors.php",
]);
await run("docker", [
  "run",
  "--rm",
  "-v",
  `${repoRoot}:/workspace:ro`,
  "-w",
  "/workspace",
  phpImage,
  "php",
  "sdk/error-contract/php/MusiccloudErrorsTest.php",
]);
await run("go", ["test", "./..."], { cwd: path.join(contractRoot, "go") });

console.log("Five-language MusicCloud SDK error contract passed.");

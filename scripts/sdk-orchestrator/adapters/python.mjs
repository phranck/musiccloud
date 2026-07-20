import crypto from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assembleOwnedInputs,
  assertAdapterTarget,
  copyCandidate,
  copyFileInto,
  exists,
  findFiles,
  repoPath,
  resetScratch,
  runCommand,
  writeJson,
} from "./common.mjs";

const language = "python";
const adapterId = "openapi-python-client-0-29";

async function ensureGenerator(target) {
  const toolDir = repoPath(".tmp/sdk-tools/openapi-python-client-0.29.0");
  const binary = path.join(toolDir, "bin/openapi-python-client");
  if (!(await exists(binary))) {
    await rm(toolDir, { recursive: true, force: true });
    await runCommand("generator bootstrap: Python virtual environment", "python3", ["-m", "venv", toolDir]);
    const downloadDir = repoPath(".tmp/sdk-tools/downloads/openapi-python-client-0.29.0");
    await rm(downloadDir, { recursive: true, force: true });
    await runCommand("generator bootstrap: pinned Python wheel", path.join(toolDir, "bin/pip"), [
      "download",
      "--no-deps",
      "--only-binary=:all:",
      "--dest",
      downloadDir,
      "openapi-python-client==0.29.0",
    ]);
    const wheels = await findFiles(downloadDir, (filePath) => filePath.endsWith(".whl"));
    if (wheels.length !== 1) throw new Error("Pinned Python generator download did not produce exactly one wheel.");
    const digest = crypto
      .createHash("sha256")
      .update(await readFile(wheels[0]))
      .digest("hex");
    if (digest !== target.generator.artifact.digest) {
      throw new Error(`Pinned Python generator wheel digest mismatch: ${digest}.`);
    }
    await runCommand("generator bootstrap: install pinned Python wheel", path.join(toolDir, "bin/pip"), [
      "install",
      wheels[0],
    ]);
  }
  return { binary, python: path.join(toolDir, "bin/python") };
}

export const pythonAdapter = {
  language,
  adapterId,
  async generate({ candidateDir, contract, release, target }) {
    assertAdapterTarget(target, language, adapterId);
    const scratch = await resetScratch(target);
    const tool = await ensureGenerator(target);
    const configPath = repoPath(".tmp/sdk-candidates/python-generator-config.json");
    await writeJson(configPath, target.configuration);
    await runCommand(`generator invocation from ${contract.openApiPath}`, tool.binary, [
      "generate",
      "--path",
      contract.openApiPath,
      "--config",
      configPath,
      "--output-path",
      path.join(scratch, "package"),
      "--overwrite",
      "--meta",
      "setup",
      "--fail-on-warning",
    ]);
    await copyFileInto(
      "sdk/error-contract/python/musiccloud_errors.py",
      path.join(scratch, "package/musiccloud/musiccloud_errors.py"),
    );
    const packageInit = path.join(scratch, "package/musiccloud/__init__.py");
    const existingInit = await readFile(packageInit, "utf8");
    await writeFile(
      packageInit,
      `${existingInit.trimEnd()}\nfrom .musiccloud_errors import MusiccloudApiError, MusiccloudErrorCode, MusiccloudProtocolError, MusiccloudTransportError\n`,
    );
    await assembleOwnedInputs(scratch, target, release);
    await runCommand("native gate: install generated Python package", path.join(path.dirname(tool.python), "pip"), [
      "install",
      "--force-reinstall",
      path.join(scratch, "package"),
    ]);
    await runCommand("native gate: compile generated Python package", tool.python, [
      "-m",
      "compileall",
      "-q",
      path.join(scratch, "package/musiccloud"),
    ]);
    await runCommand("native gate: import generated Python package", tool.python, ["-c", "import musiccloud"]);
    await runCommand("native gate: Python golden usage syntax", tool.python, [
      "-m",
      "py_compile",
      repoPath(target.goldenUsage),
    ]);
    await copyCandidate(scratch, candidateDir);
  },
};

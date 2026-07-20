import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assembleOwnedInputs,
  assertAdapterTarget,
  copyCandidate,
  copyFileInto,
  exists,
  repoPath,
  replaceOrVerify,
  resetScratch,
  runCommand,
} from "./common.mjs";

const language = "swift";
const adapterId = "swift-openapi-generator-1-13";

async function ensureGenerator(target) {
  const toolDir = repoPath(".tmp/sdk-tools/swift-openapi-generator-1.13.0");
  if (!(await exists(path.join(toolDir, ".git")))) {
    await rm(toolDir, { recursive: true, force: true });
    await runCommand("generator bootstrap: clone pinned Swift generator", "git", [
      "clone",
      "--branch",
      "1.13.0",
      "--depth",
      "1",
      target.generator.source,
      toolDir,
    ]);
  }
  const head = (
    await runCommand("generator bootstrap: verify Swift generator commit", "git", ["rev-parse", "HEAD"], {
      cwd: toolDir,
    })
  ).stdout.trim();
  if (head !== target.generator.artifact.digest) {
    throw new Error(`Pinned Swift generator commit mismatch: ${head}.`);
  }
  const binary = path.join(toolDir, ".build/release/swift-openapi-generator");
  if (!(await exists(binary))) {
    await runCommand(
      "generator bootstrap: build pinned Swift generator",
      "swift",
      ["build", "-c", "release", "--product", "swift-openapi-generator"],
      { cwd: toolDir },
    );
  }
  return binary;
}

export const swiftAdapter = {
  language,
  adapterId,
  async generate({ candidateDir, contract, release, target }) {
    assertAdapterTarget(target, language, adapterId);
    const scratch = await resetScratch(target);
    const preparedContract = repoPath(".tmp/sdk-candidates/contracts/swift.json");
    await runCommand(`contract adapter from ${contract.openApiPath}`, "node", [
      target.inputs.contractAdapter,
      "--input",
      contract.openApiPath,
      "--output",
      preparedContract,
      "--adapter",
      "swift",
    ]);
    const generator = await ensureGenerator(target);
    await copyFileInto("sdk/generator-profiles/harnesses/swift/Package.swift", path.join(scratch, "Package.swift"));
    const packageManifestPath = path.join(scratch, "Package.swift");
    const candidateManifest = await readFile(packageManifestPath, "utf8");
    const namedManifest = replaceOrVerify(
      candidateManifest,
      'name: "MusicCloudSwiftGeneratorCandidate"',
      `name: "${target.package.name}"`,
      "package assembly: Swift package name",
    );
    const packageManifest = replaceOrVerify(
      namedManifest,
      '"MusicCloudGenerated"',
      `"${target.package.module}"`,
      "package assembly: Swift module name",
      { all: true },
    );
    await writeFile(packageManifestPath, packageManifest);
    await runCommand(`generator invocation from ${preparedContract}`, generator, [
      "generate",
      preparedContract,
      "--config",
      repoPath("sdk/generator-profiles/harnesses/swift/swift-openapi-generator-config.yaml"),
      "--output-directory",
      path.join(scratch, "generated"),
    ]);
    await copyFileInto(
      "sdk/error-contract/swift/Sources/MusiccloudErrors/MusiccloudErrors.swift",
      path.join(scratch, "generated/MusiccloudErrors.swift"),
    );
    await assembleOwnedInputs(scratch, target, release);
    await runCommand("native gate: Swift package build", "swift", ["build", "--package-path", scratch]);
    await runCommand("native gate: Swift golden usage typecheck", "swiftc", [
      "-typecheck",
      repoPath(target.goldenUsage),
    ]);
    await copyCandidate(scratch, candidateDir);
  },
};

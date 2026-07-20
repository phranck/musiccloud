import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assembleOwnedInputs,
  assertAdapterTarget,
  copyCandidate,
  copyFileInto,
  repoPath,
  replaceOrVerify,
  resetScratch,
  runCommand,
} from "./common.mjs";

const language = "go";
const adapterId = "ogen-1-23";

export const goAdapter = {
  language,
  adapterId,
  async generate({ candidateDir, contract, release, target }) {
    assertAdapterTarget(target, language, adapterId);
    const scratch = await resetScratch(target);
    const preparedContract = repoPath(".tmp/sdk-candidates/contracts/go.json");
    await runCommand(`contract adapter from ${contract.openApiPath}`, "node", [
      target.inputs.contractAdapter,
      "--input",
      contract.openApiPath,
      "--output",
      preparedContract,
      "--adapter",
      "go",
    ]);
    await copyFileInto("sdk/generator-profiles/harnesses/go/go.mod", path.join(scratch, "go.mod"));
    const goModPath = path.join(scratch, "go.mod");
    const goMod = replaceOrVerify(
      await readFile(goModPath, "utf8"),
      "module example.com/musiccloud-sdk-candidate",
      `module ${target.package.name}`,
      "package assembly: Go module path",
    );
    await writeFile(goModPath, goMod);
    await runCommand(`generator invocation from ${preparedContract}`, "go", [
      "run",
      "github.com/ogen-go/ogen/cmd/ogen@v1.23.0",
      "-clean",
      "-package",
      "generated",
      "-target",
      path.join(scratch, "internal/generated"),
      preparedContract,
    ]);
    await copyFileInto(
      "sdk/error-contract/go/musiccloud_errors.go",
      path.join(scratch, "musicclouderrors/musiccloud_errors.go"),
    );
    await copyFileInto(target.goldenUsage, path.join(scratch, "examples/usage.go"));
    await assembleOwnedInputs(scratch, target, release);
    await runCommand("native gate: Go module resolution", "go", ["mod", "tidy"], { cwd: scratch });
    await runCommand("native gate: Go tests", "go", ["test", "./..."], { cwd: scratch });
    await runCommand("native gate: Go vet", "go", ["vet", "./..."], { cwd: scratch });
    await copyCandidate(scratch, candidateDir);
  },
};

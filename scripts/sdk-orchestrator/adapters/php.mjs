import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  assembleOwnedInputs,
  assertAdapterTarget,
  copyCandidate,
  copyFileInto,
  repoPath,
  repoRoot,
  resetScratch,
  runCommand,
  writeJson,
} from "./common.mjs";

const language = "php";
const adapterId = "jane-openapi-7-12";
const composerImage = "composer:2.8.12@sha256:5248900ab8b5f7f880c2d62180e40960cd87f60149ec9a1abfd62ac72a02577c";

function dockerArgs(entrypoint, commandArgs) {
  const dockerUser = `${process.getuid()}:${process.getgid()}`;
  return [
    "run",
    "--rm",
    "--user",
    dockerUser,
    "--env",
    "COMPOSER_HOME=/tmp/composer",
    "--volume",
    `${repoRoot}:/workspace`,
    "--workdir",
    "/workspace",
    ...(entrypoint ? ["--entrypoint", entrypoint] : []),
    composerImage,
    ...commandArgs,
  ];
}

function containerPath(hostPath) {
  const relative = path.relative(repoRoot, hostPath);
  if (relative.startsWith("..")) throw new Error(`PHP adapter path is outside the repository: ${hostPath}`);
  return `/workspace/${relative}`;
}

export const phpAdapter = {
  language,
  adapterId,
  async generate({ candidateDir, contract, release, target }) {
    assertAdapterTarget(target, language, adapterId);
    const scratch = await resetScratch(target);
    await Promise.all([
      copyFileInto("sdk/generator-profiles/harnesses/php/composer.json", path.join(scratch, "composer.json")),
      copyFileInto("sdk/generator-profiles/harnesses/php/composer.lock", path.join(scratch, "composer.lock")),
      copyFileInto("sdk/generator-profiles/harnesses/php/jane-openapi.php", path.join(scratch, "jane-openapi.php")),
    ]);
    const composerPath = path.join(scratch, "composer.json");
    const preparedContract = repoPath(".tmp/sdk-candidates/contracts/php.json");
    await mkdir(path.dirname(preparedContract), { recursive: true });
    await copyFile(contract.openApiPath, preparedContract);
    await runCommand(
      "generator bootstrap: pinned Composer dependencies",
      "docker",
      dockerArgs(null, ["install", `--working-dir=${containerPath(scratch)}`, "--no-interaction", "--no-progress"]),
    );
    await runCommand(
      `generator invocation from ${preparedContract}`,
      "docker",
      dockerArgs("php", [
        `${containerPath(scratch)}/vendor/bin/jane-openapi`,
        "generate",
        `--config-file=${containerPath(path.join(scratch, "jane-openapi.php"))}`,
      ]),
    );
    await copyFileInto("sdk/error-contract/php/MusiccloudErrors.php", path.join(scratch, "src/MusiccloudErrors.php"));
    await writeJson(composerPath, {
      name: target.package.name,
      description: "Preview musiccloud PHP SDK generated from the public OpenAPI contract.",
      type: "library",
      license: "MIT",
      require: {
        php: target.runtime.constraint,
        "jane-php/open-api-runtime": "^7.12",
      },
      autoload: {
        "psr-4": {
          "MusicCloud\\Generated\\": "generated/",
          "Musiccloud\\": "src/",
        },
      },
      config: {
        "allow-plugins": {
          "php-http/discovery": true,
        },
        "sort-packages": true,
      },
    });
    await Promise.all([
      rm(path.join(scratch, "composer.lock"), { force: true }),
      rm(path.join(scratch, "jane-openapi.php"), { force: true }),
      rm(path.join(scratch, "vendor"), { force: true, recursive: true }),
    ]);
    await assembleOwnedInputs(scratch, target, release);
    await runCommand(
      "native gate: Composer manifest validation",
      "docker",
      dockerArgs(null, ["validate", `--working-dir=${containerPath(scratch)}`, "--strict"]),
    );
    await runCommand(
      "native gate: PHP typed error syntax",
      "docker",
      dockerArgs("php", ["-l", containerPath(path.join(scratch, "src/MusiccloudErrors.php"))]),
    );
    await runCommand(
      "native gate: PHP golden usage syntax",
      "docker",
      dockerArgs("php", ["-l", containerPath(repoPath(target.goldenUsage))]),
    );
    await copyCandidate(scratch, candidateDir);
  },
};

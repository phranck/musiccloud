import path from "node:path";
import {
  assembleOwnedInputs,
  assertAdapterTarget,
  copyCandidate,
  copyFileInto,
  resetScratch,
  runCommand,
  writeJson,
} from "./common.mjs";

const language = "typescript";
const adapterId = "hey-api-0-99";

export const typescriptAdapter = {
  language,
  adapterId,
  async generate({ candidateDir, contract, release, target }) {
    assertAdapterTarget(target, language, adapterId);
    const scratch = await resetScratch(target);
    await runCommand(`generator invocation from ${contract.openApiPath}`, "pnpm", [
      "--package=@hey-api/openapi-ts@0.99.0",
      "--package=typescript@5.9.3",
      "dlx",
      "openapi-ts",
      "-f",
      "sdk/generator-profiles/harnesses/typescript/openapi-ts.config.mjs",
    ]);
    await copyFileInto(
      "sdk/generator-profiles/harnesses/typescript/tsconfig.json",
      path.join(scratch, "tsconfig.json"),
    );
    const tsconfig = {
      compilerOptions: {
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "Bundler",
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: "ES2022",
      },
      include: ["generated/**/*.ts", "runtime/**/*.ts"],
    };
    await writeJson(path.join(scratch, "tsconfig.json"), tsconfig);
    await copyFileInto(
      "sdk/error-contract/typescript/musiccloud-errors.ts",
      path.join(scratch, "runtime/musiccloud-errors.ts"),
    );
    await writeJson(path.join(scratch, "package.json"), {
      name: target.package.name,
      version: release.sdkVersion,
      private: true,
      type: "module",
      exports: {
        "./generated": "./generated/index.ts",
        "./errors": "./runtime/musiccloud-errors.ts",
      },
      dependencies: { "@hey-api/client-fetch": "0.13.1" },
    });
    await assembleOwnedInputs(scratch, target, release);
    await runCommand("native gate: TypeScript typecheck", "pnpm", [
      "exec",
      "tsc",
      "-p",
      path.join(scratch, "tsconfig.json"),
    ]);
    await copyCandidate(scratch, candidateDir);
  },
};

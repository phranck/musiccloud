import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SdkAdapterError } from "../orchestrator.mjs";
import { goAdapter } from "./go.mjs";
import { phpAdapter } from "./php.mjs";
import { pythonAdapter } from "./python.mjs";
import { swiftAdapter } from "./swift.mjs";
import { typescriptAdapter } from "./typescript.mjs";

const adapters = [typescriptAdapter, pythonAdapter, swiftAdapter, phpAdapter, goAdapter];

export function createSdkAdapters() {
  return new Map(adapters.map((adapter) => [adapter.language, adapter]));
}

export function createFixtureSdkAdapters({ failTarget, failStage = "native gate" } = {}) {
  return new Map(
    adapters.map((adapter) => [
      adapter.language,
      {
        language: adapter.language,
        adapterId: adapter.adapterId,
        async generate({ candidateDir, target }) {
          if (adapter.language === failTarget) {
            throw new SdkAdapterError(failStage, new Error("injected fixture failure"));
          }
          await mkdir(path.join(candidateDir, ".musiccloud"), { recursive: true });
          await writeFile(path.join(candidateDir, "README.md"), `# musiccloud ${target.displayName} SDK fixture\n`);
          await writeFile(path.join(candidateDir, ".musiccloud/public-api.txt"), `${target.language} fixture\n`);
        },
      },
    ]),
  );
}

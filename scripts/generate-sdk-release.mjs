#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createFixtureSdkAdapters, createSdkAdapters } from "./sdk-orchestrator/adapters/index.mjs";
import { runSdkRelease } from "./sdk-orchestrator/orchestrator.mjs";
import { loadSdkGeneratorProfiles } from "./validate-sdk-generator-profiles.mjs";

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(`Missing value for ${key ?? "argument"}.`);
    }
    args[key.slice(2)] = value;
  }
  for (const required of ["contract-dir", "out-dir", "source-sha"]) {
    if (!args[required]) throw new Error(`Missing --${required}.`);
  }
  return {
    contractDir: path.resolve(args["contract-dir"]),
    outDir: path.resolve(args["out-dir"]),
    sourceSha: args["source-sha"],
    releaseBaseUrl: args["release-base-url"],
    target: args.target,
    profilesRoot: args["profiles-root"] ? path.resolve(args["profiles-root"]) : undefined,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const profiles = await loadSdkGeneratorProfiles(args.profilesRoot);
  const fixtureMode = process.env.MUSICCLOUD_SDK_GENERATOR_FIXTURE === "true";
  const adapters = fixtureMode
    ? createFixtureSdkAdapters({
        failTarget: process.env.MUSICCLOUD_SDK_FAIL_TARGET,
        failStage: process.env.MUSICCLOUD_SDK_FAIL_STAGE,
      })
    : createSdkAdapters();
  const result = await runSdkRelease({ ...args, profiles, adapters });
  if (result.mode === "diagnostic") {
    console.log(
      `Generated diagnostic ${result.target.language} SDK candidate ${result.sdkVersion} from OpenAPI ${result.apiVersion} (${result.openApiSha256}).`,
    );
  } else {
    console.log(
      `Generated ${result.assets.length} atomic SDK candidates ${result.sdkVersion} from OpenAPI ${result.apiVersion} (${result.openApiSha256}).`,
    );
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

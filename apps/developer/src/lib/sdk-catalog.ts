export type SdkLanguage = "typescript" | "python" | "swift" | "php" | "go";
export type SdkStability = "preview" | "stable";
export type SdkPackageChannel = "npm" | "pypi" | "swift-package" | "composer" | "go-module";

/** Contract identity exported beside the canonical OpenAPI JSON. */
export interface SdkCatalogContract {
  version: string;
  sha256: string;
}

/** Local previews may intentionally render the last released catalog. */
export interface SdkCatalogValidationOptions {
  allowStaleContract?: boolean;
}

export interface SdkRuntime {
  name: string;
  constraint: string;
}

export interface SdkGeneratorProvenance {
  id: string;
  name: string;
  version: string;
  license: string;
  source: string;
  artifact: {
    type: string;
    locator: string;
    digestAlgorithm: string;
    digest: string;
  };
  runtime: SdkRuntime;
}

export interface SdkAsset {
  language: SdkLanguage;
  displayName: string;
  stability: SdkStability;
  package: {
    name: string;
    module: string;
    channel: SdkPackageChannel;
  };
  runtime: SdkRuntime;
  generator: SdkGeneratorProvenance;
  configurationRevision: string;
  inputRevision: string;
  archiveName: string;
  archiveUrl: string;
  sha256: string;
  documentation: string[];
  manpages: string[];
  quickstart: {
    install: string;
    import: string;
    firstRequest: string;
  };
}

/** Strict Catalog v2 shape consumed by the Developer Portal build. */
export interface SdkCatalog {
  schemaVersion: 2;
  sdkVersion: string;
  releaseTag: string;
  apiVersion: string;
  openApiSha256: string;
  sourceSha: string;
  assets: SdkAsset[];
}

const REQUIRED_LANGUAGES: SdkLanguage[] = ["typescript", "python", "swift", "php", "go"];
const TARGET_FACTS: Record<
  SdkLanguage,
  { displayName: string; generatorId: string; generatorVersion: string; channel: SdkPackageChannel }
> = {
  typescript: {
    displayName: "TypeScript",
    generatorId: "hey-api-0-99",
    generatorVersion: "0.99.0",
    channel: "npm",
  },
  python: {
    displayName: "Python",
    generatorId: "openapi-python-client-0-29",
    generatorVersion: "0.29.0",
    channel: "pypi",
  },
  swift: {
    displayName: "Swift",
    generatorId: "swift-openapi-generator-1-13",
    generatorVersion: "1.13.0",
    channel: "swift-package",
  },
  php: {
    displayName: "PHP",
    generatorId: "jane-openapi-7-12",
    generatorVersion: "7.12.0",
    channel: "composer",
  },
  go: {
    displayName: "Go",
    generatorId: "ogen-1-23",
    generatorVersion: "1.23.0",
    channel: "go-module",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid SDK catalog: missing ${label}.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`Invalid SDK catalog: ${label} must be a string array.`);
  }
  return [...value];
}

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Invalid SDK catalog: ${label} must be a lowercase sha256.`);
  }
}

function parseLanguage(value: unknown): SdkLanguage {
  if (REQUIRED_LANGUAGES.includes(value as SdkLanguage)) return value as SdkLanguage;
  throw new Error("Invalid SDK catalog: unexpected language.");
}

function parseRuntime(value: unknown, label: string): SdkRuntime {
  if (!isRecord(value)) throw new Error(`Invalid SDK catalog: missing ${label}.`);
  return {
    name: requireString(value.name, `${label}.name`),
    constraint: requireString(value.constraint, `${label}.constraint`),
  };
}

function parseGenerator(value: unknown, language: SdkLanguage): SdkGeneratorProvenance {
  if (!isRecord(value)) throw new Error("Invalid SDK catalog: missing asset.generator.");
  const expected = TARGET_FACTS[language];
  const id = requireString(value.id, "asset.generator.id");
  const version = requireString(value.version, "asset.generator.version");
  if (id !== expected.generatorId || version !== expected.generatorVersion) {
    throw new Error(`Invalid SDK catalog: unexpected generator for ${language}.`);
  }
  if (!isRecord(value.artifact)) throw new Error("Invalid SDK catalog: missing generator artifact.");
  const source = requireString(value.source, "asset.generator.source");
  if (!source.startsWith("https://")) throw new Error("Invalid SDK catalog: untrusted generator source.");
  return {
    id,
    name: requireString(value.name, "asset.generator.name"),
    version,
    license: requireString(value.license, "asset.generator.license"),
    source,
    artifact: {
      type: requireString(value.artifact.type, "asset.generator.artifact.type"),
      locator: requireString(value.artifact.locator, "asset.generator.artifact.locator"),
      digestAlgorithm: requireString(value.artifact.digestAlgorithm, "asset.generator.artifact.digestAlgorithm"),
      digest: requireString(value.artifact.digest, "asset.generator.artifact.digest"),
    },
    runtime: parseRuntime(value.runtime, "asset.generator.runtime"),
  };
}

function parseAsset(value: unknown, sdkVersion: string, releaseTag: string): SdkAsset {
  if (!isRecord(value)) throw new Error("Invalid SDK catalog: asset must be an object.");
  const language = parseLanguage(value.language);
  const expected = TARGET_FACTS[language];
  const displayName = requireString(value.displayName, "asset.displayName");
  if (displayName !== expected.displayName)
    throw new Error(`Invalid SDK catalog: unexpected ${language} display name.`);
  const stability = value.stability;
  if (stability !== "preview" && stability !== "stable") {
    throw new Error(`Invalid SDK catalog: unexpected ${language} stability.`);
  }
  if (!isRecord(value.package)) throw new Error("Invalid SDK catalog: missing asset.package.");
  const channel = requireString(value.package.channel, "asset.package.channel") as SdkPackageChannel;
  if (channel !== expected.channel) throw new Error(`Invalid SDK catalog: unexpected ${language} package channel.`);
  const runtime = parseRuntime(value.runtime, "asset.runtime");
  const generator = parseGenerator(value.generator, language);
  if (runtime.name !== generator.runtime.name || runtime.constraint !== generator.runtime.constraint) {
    throw new Error(`Invalid SDK catalog: ${language} runtime disagrees with generator provenance.`);
  }
  const archiveName = requireString(value.archiveName, "asset.archiveName");
  const expectedArchiveName = `musiccloud-${language}-sdk-${sdkVersion}.zip`;
  if (archiveName !== expectedArchiveName) {
    throw new Error(`Invalid SDK catalog: unexpected ${language} archiveName.`);
  }
  const archiveUrl = requireString(value.archiveUrl, "asset.archiveUrl");
  const expectedUrl = `https://github.com/phranck/musiccloud/releases/download/${releaseTag}/${archiveName}`;
  if (archiveUrl !== expectedUrl) throw new Error("Invalid SDK catalog: untrusted release URL.");
  const archiveSha256 = requireString(value.sha256, "asset.sha256");
  assertSha256(archiveSha256, "asset.sha256");
  const configurationRevision = requireString(value.configurationRevision, "asset.configurationRevision");
  const inputRevision = requireString(value.inputRevision, "asset.inputRevision");
  assertSha256(configurationRevision, "asset.configurationRevision");
  assertSha256(inputRevision, "asset.inputRevision");
  if (!isRecord(value.quickstart)) throw new Error("Invalid SDK catalog: missing asset.quickstart.");

  return {
    language,
    displayName,
    stability,
    package: {
      name: requireString(value.package.name, "asset.package.name"),
      module: requireString(value.package.module, "asset.package.module"),
      channel,
    },
    runtime,
    generator,
    configurationRevision,
    inputRevision,
    archiveName,
    archiveUrl,
    sha256: archiveSha256,
    documentation: requireStringArray(value.documentation, "asset.documentation"),
    manpages: requireStringArray(value.manpages, "asset.manpages"),
    quickstart: {
      install: requireString(value.quickstart.install, "asset.quickstart.install"),
      import: requireString(value.quickstart.import, "asset.quickstart.import"),
      firstRequest: requireString(value.quickstart.firstRequest, "asset.quickstart.firstRequest"),
    },
  };
}

/** Validates one atomic five-language SDK release against this build's contract. */
export function parseSdkCatalog(
  value: unknown,
  contract: SdkCatalogContract,
  options: SdkCatalogValidationOptions = {},
): SdkCatalog {
  if (!isRecord(value)) throw new Error("Invalid SDK catalog: root must be an object.");
  if (value.schemaVersion !== 2) throw new Error("Invalid SDK catalog: unsupported schema version.");
  const sdkVersion = requireString(value.sdkVersion, "sdkVersion");
  if (!/^\d+\.\d+\.\d+$/.test(sdkVersion)) throw new Error("Invalid SDK catalog: sdkVersion must be SemVer.");
  const releaseTag = requireString(value.releaseTag, "releaseTag");
  if (releaseTag !== `sdk-v${sdkVersion}`) {
    throw new Error("Invalid SDK catalog: release tag must derive from sdkVersion.");
  }
  const apiVersion = requireString(value.apiVersion, "apiVersion");
  const openApiSha256 = requireString(value.openApiSha256, "openApiSha256");
  const sourceSha = requireString(value.sourceSha, "sourceSha");
  if (apiVersion !== contract.version && !options.allowStaleContract) {
    throw new Error("Invalid SDK catalog: API version does not match exported contract.");
  }
  if (openApiSha256 !== contract.sha256 && !options.allowStaleContract) {
    throw new Error("Invalid SDK catalog: OpenAPI fingerprint does not match exported contract.");
  }
  assertSha256(openApiSha256, "openApiSha256");
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("Invalid SDK catalog: sourceSha must be a Git SHA.");
  if (!Array.isArray(value.assets)) throw new Error("Invalid SDK catalog: assets must be an array.");

  const assets = value.assets.map((asset) => parseAsset(asset, sdkVersion, releaseTag));
  const seen = new Set<SdkLanguage>();
  for (const asset of assets) {
    if (seen.has(asset.language)) throw new Error(`Invalid SDK catalog: duplicate ${asset.language} asset.`);
    seen.add(asset.language);
  }
  const missing = REQUIRED_LANGUAGES.filter((language) => !seen.has(language));
  if (missing.length > 0) throw new Error(`Invalid SDK catalog: missing ${missing.join(", ")} asset.`);
  if (assets.length !== REQUIRED_LANGUAGES.length) {
    throw new Error("Invalid SDK catalog: unexpected extra asset.");
  }

  return {
    schemaVersion: 2,
    sdkVersion,
    releaseTag,
    apiVersion,
    openApiSha256,
    sourceSha,
    assets: assets.toSorted(
      (left, right) => REQUIRED_LANGUAGES.indexOf(left.language) - REQUIRED_LANGUAGES.indexOf(right.language),
    ),
  };
}

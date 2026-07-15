export type SdkLanguage = "typescript" | "python" | "swift";
export type SdkGenerator = "typescript-fetch" | "python" | "swift6";

/** Contract identity exported beside the canonical OpenAPI JSON. */
export interface SdkCatalogContract {
  version: string;
  sha256: string;
}

/**
 * Local development may preview contract-documentation changes before the
 * matching versioned SDK archives are released. Production callers must keep
 * the default, strict fingerprint validation.
 */
export interface SdkCatalogValidationOptions {
  allowStaleOpenApiFingerprint?: boolean;
}

/**
 * Release catalog consumed by the Developer Portal build.
 *
 * The shape is deliberately independent from GitHub's API responses so CI can
 * generate one small, deterministic file and the portal can validate it without
 * interpreting release metadata.
 */
export interface SdkCatalog {
  apiVersion: string;
  openApiSha256: string;
  sourceSha: string;
  generatorVersion: "7.22.0";
  assets: SdkAsset[];
}

export interface SdkAsset {
  language: SdkLanguage;
  generator: SdkGenerator;
  archiveName: string;
  archiveUrl: string;
  sha256: string;
  quickstart: {
    install: string;
    import: string;
    firstRequest: string;
  };
}

const REQUIRED_LANGUAGES: SdkLanguage[] = ["typescript", "python", "swift"];
const GENERATOR_BY_LANGUAGE: Record<SdkLanguage, SdkGenerator> = {
  typescript: "typescript-fetch",
  python: "python",
  swift: "swift6",
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

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Invalid SDK catalog: ${label} must be a lowercase sha256.`);
  }
}

function parseLanguage(value: unknown): SdkLanguage {
  if (value === "typescript" || value === "python" || value === "swift") return value;
  throw new Error("Invalid SDK catalog: unexpected language.");
}

function parseGenerator(value: unknown, language: SdkLanguage): SdkGenerator {
  const expected = GENERATOR_BY_LANGUAGE[language];
  if (value === expected) return expected;
  throw new Error(`Invalid SDK catalog: unexpected generator for ${language}.`);
}

function assertTrustedReleaseUrl(url: string, apiVersion: string): void {
  const prefix = `https://github.com/phranck/musiccloud/releases/download/api-sdk-v${apiVersion}/`;
  if (!url.startsWith(prefix)) {
    throw new Error("Invalid SDK catalog: untrusted release URL.");
  }
}

function parseAsset(value: unknown, apiVersion: string): SdkAsset {
  if (!isRecord(value)) throw new Error("Invalid SDK catalog: asset must be an object.");
  const language = parseLanguage(value.language);
  const generator = parseGenerator(value.generator, language);
  const archiveName = requireString(value.archiveName, "asset.archiveName");
  const archiveUrl = requireString(value.archiveUrl, "asset.archiveUrl");
  const sha256 = requireString(value.sha256, "asset.sha256");
  const quickstart = value.quickstart;
  if (!isRecord(quickstart)) throw new Error("Invalid SDK catalog: missing asset.quickstart.");
  assertSha256(sha256, "asset.sha256");
  assertTrustedReleaseUrl(archiveUrl, apiVersion);
  if (!archiveName.endsWith(".zip")) throw new Error("Invalid SDK catalog: archiveName must be a .zip file.");

  return {
    language,
    generator,
    archiveName,
    archiveUrl,
    sha256,
    quickstart: {
      install: requireString(quickstart.install, "asset.quickstart.install"),
      import: requireString(quickstart.import, "asset.quickstart.import"),
      firstRequest: requireString(quickstart.firstRequest, "asset.quickstart.firstRequest"),
    },
  };
}

/**
 * Validates a downloaded or fixture-backed SDK catalog against the exact
 * OpenAPI bytes exported for this build. Production builds must fail here
 * rather than deploy docs for an API version whose SDK ZIPs were not published.
 */
export function parseSdkCatalog(
  value: unknown,
  contract: SdkCatalogContract,
  options: SdkCatalogValidationOptions = {},
): SdkCatalog {
  if (!isRecord(value)) throw new Error("Invalid SDK catalog: root must be an object.");
  const apiVersion = requireString(value.apiVersion, "apiVersion");
  const openApiSha256 = requireString(value.openApiSha256, "openApiSha256");
  const sourceSha = requireString(value.sourceSha, "sourceSha");
  const generatorVersion = requireString(value.generatorVersion, "generatorVersion");

  if (apiVersion !== contract.version) {
    throw new Error("Invalid SDK catalog: API version does not match exported contract.");
  }
  if (openApiSha256 !== contract.sha256 && !options.allowStaleOpenApiFingerprint) {
    throw new Error("Invalid SDK catalog: OpenAPI fingerprint does not match exported contract.");
  }
  assertSha256(openApiSha256, "openApiSha256");
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("Invalid SDK catalog: sourceSha must be a Git SHA.");
  if (generatorVersion !== "7.22.0") throw new Error("Invalid SDK catalog: unsupported generator version.");
  if (!Array.isArray(value.assets)) throw new Error("Invalid SDK catalog: assets must be an array.");

  const assets = value.assets.map((asset) => parseAsset(asset, apiVersion));
  const seen = new Set<SdkLanguage>();
  for (const asset of assets) {
    if (seen.has(asset.language)) throw new Error(`Invalid SDK catalog: duplicate ${asset.language} asset.`);
    seen.add(asset.language);
  }
  const missing = REQUIRED_LANGUAGES.filter((language) => !seen.has(language));
  if (missing.length > 0) throw new Error(`Invalid SDK catalog: missing ${missing.join(", ")} asset.`);

  const sortedAssets = assets.toSorted(
    (a, b) => REQUIRED_LANGUAGES.indexOf(a.language) - REQUIRED_LANGUAGES.indexOf(b.language),
  );
  return {
    apiVersion,
    openApiSha256,
    sourceSha,
    generatorVersion,
    assets: sortedAssets,
  };
}

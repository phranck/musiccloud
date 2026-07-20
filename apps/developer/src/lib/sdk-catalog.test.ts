import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSdkCatalog } from "./sdk-catalog";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const contract = {
  version: "2.1.9",
  sha256: "7fb873dd462e18bd9cbcb81a8318959260eeda389eaea901dfacc4681ead309f",
};

function readCatalog(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixturesDir, "sdk-catalog.json"), "utf8"));
}

describe("parseSdkCatalog", () => {
  it("accepts the explicit release catalog shape", () => {
    const catalog = parseSdkCatalog(readCatalog(), contract);

    expect(catalog.schemaVersion).toBe(2);
    expect(catalog.sdkVersion).toBe("0.1.0");
    expect(catalog.releaseTag).toBe("sdk-v0.1.0");
    expect(catalog.apiVersion).toBe("2.1.9");
    expect(catalog.assets.map((asset) => asset.language)).toEqual(["typescript", "python", "swift", "php", "go"]);
    expect(catalog.assets.find((asset) => asset.language === "swift")?.generator.id).toBe(
      "swift-openapi-generator-1-13",
    );
    expect(catalog.assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.inputRevision))).toBe(true);
  });

  it("rejects a catalog for another API version", () => {
    const catalog = readCatalog();
    catalog.apiVersion = "2.0.0";

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("API version");
  });

  it("rejects a catalog for another OpenAPI fingerprint", () => {
    const catalog = readCatalog();
    catalog.openApiSha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("fingerprint");
  });

  it("allows a stale release only when an explicit local preview option is set", () => {
    const previewContract = {
      version: "2.1.10",
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };

    expect(parseSdkCatalog(readCatalog(), previewContract, { allowStaleContract: true })).toMatchObject({
      apiVersion: "2.1.9",
      openApiSha256: contract.sha256,
    });
  });

  it("rejects duplicate language assets", () => {
    const catalog = readCatalog() as { assets: Array<Record<string, unknown>> };
    catalog.assets[1] = { ...catalog.assets[0] };

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("duplicate");
  });

  it("rejects missing required language assets", () => {
    const catalog = readCatalog() as { assets: Array<Record<string, unknown>> };
    catalog.assets = catalog.assets.filter((asset) => asset.language !== "swift");

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("missing");
  });

  it("rejects invalid checksums", () => {
    const catalog = readCatalog() as { assets: Array<Record<string, unknown>> };
    catalog.assets[0]!.sha256 = "not-a-sha";

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("sha256");
  });

  it("rejects an invalid config or template revision", () => {
    const catalog = readCatalog() as { assets: Array<Record<string, unknown>> };
    catalog.assets[0]!.inputRevision = "not-a-sha";

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("inputRevision");
  });

  it("rejects untrusted release URLs", () => {
    const catalog = readCatalog() as { assets: Array<Record<string, unknown>> };
    catalog.assets[0]!.archiveUrl = "https://example.com/musiccloud-typescript-sdk-2.1.9.zip";

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("release URL");
  });

  it("rejects an unexpected generator target", () => {
    const catalog = readCatalog() as { assets: Array<Record<string, unknown>> };
    (catalog.assets[0]!.generator as Record<string, unknown>).id = "typescript-axios";

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("generator");
  });

  it("rejects a release tag that is not derived from the shared SDK version", () => {
    const catalog = readCatalog();
    catalog.releaseTag = "sdk-v0.2.0";

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("release tag");
  });

  it("rejects runtime metadata that disagrees with generator provenance", () => {
    const catalog = readCatalog() as { assets: Array<Record<string, unknown>> };
    (catalog.assets[0]!.runtime as Record<string, unknown>).constraint = ">=99";

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("runtime");
  });
});

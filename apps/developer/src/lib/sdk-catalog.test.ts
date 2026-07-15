import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSdkCatalog } from "./sdk-catalog";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const contract = {
  version: "2.1.3",
  sha256: "dae988d7a81f2a41f918fb2c22a2bd4156d9e5d41284a559313f643532e482a6",
};

function readCatalog(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixturesDir, "sdk-catalog.json"), "utf8"));
}

describe("parseSdkCatalog", () => {
  it("accepts the explicit release catalog shape", () => {
    const catalog = parseSdkCatalog(readCatalog(), contract);

    expect(catalog.apiVersion).toBe("2.1.3");
    expect(catalog.generatorVersion).toBe("7.22.0");
    expect(catalog.assets.map((asset) => asset.language)).toEqual(["typescript", "python", "swift"]);
    expect(catalog.assets.find((asset) => asset.language === "swift")?.generator).toBe("swift6");
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

  it("allows a stale fingerprint only when an explicit local preview option is set", () => {
    const catalog = readCatalog();
    catalog.openApiSha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    expect(parseSdkCatalog(catalog, contract, { allowStaleOpenApiFingerprint: true }).openApiSha256).toBe(
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
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

  it("rejects untrusted release URLs", () => {
    const catalog = readCatalog() as { assets: Array<Record<string, unknown>> };
    catalog.assets[0]!.archiveUrl = "https://example.com/musiccloud-typescript-sdk-2.1.3.zip";

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("release URL");
  });

  it("rejects an unexpected generator target", () => {
    const catalog = readCatalog() as { assets: Array<Record<string, unknown>> };
    catalog.assets[0]!.generator = "typescript-axios";

    expect(() => parseSdkCatalog(catalog, contract)).toThrow("generator");
  });
});

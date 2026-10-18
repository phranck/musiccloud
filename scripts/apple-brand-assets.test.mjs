import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalog = new URL("../apps/Apple/App/Supporting%20Files/Assets.xcassets/ServiceBrandIcons/", import.meta.url);

/**
 * Returns fingerprints for every compiled variant of one curated Settings mark.
 * @param {string} service Stable asset-directory identifier.
 * @returns {string[]} SHA-256 values for the catalog's named image variants.
 */
function artworkChecksums(service) {
  const directory = new URL(`${service}.imageset/`, catalog);
  const contents = JSON.parse(readFileSync(new URL("Contents.json", directory), "utf8"));
  return contents.images.filter((image) => image.filename).map((image) =>
    createHash("sha256").update(readFileSync(new URL(image.filename, directory))).digest("hex"));
}

test("Qobuz artwork is not the unrelated Hi-Res Audio certification badge", () => {
  for (const checksum of artworkChecksums("qobuz")) {
    assert.notEqual(checksum, "f9e366b1c7d5eecc1b3c2d9e07e4a919321946fed7dc9d26b0443a55cf881e2c",
      "The source provider mislabeled this certification badge as a Qobuz logo");
  }
});

test("compact service marks do not revert to padded or wordmark-heavy source selections", () => {
  const rejected = {
    pandora: "19be9cc32749cde04c5d3d65eede2ec311baf5b7361dbe46694846f724fee4e8",
    bugs: "cb2eea4b66fee8617a02c953def7b152cdcc580cddd92fa39bfd3b6cbe0315df",
    boomplay: "6229749cf70f9409f74ff623ea8555be6ee8c5c18cbc283cf7e72b7e82f58be5",
    audius: "7d57e92788f6705db4cec45effebf40d6a0dd919c73ef63cbb999138074899ac",
  };
  for (const [service, checksum] of Object.entries(rejected)) {
    assert.ok(!artworkChecksums(service).includes(checksum), `${service} must use its curated compact mark`);
  }
});

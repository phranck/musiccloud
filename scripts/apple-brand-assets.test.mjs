import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalog = new URL("../apps/Apple/App/Supporting%20Files/Assets.xcassets/ServiceBrandIcons/", import.meta.url);

test("Qobuz artwork is not the unrelated Hi-Res Audio certification badge", () => {
  const directory = new URL("qobuz.imageset/", catalog);
  const contents = JSON.parse(readFileSync(new URL("Contents.json", directory), "utf8"));
  for (const image of contents.images) {
    if (!image.filename) continue;
    const bytes = readFileSync(new URL(image.filename, directory));
    const checksum = createHash("sha256").update(bytes).digest("hex");
    assert.notEqual(checksum, "f9e366b1c7d5eecc1b3c2d9e07e4a919321946fed7dc9d26b0443a55cf881e2c",
      "The source provider mislabeled this certification badge as a Qobuz logo");
  }
});

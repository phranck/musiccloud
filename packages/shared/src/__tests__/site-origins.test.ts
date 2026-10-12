import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_ORIGIN } from "../site-origins.js";
import { REPOSITORY_ROOT, shippedSourceFiles } from "./repository-sources.js";

/** Where the table itself lives. */
const TABLE_FILE = "packages/shared/src/site-origins.ts";

/**
 * Files whose addresses are examples inside the published contract. A reader
 * copies them as they stand, so they stay written out.
 */
const CONTRACT_EXAMPLE_FILES = [
  "apps/backend/src/schemas/openapi-schemas.ts",
  "packages/shared/src/email-variables.ts",
];

/** A line inside a doc block, a line comment, an HTML comment or a JSX comment. */
const COMMENT_LINE = /^\s*(\*|\/\*|\/\/|<!--|\{\/\*)/;

describe("SITE_ORIGIN", () => {
  it("is the only place a production address is written", () => {
    const addresses = Object.values(SITE_ORIGIN);
    const writtenOut = shippedSourceFiles()
      .filter((path) => path !== TABLE_FILE && !CONTRACT_EXAMPLE_FILES.includes(path))
      .flatMap((path) =>
        readFileSync(join(REPOSITORY_ROOT, path), "utf8")
          .split("\n")
          .flatMap((line, index) =>
            !COMMENT_LINE.test(line) && addresses.some((address) => line.includes(address))
              ? [`${path}:${index + 1}`]
              : [],
          ),
      );

    expect(writtenOut).toEqual([]);
  });
});

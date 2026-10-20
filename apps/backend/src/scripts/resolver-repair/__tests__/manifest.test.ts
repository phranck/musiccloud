import { describe, expect, it } from "vitest";
import { sha256Hex } from "../canonical-json.js";
import { invertManifest, ManifestError, parseManifest, type RepairManifest, sealManifest } from "../manifest.js";
import { manifestOf } from "./memory-row-store.js";

const TABLES: ReadonlySet<string> = new Set(["items", "children"]);

const operations: RepairManifest["operations"] = [
  {
    kind: "update-columns",
    table: "items",
    keyColumn: "id",
    keyValue: "a",
    before: { cover: "https://x/1.jpg" },
    after: { cover: null },
  },
  {
    kind: "delete-row",
    table: "children",
    keyColumn: "id",
    keyValue: "c1",
    row: { id: "c1", item_id: "a", note: "n" },
  },
  {
    kind: "insert-row",
    table: "children",
    keyColumn: "id",
    keyValue: "c2",
    row: { id: "c2", item_id: "a", note: "n" },
  },
];

/** Seals a manifest and returns the pieces a stored manifest consists of. */
function sealed(manifest: RepairManifest = manifestOf(operations)) {
  return sealManifest(manifest, TABLES);
}

/** The error code a call throws, or `undefined` when it does not throw. */
function codeOf(call: () => unknown): string | undefined {
  try {
    call();
  } catch (error) {
    return error instanceof ManifestError ? error.code : `unexpected ${String(error)}`;
  }
  return undefined;
}

describe("sealing and reading a manifest", () => {
  it("reads back exactly what was sealed, identified by the checksum of its canonical text", () => {
    const { content, sha256 } = sealed();
    expect(sha256).toBe(sha256Hex(content));
    expect(parseManifest(content, sha256, TABLES)).toEqual(manifestOf(operations));
  });

  it("gives the same text and checksum however the keys were ordered", () => {
    const reordered: RepairManifest = JSON.parse(
      JSON.stringify(manifestOf(operations), [
        "operations",
        "issue",
        "repair",
        "formatVersion",
        "requiredMigrationHash",
        "sourceArchiveSha256",
        "kind",
        "table",
        "keyColumn",
        "keyValue",
        "before",
        "after",
        "cover",
        "row",
        "id",
        "item_id",
        "note",
      ]),
    );
    expect(sealed(reordered)).toEqual(sealed());
  });

  it("refuses text whose checksum differs, before looking at its content", () => {
    const { content, sha256 } = sealed();
    expect(codeOf(() => parseManifest(content.replace("fixture-repair", "other-repair"), sha256, TABLES))).toBe(
      "MANIFEST_CHECKSUM_MISMATCH",
    );
    expect(codeOf(() => parseManifest(content, "0".repeat(64), TABLES))).toBe("MANIFEST_CHECKSUM_MISMATCH");
  });

  it("refuses text that is valid but not in canonical form, even with a matching checksum", () => {
    const { content } = sealed();
    const spaced = JSON.stringify(JSON.parse(content), null, 2);
    expect(codeOf(() => parseManifest(spaced, sha256Hex(spaced), TABLES))).toBe("MANIFEST_NOT_CANONICAL");
  });

  it("refuses text that is not JSON", () => {
    expect(codeOf(() => parseManifest("not json", sha256Hex("not json"), TABLES))).toBe("MANIFEST_NOT_JSON");
  });
});

describe("refusing a manifest that could do more than it says", () => {
  const cases: { name: string; code: string; change: (manifest: RepairManifest) => unknown }[] = [
    {
      name: "a table outside the allowlist",
      code: "MANIFEST_TABLE_NOT_ALLOWED",
      change: (m) => ({ ...m, operations: [{ ...m.operations[0], table: "admin_users" }] }),
    },
    {
      name: "a table name that is not a plain identifier",
      code: "MANIFEST_IDENTIFIER_INVALID",
      change: (m) => ({ ...m, operations: [{ ...m.operations[0], table: 'items"; DROP TABLE items; --' }] }),
    },
    {
      name: "a column name that is not a plain identifier",
      code: "MANIFEST_IDENTIFIER_INVALID",
      change: (m) => ({
        ...m,
        operations: [{ ...m.operations[0], before: { "cover = 1 --": "x" }, after: { "cover = 1 --": "y" } }],
      }),
    },
    {
      name: "the same row twice",
      code: "MANIFEST_DUPLICATE_ROW",
      change: (m) => ({ ...m, operations: [m.operations[0], m.operations[0]] }),
    },
    {
      name: "an update whose before and after are equal",
      code: "MANIFEST_OPERATION_INVALID",
      change: (m) => ({ ...m, operations: [{ ...m.operations[0], after: { cover: "https://x/1.jpg" } }] }),
    },
    {
      name: "an update that changes the key column",
      code: "MANIFEST_OPERATION_INVALID",
      change: (m) => ({ ...m, operations: [{ ...m.operations[0], before: { id: "a" }, after: { id: "b" } }] }),
    },
    {
      name: "an update that changes different columns before and after",
      code: "MANIFEST_OPERATION_INVALID",
      change: (m) => ({ ...m, operations: [{ ...m.operations[0], after: { other: null } }] }),
    },
    {
      name: "a row whose key disagrees with the operation",
      code: "MANIFEST_OPERATION_INVALID",
      change: (m) => ({ ...m, operations: [{ ...m.operations[1], keyValue: "c9" }] }),
    },
    {
      name: "an unknown operation kind",
      code: "MANIFEST_OPERATION_INVALID",
      change: (m) => ({ ...m, operations: [{ ...m.operations[1], kind: "truncate" }] }),
    },
    {
      name: "an unknown field on an operation",
      code: "MANIFEST_OPERATION_INVALID",
      change: (m) => ({ ...m, operations: [{ ...m.operations[1], where: "1=1" }] }),
    },
    {
      name: "an unknown field on the manifest",
      code: "MANIFEST_SHAPE_INVALID",
      change: (m) => ({ ...m, extra: true }),
    },
    { name: "no operations", code: "MANIFEST_SHAPE_INVALID", change: (m) => ({ ...m, operations: [] }) },
    { name: "another format version", code: "MANIFEST_SHAPE_INVALID", change: (m) => ({ ...m, formatVersion: 2 }) },
    {
      name: "a migration hash that is not a SHA-256",
      code: "MANIFEST_SHAPE_INVALID",
      change: (m) => ({ ...m, requiredMigrationHash: "latest" }),
    },
    {
      name: "a value that is not JSON",
      code: "MANIFEST_SHAPE_INVALID",
      change: (m) => ({ ...m, operations: [{ ...m.operations[1], row: { id: "c1", note: undefined } }] }),
    },
  ];

  it.each(cases)("$name ends with $code", ({ code, change }) => {
    const mutated = change(manifestOf(operations)) as RepairManifest;
    expect(codeOf(() => sealManifest(mutated, TABLES))).toBe(code);
  });
});

describe("inverting a manifest", () => {
  it("runs the operations in reverse and turns each around", () => {
    const inverse = invertManifest(manifestOf(operations));
    expect(inverse.operations.map((operation) => operation.kind)).toEqual([
      "delete-row",
      "insert-row",
      "update-columns",
    ]);
    expect(inverse.operations[2]).toMatchObject({ before: { cover: null }, after: { cover: "https://x/1.jpg" } });
    expect(inverse.operations[1]).toMatchObject({ kind: "insert-row", keyValue: "c1", row: { note: "n" } });
  });

  it("is its own inverse", () => {
    expect(invertManifest(invertManifest(manifestOf(operations)))).toEqual(manifestOf(operations));
  });
});

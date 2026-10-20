import { describe, expect, it } from "vitest";
import { applyManifest, classifyOperation, RepairAborted, verifyManifest } from "../engine.js";
import { invertManifest, type RepairOperation, type RowValues } from "../manifest.js";
import { MemoryRowStore, MIGRATION_HASH, manifestOf } from "./memory-row-store.js";

const coverUpdate = (id: string): RepairOperation => ({
  kind: "update-columns",
  table: "items",
  keyColumn: "id",
  keyValue: id,
  before: { cover: "https://x/old.jpg" },
  after: { cover: null },
});

const removeLink: RepairOperation = {
  kind: "delete-row",
  table: "links",
  keyColumn: "id",
  keyValue: "l1",
  row: { id: "l1", item_id: "a", url: "https://x/l1" },
};

const addLink: RepairOperation = {
  kind: "insert-row",
  table: "links",
  keyColumn: "id",
  keyValue: "l2",
  row: { id: "l2", item_id: "a", url: "https://x/l2" },
};

/** Items a and b with covers, and the link l1 that the manifest removes. */
function liveStore(): MemoryRowStore {
  return new MemoryRowStore([
    { table: "items", keyColumn: "id", row: { id: "a", cover: "https://x/old.jpg", title: "A" } },
    { table: "items", keyColumn: "id", row: { id: "b", cover: "https://x/old.jpg", title: "B" } },
    { table: "links", keyColumn: "id", row: { id: "l1", item_id: "a", url: "https://x/l1" } },
  ]);
}

const manifest = manifestOf([coverUpdate("a"), coverUpdate("b"), removeLink, addLink]);

async function codeOfAbort(call: Promise<unknown>): Promise<string | undefined> {
  try {
    await call;
  } catch (error) {
    return error instanceof RepairAborted ? error.code : `unexpected ${String(error)}`;
  }
  return undefined;
}

describe("where one operation stands", () => {
  it("calls an update before while the row holds the old values, whatever its other columns say", async () => {
    expect(await classifyOperation(liveStore(), coverUpdate("a"), false)).toBe("before");
  });

  it("calls an update after once the row holds the approved values", async () => {
    const store = liveStore();
    store.tamper({ table: "items", keyValue: "a" }, { cover: null });
    expect(await classifyOperation(store, coverUpdate("a"), false)).toBe("after");
  });

  it("calls an update a conflict when the column holds a third value or the row is gone", async () => {
    const store = liveStore();
    store.tamper({ table: "items", keyValue: "a" }, { cover: "https://x/manual.jpg" });
    expect(await classifyOperation(store, coverUpdate("a"), false)).toBe("conflict");
    expect(await classifyOperation(store, coverUpdate("missing"), false)).toBe("conflict");
  });

  it("judges a delete by the whole row, so a changed column is a conflict", async () => {
    const store = liveStore();
    expect(await classifyOperation(store, removeLink, false)).toBe("before");
    store.tamper({ table: "links", keyValue: "l1" }, { url: "https://x/other" });
    expect(await classifyOperation(store, removeLink, false)).toBe("conflict");
    await store.deleteRow(removeLink);
    expect(await classifyOperation(store, removeLink, false)).toBe("after");
  });

  it("judges an insert by absence, and a different row under that key is a conflict", async () => {
    const store = liveStore();
    expect(await classifyOperation(store, addLink, false)).toBe("before");
    await store.insertRow(addLink, (addLink as { row: RowValues }).row);
    expect(await classifyOperation(store, addLink, false)).toBe("after");
    store.tamper({ table: "links", keyValue: "l2" }, { url: "https://x/other" });
    expect(await classifyOperation(store, addLink, false)).toBe("conflict");
  });
});

describe("verifying", () => {
  it("counts the states and names the conflicts without writing or locking", async () => {
    const store = liveStore();
    store.tamper({ table: "items", keyValue: "b" }, { cover: "https://x/manual.jpg" });
    const report = await verifyManifest(store, manifest, MIGRATION_HASH);
    expect(report).toMatchObject({ total: 4, before: 3, after: 0, conflict: 1 });
    expect(report.conflicts).toEqual([{ index: 1, table: "items", keyValue: "b" }]);
    expect(store.writes).toEqual([]);
    expect(store.reads.every((read) => !read.lock)).toBe(true);
  });

  it("refuses a target whose newest migration is not the one the manifest names, before reading anything", async () => {
    const store = liveStore();
    expect(await codeOfAbort(verifyManifest(store, manifest, "c".repeat(64)))).toBe("REPAIR_MIGRATION_MISMATCH");
    expect(store.reads).toEqual([]);
  });
});

describe("applying", () => {
  it("writes every operation in manifest order, with the rows locked", async () => {
    const store = liveStore();
    const result = await applyManifest(store, manifest, MIGRATION_HASH);
    expect(store.writes).toEqual(["update items/a", "update items/b", "delete links/l1", "insert links/l2"]);
    expect(result).toMatchObject({ written: 4, skipped: 0 });
    expect(store.snapshot()["items/a"]).toEqual({ id: "a", cover: null, title: "A" });
    expect(store.reads.some((read) => read.lock)).toBe(true);
  });

  it("writes nothing at all when one row is in a third state", async () => {
    const store = liveStore();
    store.tamper({ table: "items", keyValue: "b" }, { cover: "https://x/manual.jpg" });
    const before = store.snapshot();
    expect(await codeOfAbort(applyManifest(store, manifest, MIGRATION_HASH))).toBe("REPAIR_THIRD_STATE");
    expect(store.writes).toEqual([]);
    expect(store.snapshot()).toEqual(before);
  });

  it("skips operations whose approved state is already there, and a second run changes nothing", async () => {
    const store = liveStore();
    await applyManifest(store, manifest, MIGRATION_HASH);
    const afterFirst = store.snapshot();
    store.writes.length = 0;
    const second = await applyManifest(store, manifest, MIGRATION_HASH);
    expect(second).toMatchObject({ written: 0, skipped: 4 });
    expect(store.writes).toEqual([]);
    expect(store.snapshot()).toEqual(afterFirst);
  });

  it("applies only what is left when part of the manifest was done by something else", async () => {
    const store = liveStore();
    store.tamper({ table: "items", keyValue: "a" }, { cover: null });
    const result = await applyManifest(store, manifest, MIGRATION_HASH);
    expect(result).toMatchObject({ written: 3, skipped: 1 });
    expect(store.writes).not.toContain("update items/a");
  });

  it("refuses a different schema before reading", async () => {
    const store = liveStore();
    expect(await codeOfAbort(applyManifest(store, manifest, "c".repeat(64)))).toBe("REPAIR_MIGRATION_MISMATCH");
    expect(store.reads).toEqual([]);
  });

  it("stops when a write did not take, so a commit never follows a repair that is not in place", async () => {
    const store = liveStore();
    store.updateColumns = async () => {};
    expect(await codeOfAbort(applyManifest(store, manifest, MIGRATION_HASH))).toBe("REPAIR_POSTCONDITION");
  });
});

describe("undoing", () => {
  it("restores every row when the inverse manifest runs after the manifest", async () => {
    const store = liveStore();
    const original = store.snapshot();
    await applyManifest(store, manifest, MIGRATION_HASH);
    expect(store.snapshot()).not.toEqual(original);
    const result = await applyManifest(store, invertManifest(manifest), MIGRATION_HASH);
    expect(result.written).toBe(4);
    expect(store.snapshot()).toEqual(original);
  });

  it("deletes the inserted row before it restores the deleted one", async () => {
    const store = liveStore();
    await applyManifest(store, manifest, MIGRATION_HASH);
    store.writes.length = 0;
    await applyManifest(store, invertManifest(manifest), MIGRATION_HASH);
    expect(store.writes).toEqual(["delete links/l2", "insert links/l1", "update items/b", "update items/a"]);
  });
});

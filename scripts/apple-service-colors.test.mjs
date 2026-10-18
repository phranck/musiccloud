import assert from "node:assert/strict";
import test from "node:test";
import { synchronizeColors } from "./apple-service-colors.mjs";

test("native brand color assets match the shared platform palette", () => {
    assert.ok(synchronizeColors() > 0);
});

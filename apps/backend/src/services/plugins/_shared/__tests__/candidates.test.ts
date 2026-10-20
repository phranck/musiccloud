import { describe, expect, it } from "vitest";
import { throwIfSearchIncomplete } from "../candidates.js";

const absent: PromiseSettledResult<string | null> = { status: "fulfilled", value: null };
const candidate: PromiseSettledResult<string | null> = { status: "fulfilled", value: "candidate" };

/** Constructs a rejected mocked candidate without any provider or repository operation. */
function failed(reason: string): PromiseSettledResult<string | null> {
  return { status: "rejected", reason: new Error(reason) };
}

describe("throwIfSearchIncomplete", () => {
  it("throws the first failure when every candidate request failed", () => {
    expect(() => throwIfSearchIncomplete([failed("first"), failed("second")], false, "melon")).toThrow("first");
  });
  it("does not turn another candidate's explicit absence into complete negative evidence", () => {
    expect(() => throwIfSearchIncomplete([failed("first"), absent], false, "melon")).toThrow("first");
  });
  it("does not treat a readable but incompatible candidate as a successful recording match", () => {
    expect(() => throwIfSearchIncomplete([candidate, failed("second")], false, "melon")).toThrow("second");
  });
  it("retains an accepted positive despite another candidate failure", () => {
    expect(() => throwIfSearchIncomplete([failed("first"), candidate], true, "melon")).not.toThrow();
  });
  it("permits a fully completed clean miss", () => {
    expect(() => throwIfSearchIncomplete([absent, candidate], false, "melon")).not.toThrow();
  });
  it("permits an empty candidate list returned by the search endpoint", () => {
    expect(() => throwIfSearchIncomplete([], false, "melon")).not.toThrow();
  });
});

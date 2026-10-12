import { describe, expect, it } from "vitest";
import { throwIfNoCandidateAnswered } from "../candidates.js";

const answered: PromiseSettledResult<string | null> = { status: "fulfilled", value: null };
const failed = (reason: string): PromiseSettledResult<string | null> => ({
  status: "rejected",
  reason: new Error(reason),
});

describe("throwIfNoCandidateAnswered", () => {
  it("throws the first failure when every candidate fetch failed", () => {
    expect(() => throwIfNoCandidateAnswered([failed("first"), failed("second")])).toThrow("first");
  });

  it("lets a search through when one candidate answered, even with nothing", () => {
    expect(() => throwIfNoCandidateAnswered([failed("first"), answered])).not.toThrow();
  });

  it("lets a search with no candidates through, because the search page answered", () => {
    expect(() => throwIfNoCandidateAnswered([])).not.toThrow();
  });
});

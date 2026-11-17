import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({ fetchSupportPrompts: vi.fn() }));
vi.mock("@/api/client", () => apiMocks);

import { loadSupportPrompts } from "./support-prompts";

/** One prompt as the backend sends it, with only the fields under test set. */
function prompt(id: string, slot: string) {
  return {
    id,
    name: `Name of ${id}`,
    slot,
    html: `<p>${id}</p>`,
    buttonLabel: "",
    buttonHref: "/support-me",
    buttonAlignment: "trailing",
    threshold: 0,
    thresholdBasis: "opened",
    priority: 0,
  };
}

describe("loadSupportPrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchSupportPrompts.mockResolvedValue({
      prompts: [
        prompt("a", "share-page"),
        prompt("b", "landing-page"),
        prompt("c", "landing-page"),
        prompt("d", "share-page"),
      ],
      limits: { maxShown: 4, snoozeDays: 14 },
    });
  });

  it("hands over only the prompts for the slot that asked, in the server's order", async () => {
    const data = await loadSupportPrompts("share-page");

    expect(data.prompts.map((entry) => entry.id)).toEqual(["a", "d"]);
  });

  it("names every live prompt, not only the ones for this slot", async () => {
    // The reader's store keeps a record per prompt and forgets the ones that no
    // longer exist. Told only about this slot's prompts it would forget the
    // other slots' records, and somebody who dismissed a prompt on one page
    // would meet it again after visiting another.
    const data = await loadSupportPrompts("share-page");

    expect(data.liveIds).toEqual(["a", "b", "c", "d"]);
  });

  it("forwards the visitor's address, so the backend counts per visitor", async () => {
    await loadSupportPrompts("landing-page", "203.0.113.7");

    expect(apiMocks.fetchSupportPrompts).toHaveBeenCalledWith("203.0.113.7");
  });

  it("answers with nothing when the backend cannot be reached", async () => {
    apiMocks.fetchSupportPrompts.mockRejectedValue(new Error("backend down"));

    const data = await loadSupportPrompts("share-page");

    expect(data.prompts).toEqual([]);
    expect(data.liveIds).toEqual([]);
    expect(data.devAlwaysShow).toBe(false);
  });
});

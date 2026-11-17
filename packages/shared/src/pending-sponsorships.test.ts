import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildCreditorReference, formatCreditorReference } from "./creditor-reference.js";
import {
  issueSponsorshipReference,
  normalizePendingSponsorshipInput,
  normalizeSponsorshipReference,
  SPONSORSHIP_REFERENCE_PATTERN,
  SPONSORSHIP_REFERENCE_TAG,
} from "./pending-sponsorships.js";

/** Cryptographically secure bytes, as the server draws them. */
const secureBytes = (size: number) => new Uint8Array(randomBytes(size));

describe("issueSponsorshipReference", () => {
  it("opens with musiccloud's own tag and holds its check digits", () => {
    const reference = issueSponsorshipReference(secureBytes);

    expect(reference).toMatch(new RegExp(SPONSORSHIP_REFERENCE_PATTERN));
    expect(reference.slice(4, 8)).toBe(SPONSORSHIP_REFERENCE_TAG);
    expect(normalizeSponsorshipReference(reference)).toBe(reference);
  });
});

describe("normalizeSponsorshipReference", () => {
  it("reads the printed form a visitor types back, in any case", () => {
    const reference = issueSponsorshipReference(secureBytes);

    expect(normalizeSponsorshipReference(formatCreditorReference(reference).toLowerCase())).toBe(reference);
  });

  it("refuses a sound reference that carries lmaa's tag rather than ours", () => {
    expect(normalizeSponsorshipReference(buildCreditorReference("SPON7Q2K9X4M8T3B"))).toBeNull();
  });

  it("refuses a reference whose check digits fail", () => {
    const reference = issueSponsorshipReference(secureBytes);
    const damaged = `${reference.slice(0, 2)}${reference[2] === "9" ? "8" : "9"}${reference.slice(3)}`;

    expect(normalizeSponsorshipReference(damaged)).toBeNull();
  });
});

describe("normalizePendingSponsorshipInput", () => {
  const VALID = { name: " Ada ", link: " chaos.social/@ada ", claim: " Music. ", amountCents: 5_000, published: true };

  it("trims the texts and sorts the address into its service", () => {
    expect(normalizePendingSponsorshipInput(VALID)).toEqual({
      name: "Ada",
      claim: "Music.",
      socialMedia: [{ platform: "mastodon", url: "https://chaos.social/@ada" }],
      amountCents: 5_000,
      published: true,
    });
  });

  it.each([
    ["a blank name", { name: "   " }],
    ["a blank sentence", { claim: "  " }],
    ["an address a page cannot link to", { link: "not an address" }],
  ])("refuses %s", (_case, change) => {
    expect(normalizePendingSponsorshipInput({ ...VALID, ...change })).toBeNull();
  });
});

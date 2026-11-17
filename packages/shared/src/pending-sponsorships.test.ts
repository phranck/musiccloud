import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildCreditorReference, formatCreditorReference } from "./creditor-reference.js";
import { DAY_MS } from "./donations.js";
import {
  issueSponsorshipReference,
  normalizePendingSponsorshipInput,
  normalizeSponsorshipReference,
  PENDING_SPONSORSHIP_DAYS,
  pendingSponsorshipCutoff,
  pendingSponsorshipDaysLeft,
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

describe("pendingSponsorshipDaysLeft", () => {
  /** Milliseconds in an hour. */
  const HOUR_MS = 60 * 60 * 1000;

  /** The moment every count starts from. */
  const NOW = new Date("2026-11-17T12:00:00.000Z");

  /**
   * The timestamp a request made some time before {@link NOW} carries.
   *
   * @param agoMs - How long before {@link NOW} it was made, in milliseconds.
   * @returns The timestamp, ISO 8601.
   */
  const madeAgo = (agoMs: number) => new Date(NOW.getTime() - agoMs).toISOString();

  it("gives a request made just now every day it stands", () => {
    expect(pendingSponsorshipDaysLeft(madeAgo(0), NOW)).toBe(PENDING_SPONSORSHIP_DAYS);
  });

  it("counts a started day as a day left", () => {
    expect(pendingSponsorshipDaysLeft(madeAgo(10 * DAY_MS), NOW)).toBe(PENDING_SPONSORSHIP_DAYS - 10);
    expect(pendingSponsorshipDaysLeft(madeAgo(PENDING_SPONSORSHIP_DAYS * DAY_MS - HOUR_MS), NOW)).toBe(1);
  });

  it("gives none once the sweep's cutoff has passed it, and none for a timestamp that does not parse", () => {
    expect(pendingSponsorshipDaysLeft(pendingSponsorshipCutoff(NOW).toISOString(), NOW)).toBe(0);
    expect(pendingSponsorshipDaysLeft(madeAgo((PENDING_SPONSORSHIP_DAYS + 5) * DAY_MS), NOW)).toBe(0);
    expect(pendingSponsorshipDaysLeft("not a day", NOW)).toBe(0);
  });

  it("never gives more than the days a request stands, even for one made in the future", () => {
    expect(pendingSponsorshipDaysLeft(madeAgo(-3 * DAY_MS), NOW)).toBe(PENDING_SPONSORSHIP_DAYS);
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

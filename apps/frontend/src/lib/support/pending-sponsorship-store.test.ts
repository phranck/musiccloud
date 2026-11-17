import {
  buildCreditorReference,
  formatCreditorReference,
  issueSponsorshipReference,
  PENDING_SPONSORSHIP_DAYS,
} from "@musiccloud/shared";
import { afterEach, describe, expect, it } from "vitest";

import {
  getIssuedSponsorship,
  PENDING_SPONSORSHIP_STORAGE_KEY,
  parseIssuedSponsorship,
  rememberIssuedSponsorship,
  subscribeIssuedSponsorship,
} from "./pending-sponsorship-store";

/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment these tests read the store at. */
const NOW = Date.UTC(2026, 10, 17);

/** A reference issued the way the backend issues one. */
const REFERENCE = issueSponsorshipReference((size) => crypto.getRandomValues(new Uint8Array(size)));

/** What a visitor announced. */
const ANNOUNCED = { name: "Ada", link: "https://chaos.social/@ada", claim: "Music.", published: false };

/**
 * A stored entry, with whatever one test changes on top.
 *
 * @param overrides - Fields to replace.
 * @returns The entry as `localStorage` holds it.
 */
function stored(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ reference: REFERENCE, issuedAt: NOW, announced: ANNOUNCED, ...overrides });
}

afterEach(() => {
  window.localStorage.clear();
});

describe("parseIssuedSponsorship", () => {
  it("reads back what was stored, with the printed form derived from the reference", () => {
    expect(parseIssuedSponsorship(stored(), NOW)).toEqual({
      reference: REFERENCE,
      referenceFormatted: formatCreditorReference(REFERENCE),
      issuedAt: NOW,
      announced: ANNOUNCED,
    });
  });

  it("brings a reference stored in its printed form, in any case, back to the form it travels in", () => {
    const entry = parseIssuedSponsorship(stored({ reference: formatCreditorReference(REFERENCE).toLowerCase() }), NOW);

    expect(entry?.reference).toBe(REFERENCE);
    expect(entry?.referenceFormatted).toBe(formatCreditorReference(REFERENCE));
  });

  it("drops a reference that is not one of musiccloud's", () => {
    expect(parseIssuedSponsorship(stored({ reference: buildCreditorReference("SPON7Q2K9X4M8T3B") }), NOW)).toBeNull();
    expect(parseIssuedSponsorship(stored({ reference: "RF00MCSP000000000000" }), NOW)).toBeNull();
  });

  it("gives nothing for anything that is not a stored entry", () => {
    for (const raw of [null, "", "not json", "[]", "null", JSON.stringify(REFERENCE)]) {
      expect(parseIssuedSponsorship(raw, NOW)).toBeNull();
    }
  });

  it("gives nothing when the moment it was issued is missing", () => {
    expect(parseIssuedSponsorship(stored({ issuedAt: "yesterday" }), NOW)).toBeNull();
  });

  it("keeps an entry on its last day", () => {
    const issuedAt = NOW - PENDING_SPONSORSHIP_DAYS * DAY_MS + 1;

    expect(parseIssuedSponsorship(stored({ issuedAt }), NOW)?.issuedAt).toBe(issuedAt);
  });

  it("drops an entry once the backend has removed the request behind it", () => {
    expect(parseIssuedSponsorship(stored({ issuedAt: NOW - PENDING_SPONSORSHIP_DAYS * DAY_MS }), NOW)).toBeNull();
  });

  it("opens an entry stored without its details on an empty form with the switch on", () => {
    expect(parseIssuedSponsorship(stored({ announced: undefined }), NOW)?.announced).toEqual({
      name: "",
      link: "",
      claim: "",
      published: true,
    });
  });
});

describe("rememberIssuedSponsorship", () => {
  it("shows the reference at once, stores it, and tells every subscriber", () => {
    let told = 0;
    const stop = subscribeIssuedSponsorship(() => {
      told += 1;
    });
    const issued = {
      reference: REFERENCE,
      referenceFormatted: formatCreditorReference(REFERENCE),
      issuedAt: Date.now(),
      announced: ANNOUNCED,
    };

    rememberIssuedSponsorship(issued);
    stop();

    expect(told).toBe(1);
    expect(getIssuedSponsorship()).toBe(issued);
    expect(JSON.parse(window.localStorage.getItem(PENDING_SPONSORSHIP_STORAGE_KEY) ?? "null")).toEqual({
      reference: REFERENCE,
      issuedAt: issued.issuedAt,
      announced: ANNOUNCED,
    });
  });

  it("is read back by the next subscriber after a reload", () => {
    window.localStorage.setItem(PENDING_SPONSORSHIP_STORAGE_KEY, stored({ issuedAt: Date.now() }));

    const stop = subscribeIssuedSponsorship(() => undefined);
    const entry = getIssuedSponsorship();
    stop();

    expect(entry?.reference).toBe(REFERENCE);
  });
});

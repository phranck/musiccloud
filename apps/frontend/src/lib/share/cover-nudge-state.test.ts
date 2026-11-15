import { describe, expect, it, vi } from "vitest";
import { createLocalStorageMock } from "@/test/localStorageMock";
import {
  COVER_NUDGE_SUPPRESSED_KEY,
  COVER_NUDGE_VISITS_KEY,
  registerCoverVisit,
  suppressCoverNudge,
} from "./cover-nudge-state";

describe("cover nudge visits", () => {
  it("nudges on every second eligible cover visit and persists the count", () => {
    const storage = createLocalStorageMock();
    const visit = () => registerCoverVisit({ storage, coverVisible: true, motionAllowed: true });

    expect(visit()).toBe(false);
    expect(visit()).toBe(true);
    expect(visit()).toBe(false);
    expect(visit()).toBe(true);
    expect(storage.getItem(COVER_NUDGE_VISITS_KEY)).toBe("4");
  });

  it("does not consume visits for a hidden cover or reduced motion", () => {
    const storage = createLocalStorageMock();

    expect(registerCoverVisit({ storage, coverVisible: false, motionAllowed: true })).toBe(false);
    expect(registerCoverVisit({ storage, coverVisible: true, motionAllowed: false })).toBe(false);
    expect(storage.getItem(COVER_NUDGE_VISITS_KEY)).toBeNull();
  });

  it("stops counting and nudging after permanent suppression", () => {
    const storage = createLocalStorageMock();
    registerCoverVisit({ storage, coverVisible: true, motionAllowed: true });

    suppressCoverNudge(storage);

    expect(registerCoverVisit({ storage, coverVisible: true, motionAllowed: true })).toBe(false);
    expect(storage.getItem(COVER_NUDGE_VISITS_KEY)).toBe("1");
    expect(storage.getItem(COVER_NUDGE_SUPPRESSED_KEY)).toBe("1");
  });

  it("repairs an invalid stored count instead of skipping the first new visit", () => {
    const storage = createLocalStorageMock();
    storage.setItem(COVER_NUDGE_VISITS_KEY, "not-a-number");

    expect(registerCoverVisit({ storage, coverVisible: true, motionAllowed: true })).toBe(false);
    expect(storage.getItem(COVER_NUDGE_VISITS_KEY)).toBe("1");
  });

  it("keeps the current view unchanged when storage is unavailable", () => {
    const storage = createLocalStorageMock();
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(registerCoverVisit({ storage, coverVisible: true, motionAllowed: true })).toBe(false);
  });
});

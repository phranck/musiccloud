import { describe, expect, it } from "vitest";
import {
  getDeezerPreviewExpiry,
  getPreviewExpiry,
  isExpiredPreviewUrl,
  isPreviewFresh,
  pickPreferredPreview,
  preferredPreviewCandidate,
  previewObservation,
} from "../lib/preview-url.js";

describe("preview-url", () => {
  const expired = "https://cdnt-preview.dzcdn.net/old.mp3?hdnea=exp=946684800~hmac=old";
  const fresh = "https://cdnt-preview.dzcdn.net/fresh.mp3?hdnea=exp=4102444800~hmac=fresh";
  const alternative = "https://example.test/preview.mp3";

  it("prefers usable Deezer audio without selecting an expired signed candidate", () => {
    expect(
      pickPreferredPreview([
        { service: "spotify", previewUrl: alternative },
        { service: "deezer", previewUrl: fresh },
      ]),
    ).toBe(fresh);
    expect(
      pickPreferredPreview([
        { service: "deezer", previewUrl: expired },
        { service: "spotify", previewUrl: alternative },
      ]),
    ).toBe(alternative);
  });

  it("keeps a usable stored fallback and drops an expired one", () => {
    expect(pickPreferredPreview([], fresh)).toBe(fresh);
    expect(pickPreferredPreview([], expired)).toBeUndefined();
    expect(pickPreferredPreview([{ service: "deezer", previewUrl: expired }], alternative)).toBe(alternative);
    expect(pickPreferredPreview([])).toBeUndefined();
  });

  it("returns the winning candidate itself, so its service can be stored", () => {
    const source = { service: "spotify", previewUrl: alternative };
    const deezerLink = { service: "deezer", previewUrl: fresh };
    expect(preferredPreviewCandidate([source, deezerLink])).toBe(deezerLink);
    expect(preferredPreviewCandidate([{ service: undefined, previewUrl: alternative }, { service: "deezer" }])).toEqual(
      {
        service: undefined,
        previewUrl: alternative,
      },
    );
    expect(preferredPreviewCandidate([{ service: "deezer", previewUrl: expired }])).toBeUndefined();
  });

  it("counts a stored row fresh while it has no expiry or expires after now", () => {
    const now = 1772793731000;
    expect(isPreviewFresh(null, now)).toBe(true);
    expect(isPreviewFresh(new Date(now + 1), now)).toBe(true);
    expect(isPreviewFresh(new Date(now), now)).toBe(false);
    expect(isPreviewFresh(new Date(now - 1), now)).toBe(false);
  });

  it("extracts deezer preview expiry timestamps from signed URLs", () => {
    const url =
      "https://cdnt-preview.dzcdn.net/api/1/1/d/7/8/0/foo.mp3?hdnea=exp=1772793731~acl=/api/1/1/d/7/8/0/foo.mp3*~data=user_id=0,application_id=42~hmac=abc";

    expect(getDeezerPreviewExpiry(url)).toBe(1772793731000);
  });

  it("reads every signed expiry through the generalized helper", () => {
    const url =
      "https://cdnt-preview.dzcdn.net/api/1/1/d/7/8/0/foo.mp3?hdnea=exp=1772793731~acl=/api/1/1/d/7/8/0/foo.mp3*~data=user_id=0,application_id=42~hmac=abc";

    expect(getPreviewExpiry(url)).toBe(1772793731000);
    expect(getPreviewExpiry("https://example.com/preview.mp3")).toBeNull();
  });

  it("builds a preview observation with the signed expiry, or null when none is encoded", () => {
    expect(previewObservation("deezer", fresh)).toEqual({
      service: "deezer",
      url: fresh,
      expiresAt: new Date(4102444800000),
    });
    expect(previewObservation("spotify", alternative)).toEqual({
      service: "spotify",
      url: alternative,
      expiresAt: null,
    });
  });

  it("marks expired deezer preview URLs as expired", () => {
    const url =
      "https://cdnt-preview.dzcdn.net/api/1/1/d/7/8/0/foo.mp3?hdnea=exp=1772793731~acl=/api/1/1/d/7/8/0/foo.mp3*~data=user_id=0,application_id=42~hmac=abc";

    expect(isExpiredPreviewUrl(url, 1772793731000)).toBe(true);
    expect(isExpiredPreviewUrl(url, 1772793730999)).toBe(false);
  });

  it("ignores non-deezer preview URLs", () => {
    expect(getDeezerPreviewExpiry("https://example.com/preview.mp3?hdnea=exp=1772793731")).toBeNull();
    expect(isExpiredPreviewUrl("https://example.com/preview.mp3?hdnea=exp=1772793731")).toBe(false);
  });
});

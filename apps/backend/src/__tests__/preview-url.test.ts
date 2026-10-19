import { describe, expect, it } from "vitest";
import {
  getDeezerPreviewExpiry,
  getPreviewExpiry,
  isExpiredDeezerPreviewUrl,
  pickPreferredPreview,
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

  it("extracts deezer preview expiry timestamps from signed URLs", () => {
    const url =
      "https://cdnt-preview.dzcdn.net/api/1/1/d/7/8/0/foo.mp3?hdnea=exp=1772793731~acl=/api/1/1/d/7/8/0/foo.mp3*~data=user_id=0,application_id=42~hmac=abc";

    expect(getDeezerPreviewExpiry(url)).toBe(1772793731000);
  });

  it("uses the generalized helper for service-aware preview expiry parsing", () => {
    const url =
      "https://cdnt-preview.dzcdn.net/api/1/1/d/7/8/0/foo.mp3?hdnea=exp=1772793731~acl=/api/1/1/d/7/8/0/foo.mp3*~data=user_id=0,application_id=42~hmac=abc";

    expect(getPreviewExpiry(url, "deezer")).toBe(1772793731000);
    expect(getPreviewExpiry("https://example.com/preview.mp3", "spotify")).toBeNull();
  });

  it("marks expired deezer preview URLs as expired", () => {
    const url =
      "https://cdnt-preview.dzcdn.net/api/1/1/d/7/8/0/foo.mp3?hdnea=exp=1772793731~acl=/api/1/1/d/7/8/0/foo.mp3*~data=user_id=0,application_id=42~hmac=abc";

    expect(isExpiredDeezerPreviewUrl(url, 1772793731000)).toBe(true);
    expect(isExpiredDeezerPreviewUrl(url, 1772793730999)).toBe(false);
  });

  it("ignores non-deezer preview URLs", () => {
    expect(getDeezerPreviewExpiry("https://example.com/preview.mp3?hdnea=exp=1772793731")).toBeNull();
    expect(isExpiredDeezerPreviewUrl("https://example.com/preview.mp3?hdnea=exp=1772793731")).toBe(false);
  });
});

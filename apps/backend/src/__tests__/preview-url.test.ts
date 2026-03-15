import { describe, expect, it } from "vitest";
import { getDeezerPreviewExpiry, isExpiredDeezerPreviewUrl } from "../lib/preview-url.js";

describe("preview-url", () => {
  it("extracts deezer preview expiry timestamps from signed URLs", () => {
    const url =
      "https://cdnt-preview.dzcdn.net/api/1/1/d/7/8/0/foo.mp3?hdnea=exp=1772793731~acl=/api/1/1/d/7/8/0/foo.mp3*~data=user_id=0,application_id=42~hmac=abc";

    expect(getDeezerPreviewExpiry(url)).toBe(1772793731000);
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

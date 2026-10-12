import { MC_ERROR_CODE_PATTERN } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/client", () => ({ fetchCcArtistInfo: vi.fn() }));

const { GET } = await import("./artist-info");

describe("GET /api/cc/artist-info", () => {
  /**
   * The artist column shows the code on its status line, and a visitor can only
   * report an incident they have an error ID for.
   */
  it("answers a missing parameter with an MC code and an error ID", async () => {
    const response = await GET({
      url: new URL("https://musiccloud.test/api/cc/artist-info?artistName=Juanitos"),
      clientAddress: "203.0.113.10",
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; errorId: string };
    expect(body.error).toMatch(MC_ERROR_CODE_PATTERN);
    expect(body.errorId).toMatch(/\S/);
  });
});

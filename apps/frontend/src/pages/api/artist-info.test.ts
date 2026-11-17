import { afterEach, describe, expect, it, vi } from "vitest";

const fetchArtistInfoMock = vi.fn();

vi.mock("@/api/client", () => ({ fetchArtistInfo: fetchArtistInfoMock }));

const { GET } = await import("./artist-info");

afterEach(() => {
  fetchArtistInfoMock.mockReset();
});

describe("GET /api/artist-info", () => {
  it("forwards an entity-only lookup instead of requiring a compatibility name", async () => {
    fetchArtistInfoMock.mockResolvedValue(new Response(JSON.stringify({ artistName: "Canonical Artist" })));

    const response = await GET({
      url: new URL("https://musiccloud.test/api/artist-info?artistEntityId=artist-entity-1&shortId=share1"),
      request: new Request("https://musiccloud.test/api/artist-info"),
      clientAddress: "203.0.113.10",
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    expect(fetchArtistInfoMock).toHaveBeenCalledWith("", undefined, "203.0.113.10", {
      artistEntityId: "artist-entity-1",
      shortId: "share1",
      refresh: undefined,
    });
  });

  it("forwards the address the ingress appended, not the one the caller forged", async () => {
    fetchArtistInfoMock.mockResolvedValue(new Response(JSON.stringify({ artistName: "Canonical Artist" })));

    await GET({
      url: new URL("https://musiccloud.test/api/artist-info?artistEntityId=artist-entity-1"),
      request: new Request("https://musiccloud.test/api/artist-info", {
        headers: { "x-forwarded-for": "198.51.100.7, 203.0.113.20" },
      }),
      // What Astro works out: the first, forged value.
      clientAddress: "198.51.100.7",
    } as Parameters<typeof GET>[0]);

    expect(fetchArtistInfoMock.mock.calls[0]?.[2]).toBe("203.0.113.20");
  });

  it("keeps local validation in the canonical public error envelope", async () => {
    const response = await GET({
      url: new URL("https://musiccloud.test/api/artist-info"),
      request: new Request("https://musiccloud.test/api/artist-info"),
      clientAddress: "203.0.113.10",
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
  });

  it("forwards the backend cache policy unchanged", async () => {
    fetchArtistInfoMock.mockResolvedValue(
      new Response(JSON.stringify({ artistName: "Canonical Artist" }), {
        headers: { "Cache-Control": "private, max-age=60", "Content-Type": "application/json" },
      }),
    );

    const response = await GET({
      url: new URL("https://musiccloud.test/api/artist-info?artistEntityId=artist-entity-1"),
      request: new Request("https://musiccloud.test/api/artist-info"),
      clientAddress: "203.0.113.10",
    } as Parameters<typeof GET>[0]);

    expect(response.headers.get("Cache-Control")).toBe("private, max-age=60");
  });
});

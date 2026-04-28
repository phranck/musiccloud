import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDeezerFanCount } from "../artist-fans";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchDeezerFanCount", () => {
  it("returns nb_fan on success", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 27, name: "Daft Punk", nb_fan: 9123456 }));
    await expect(fetchDeezerFanCount("27")).resolves.toBe(9123456);
  });

  it("returns null when nb_fan missing from payload", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 27, name: "Daft Punk" }));
    await expect(fetchDeezerFanCount("27")).resolves.toBeNull();
  });

  it("returns null on HTTP error", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse("server down", 503));
    await expect(fetchDeezerFanCount("27")).resolves.toBeNull();
  });

  it("returns null on Deezer API error envelope", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ error: { type: "DataException", message: "no data", code: 800 } }));
    await expect(fetchDeezerFanCount("999999")).resolves.toBeNull();
  });

  it("returns null when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(fetchDeezerFanCount("27")).resolves.toBeNull();
  });

  it("URL-encodes the artist ID", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 27, nb_fan: 1 }));
    await fetchDeezerFanCount("27 weird id");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/artist/27%20weird%20id"), expect.anything());
  });
});

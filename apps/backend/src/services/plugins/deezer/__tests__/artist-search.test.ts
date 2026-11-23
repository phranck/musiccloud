import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamUnavailableError } from "../../../../lib/infra/upstream-unavailable";
import { fetchDeezerArtistImage } from "../artist-image";
import { DEEZER_ARTIST_SEARCH_LIMIT, searchDeezerArtist } from "../artist-search";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

/**
 * Builds a minimal `fetch` response for Deezer's keyless API.
 *
 * @param body - The JSON body Deezer answers.
 * @returns A response whose `json()` and `text()` yield `body`.
 */
function mockResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

/** Deezer's answer for `Fön`: an artist named FON first, and no FöN at all. */
const FON_FIRST_ANSWER = {
  data: [
    { id: 305746, name: "FON", picture_xl: "https://cdn-images.dzcdn.net/images/artist/fon/1000x1000.jpg" },
    {
      id: 14175163,
      name: "Fontaines D.C.",
      picture_xl: "https://cdn-images.dzcdn.net/images/artist/fdc/1000x1000.jpg",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchDeezerArtist", () => {
  it("rejects a first hit whose name only looks similar", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(FON_FIRST_ANSWER));
    await expect(searchDeezerArtist("Fön")).resolves.toBeNull();
  });

  it("picks the matching artist when Deezer ranks another one first", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ data: [...FON_FIRST_ANSWER.data, { id: 110231102, name: "FöN" }] }));
    await expect(searchDeezerArtist("Fön")).resolves.toMatchObject({ id: 110231102, name: "FöN" });
  });

  it("reads several hits, not only the first", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ data: [] }));
    await searchDeezerArtist("Fön");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`&limit=${DEEZER_ARTIST_SEARCH_LIMIT}`),
      expect.anything(),
    );
  });

  it("reports an answer without its artist collection as unavailable", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ total: 0 }));
    await expect(searchDeezerArtist("Fön")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe("fetchDeezerArtistImage", () => {
  it("shows no picture of another artist", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(FON_FIRST_ANSWER));
    await expect(fetchDeezerArtistImage("Fön")).resolves.toBeNull();
  });
});

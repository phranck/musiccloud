/**
 * @file Every error a backend proxy route under `pages/api` answers carries an
 * `MC-*` code and an error ID: the backend's own error body where it sent one,
 * and an envelope the route builds where it did not.
 */
import type { APIRoute } from "astro";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Stands in for the backend call of the Creative Commons audio route. */
const fetchCcAudioMock = vi.fn();
/** Stands in for the backend call of the Creative Commons download route. */
const fetchCcDownloadMock = vi.fn();
/** Stands in for the backend call of the commercial genre artwork route. */
const fetchGenreArtworkMock = vi.fn();
/** Stands in for the backend call of the Creative Commons genre artwork route. */
const fetchCcGenreArtworkMock = vi.fn();
/** Stands in for the backend call of the sponsors route. */
const fetchSponsorsMock = vi.fn();
/** Stands in for the backend call of the sponsor picture route. */
const fetchSponsorAvatarMock = vi.fn();
/** Stands in for the backend call of the share preview route. */
const fetchSharePreviewMock = vi.fn();

vi.mock("@/api/client", () => ({
  fetchCcAudio: fetchCcAudioMock,
  fetchCcDownload: fetchCcDownloadMock,
  fetchGenreArtwork: fetchGenreArtworkMock,
  fetchCcGenreArtwork: fetchCcGenreArtworkMock,
  fetchSponsors: fetchSponsorsMock,
  fetchSponsorAvatar: fetchSponsorAvatarMock,
  fetchSharePreview: fetchSharePreviewMock,
}));

const { GET: ccAudioGet } = await import("./cc/audio/[jamendoId]");
const { GET: ccDownloadGet } = await import("./cc/download/[jamendoId]");
const { GET: genreArtworkGet } = await import("./genre-artwork/[genreKey]");
const { GET: ccGenreArtworkGet } = await import("./cc/genre-artwork/[genreKey]");
const { GET: sponsorsGet } = await import("./sponsors");
const { GET: sponsorAvatarGet } = await import("./sponsor-avatars/[avatarId]");
const { GET: sharePreviewGet } = await import("./share-preview/[shortId]");

/** The origin the proxy routes are called on in these tests. */
const SITE_ORIGIN = "https://musiccloud.test";

/** The visitor address the proxy routes forward. */
const VISITOR_ADDRESS = "203.0.113.10";

/** A sponsor picture id the route accepts: a SHA-256 in hex. */
const VALID_AVATAR_ID = "a".repeat(64);

/** The status of a backend refusal in these tests: not found. */
const NOT_FOUND_STATUS = 404;

/** The status of an answer the backend could not complete. */
const SERVICE_UNAVAILABLE_STATUS = 503;

/** The status a route refuses an incomplete address with. */
const BAD_REQUEST_STATUS = 400;

/** The error body the backend sends in these tests, with its own code and incident reference. */
const BACKEND_ERROR_BODY = JSON.stringify({
  error: "MC-RES-0001",
  errorId: "backend-incident-1",
  message: "This track doesn't seem to be available anymore on the source service. (MC-RES-0001)",
});

/**
 * Builds the backend's error answer.
 *
 * @returns A fresh `404` carrying {@link BACKEND_ERROR_BODY} as JSON.
 */
function backendErrorResponse(): Response {
  return new Response(BACKEND_ERROR_BODY, {
    status: NOT_FOUND_STATUS,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Builds a backend answer whose headers arrived and whose body then broke off.
 *
 * @returns A `200` whose body stream fails when it is read.
 */
function brokenBodyResponse(): Response {
  return new Response(
    new ReadableStream({
      pull(controller) {
        controller.error(new TypeError("terminated"));
      },
    }),
  );
}

/**
 * Calls a proxy route the way Astro does for a `GET`.
 *
 * @param route - The handler under test.
 * @param path - The path the browser requests.
 * @param params - The route parameters Astro reads from the path.
 * @returns The handler's answer.
 */
async function callRoute(route: APIRoute, path: string, params: Record<string, string | undefined>): Promise<Response> {
  return route({
    params,
    url: new URL(`${SITE_ORIGIN}${path}`),
    request: new Request(`${SITE_ORIGIN}${path}`),
    clientAddress: VISITOR_ADDRESS,
    // The proxy routes read only these fields of Astro's context.
  } as unknown as Parameters<APIRoute>[0]) as Promise<Response>;
}

/** Every proxy route that relays a backend answer, with a valid call and its backend mock. */
const RELAYING_ROUTES = [
  {
    name: "cc/audio",
    call: () => callRoute(ccAudioGet, "/api/cc/audio/1", { jamendoId: "1" }),
    backend: fetchCcAudioMock,
  },
  {
    name: "cc/download",
    call: () => callRoute(ccDownloadGet, "/api/cc/download/1", { jamendoId: "1" }),
    backend: fetchCcDownloadMock,
  },
  {
    name: "genre-artwork",
    call: () => callRoute(genreArtworkGet, "/api/genre-artwork/rock", { genreKey: "rock" }),
    backend: fetchGenreArtworkMock,
  },
  {
    name: "cc/genre-artwork",
    call: () => callRoute(ccGenreArtworkGet, "/api/cc/genre-artwork/rock", { genreKey: "rock" }),
    backend: fetchCcGenreArtworkMock,
  },
  { name: "sponsors", call: () => callRoute(sponsorsGet, "/api/sponsors", {}), backend: fetchSponsorsMock },
  {
    name: "sponsor-avatars",
    call: () => callRoute(sponsorAvatarGet, `/api/sponsor-avatars/${VALID_AVATAR_ID}`, { avatarId: VALID_AVATAR_ID }),
    backend: fetchSponsorAvatarMock,
  },
  {
    name: "share-preview",
    call: () => callRoute(sharePreviewGet, "/api/share-preview/abc123", { shortId: "abc123" }),
    backend: fetchSharePreviewMock,
  },
];

/** The routes that read the whole backend body before answering, so a broken body reaches them. */
const BUFFERING_ROUTES = RELAYING_ROUTES.filter(({ name }) =>
  ["genre-artwork", "cc/genre-artwork", "sponsors", "sponsor-avatars", "share-preview"].includes(name),
);

afterEach(() => {
  for (const { backend } of RELAYING_ROUTES) backend.mockReset();
});

describe.each(RELAYING_ROUTES)("$name proxy route", ({ call, backend }) => {
  it("relays the backend's error body with its status and Content-Type", async () => {
    backend.mockResolvedValue(backendErrorResponse());

    const response = await call();

    expect(response.status).toBe(NOT_FOUND_STATUS);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    await expect(response.text()).resolves.toBe(BACKEND_ERROR_BODY);
  });
});

describe.each(BUFFERING_ROUTES)("$name proxy route", ({ call, backend }) => {
  it("answers a backend body that breaks off with 503 and MC-SYS-0002, and logs that error ID", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    backend.mockResolvedValue(brokenBodyResponse());

    const response = await call();

    expect(response.status).toBe(SERVICE_UNAVAILABLE_STATUS);
    const body = await response.json();
    expect(body).toMatchObject({ error: "MC-SYS-0002", errorId: expect.any(String) });
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(errorLog.mock.calls[0]?.[0]))).toMatchObject({
      errorId: body.errorId,
      outcome: "body_interrupted",
      operation: expect.stringMatching(/_proxy$/),
    });
    errorLog.mockRestore();
  });
});

describe("share-preview proxy route", () => {
  it("passes a preview answer on as JSON", async () => {
    fetchSharePreviewMock.mockResolvedValue(
      new Response(JSON.stringify({ previewUrl: null }), { headers: { "Content-Type": "application/json" } }),
    );

    const response = await callRoute(sharePreviewGet, "/api/share-preview/abc123", { shortId: "abc123" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({ previewUrl: null });
  });
});

describe("refusals the proxy routes make themselves", () => {
  it.each([
    ["cc/audio", () => callRoute(ccAudioGet, "/api/cc/audio/", { jamendoId: undefined })],
    ["cc/download", () => callRoute(ccDownloadGet, "/api/cc/download/", { jamendoId: undefined })],
    ["genre-artwork", () => callRoute(genreArtworkGet, "/api/genre-artwork/100%25", { genreKey: "100%" })],
    ["cc/genre-artwork", () => callRoute(ccGenreArtworkGet, "/api/cc/genre-artwork/100%25", { genreKey: "100%" })],
    ["share-preview", () => callRoute(sharePreviewGet, "/api/share-preview/", { shortId: undefined })],
  ])("%s refuses an incomplete address with 400 and MC-REQ-0001", async (_name, call) => {
    const response = await call();

    expect(response.status).toBe(BAD_REQUEST_STATUS);
    await expect(response.json()).resolves.toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
  });

  it("sponsor-avatars answers an id that is not a SHA-256 with 404 and MC-RES-0003", async () => {
    const response = await callRoute(sponsorAvatarGet, "/api/sponsor-avatars/nope", { avatarId: "nope" });

    expect(response.status).toBe(NOT_FOUND_STATUS);
    await expect(response.json()).resolves.toMatchObject({ error: "MC-RES-0003", errorId: expect.any(String) });
    expect(fetchSponsorAvatarMock).not.toHaveBeenCalled();
  });
});

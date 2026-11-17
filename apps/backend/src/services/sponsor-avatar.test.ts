/**
 * @file Tests for the sponsor picture lookup.
 *
 * Ported from lmaa.space `apps/backend/src/__tests__/sponsor-avatar.test.ts`.
 * Adapted: lmaa mocked `isPublicFetchTarget` and the global `fetch`. Here the
 * real `fetchWithTimeout` guard runs, built by `createFetchWithTimeout` with a
 * resolver and a transport the test controls, so a refused address is refused
 * by the same code production uses, and the transport shows whether a request
 * left at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OutboundTransport, ResolveAddresses } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
import { fetchPreviewImage } from "../lib/preview-image.js";
import { resolveSponsorAvatar } from "./sponsor-avatar.js";

const outbound = vi.hoisted(() => ({
  resolve: vi.fn<Parameters<ResolveAddresses>, ReturnType<ResolveAddresses>>(),
  transport: vi.fn<Parameters<OutboundTransport>, ReturnType<OutboundTransport>>(),
}));

vi.mock("../lib/infra/fetch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/infra/fetch.js")>();
  return {
    ...actual,
    fetchWithTimeout: actual.createFetchWithTimeout({
      resolve: (hostname) => outbound.resolve(hostname),
      transport: (target, init, addresses) => outbound.transport(target, init, addresses),
    }),
  };
});

vi.mock("../lib/preview-image.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/preview-image.js")>();
  return { ...actual, fetchPreviewImage: vi.fn() };
});

/** A public address every host resolves to unless a test says otherwise. */
const PUBLIC_ADDRESS = { address: "93.184.216.34", family: 4 } as const;
/** A private address, which the guard must refuse before any request. */
const PRIVATE_ADDRESS = { address: "10.0.0.5", family: 4 } as const;
/** The loopback address, which the guard must refuse before any request. */
const LOOPBACK_ADDRESS = { address: "127.0.0.1", family: 4 } as const;

const previewImage = vi.mocked(fetchPreviewImage);

/**
 * Builds the JSON answer of a lookup API.
 *
 * @param body - The value to serialize.
 * @returns A fresh `200` response, since a body can be read only once.
 */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

/**
 * The addresses the transport was asked for, in order.
 *
 * @returns One `href` per request that left.
 */
function requestedUrls(): string[] {
  return outbound.transport.mock.calls.map(([target]) => target.href);
}

describe("resolveSponsorAvatar", () => {
  beforeEach(() => {
    outbound.resolve.mockResolvedValue([PUBLIC_ADDRESS]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("asks the sponsor's own Mastodon instance about the account", async () => {
    outbound.transport.mockImplementation(async () =>
      jsonResponse({ avatar_static: "https://oldbytes.space/avatar.png" }),
    );

    const avatar = await resolveSponsorAvatar([{ platform: "mastodon", url: "https://oldbytes.space/@lmaa" }]);

    expect(avatar).toBe("https://oldbytes.space/avatar.png");
    expect(requestedUrls()).toEqual(["https://oldbytes.space/api/v1/accounts/lookup?acct=lmaa"]);
  });

  it("takes the animated picture when there is no still one", async () => {
    outbound.transport.mockImplementation(async () => jsonResponse({ avatar: "https://oldbytes.space/a.gif" }));

    const avatar = await resolveSponsorAvatar([{ platform: "mastodon", url: "https://oldbytes.space/@lmaa" }]);

    expect(avatar).toBe("https://oldbytes.space/a.gif");
  });

  it("asks Bluesky's public API about a handle", async () => {
    outbound.transport.mockImplementation(async () => jsonResponse({ avatar: "https://cdn.bsky.app/avatar.jpg" }));

    const avatar = await resolveSponsorAvatar([{ platform: "bluesky", url: "https://bsky.app/profile/lmaa.space" }]);

    expect(avatar).toBe("https://cdn.bsky.app/avatar.jpg");
    expect(requestedUrls()).toEqual(["https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=lmaa.space"]);
  });

  it("asks a forge for the picture at the account's own address", async () => {
    outbound.transport.mockImplementation(
      async () => new Response(null, { status: 200, headers: { "content-type": "image/png" } }),
    );

    const avatar = await resolveSponsorAvatar([{ platform: "github", url: "https://github.com/phranck" }]);

    expect(avatar).toBe("https://github.com/phranck.png");
    expect(outbound.transport.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
  });

  it("refuses a picture that is not a public HTTPS address", async () => {
    outbound.transport.mockImplementation(async () => jsonResponse({ avatar: "http://127.0.0.1/avatar.png" }));

    expect(await resolveSponsorAvatar([{ platform: "mastodon", url: "https://oldbytes.space/@lmaa" }])).toBeNull();
  });

  it("refuses a picture whose HTTPS address names a private range", async () => {
    outbound.transport.mockImplementation(async () => jsonResponse({ avatar: "https://10.0.0.1/avatar.png" }));

    expect(await resolveSponsorAvatar([{ platform: "mastodon", url: "https://oldbytes.space/@lmaa" }])).toBeNull();
  });

  it("never sends a request to a host that resolves to a private address", async () => {
    outbound.resolve.mockResolvedValue([PRIVATE_ADDRESS]);
    const deviation = vi.spyOn(log, "deviation").mockImplementation(() => undefined);

    expect(await resolveSponsorAvatar([{ platform: "mastodon", url: "https://internal.example/@lmaa" }])).toBeNull();

    expect(outbound.resolve).toHaveBeenCalledWith("internal.example");
    expect(outbound.transport).not.toHaveBeenCalled();
    // The host and the reason are logged, and nothing the host could have sent.
    expect(deviation).toHaveBeenCalledWith(
      expect.objectContaining({ component: "SponsorAvatar", host: "internal.example" }),
      expect.objectContaining({ message: "Blocked non-public outbound target" }),
    );
  });

  it("never sends a request to a loopback address written into the profile", async () => {
    vi.spyOn(log, "deviation").mockImplementation(() => undefined);

    expect(await resolveSponsorAvatar([{ platform: "mastodon", url: "https://127.0.0.1/@lmaa" }])).toBeNull();

    expect(outbound.transport).not.toHaveBeenCalled();
  });

  it("refuses a redirect to a private address without following it", async () => {
    vi.spyOn(log, "deviation").mockImplementation(() => undefined);
    outbound.resolve.mockImplementation(async (hostname) =>
      hostname === "internal.example" ? [LOOPBACK_ADDRESS] : [PUBLIC_ADDRESS],
    );
    outbound.transport.mockImplementation(
      async () => new Response(null, { status: 302, headers: { location: "https://internal.example/phranck.png" } }),
    );

    expect(await resolveSponsorAvatar([{ platform: "codeberg", url: "https://codeberg.org/phranck" }])).toBeNull();

    expect(requestedUrls()).toEqual(["https://codeberg.org/phranck.png"]);
  });

  it("refuses any redirect from a lookup API", async () => {
    vi.spyOn(log, "deviation").mockImplementation(() => undefined);
    outbound.transport.mockImplementation(
      async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }),
    );

    expect(await resolveSponsorAvatar([{ platform: "mastodon", url: "https://oldbytes.space/@lmaa" }])).toBeNull();
    expect(outbound.transport).toHaveBeenCalledTimes(1);
  });

  it("sends a direct lookup over HTTPS only", async () => {
    expect(await resolveSponsorAvatar([{ platform: "mastodon", url: "http://oldbytes.space/@lmaa" }])).toBeNull();
    expect(outbound.transport).not.toHaveBeenCalled();
  });

  it("gives up on a lookup answer larger than any account", async () => {
    outbound.transport.mockImplementation(
      async () =>
        new Response(JSON.stringify({ avatar: "https://oldbytes.space/a.png" }), {
          headers: { "content-length": String(10 * 1024 * 1024) },
        }),
    );

    expect(await resolveSponsorAvatar([{ platform: "mastodon", url: "https://oldbytes.space/@lmaa" }])).toBeNull();
  });

  it("reads a page for any service that answers no such question directly", async () => {
    previewImage.mockResolvedValue({ url: "https://example.org/logo.png", via: "og:image" });

    expect(await resolveSponsorAvatar([{ platform: "tumblr", url: "https://example.tumblr.com" }])).toBe(
      "https://example.org/logo.png",
    );
    expect(previewImage).toHaveBeenCalledWith("https://example.tumblr.com", {
      intent: "portrait",
    });
  });

  it("asks a profile for a portrait and a website for its mark", async () => {
    previewImage.mockResolvedValue({ url: "https://example.org/picture.png", via: "og:image" });

    await resolveSponsorAvatar([{ platform: "xing", url: "https://xing.com/profile/somebody" }]);
    expect(previewImage).toHaveBeenCalledWith("https://xing.com/profile/somebody", {
      intent: "portrait",
    });

    previewImage.mockClear();
    await resolveSponsorAvatar([{ platform: "website", url: "https://example.org" }]);
    expect(previewImage).toHaveBeenCalledWith("https://example.org", { intent: "site-mark" });
  });

  it("takes a portrait over a page, and a page over a website's own mark", async () => {
    outbound.transport.mockImplementation(async () => jsonResponse({ avatar: "https://oldbytes.space/portrait.png" }));
    previewImage.mockResolvedValue({ url: "https://example.org/logo.png", via: "og:image" });

    const avatar = await resolveSponsorAvatar([
      { platform: "website", url: "https://example.org" },
      { platform: "tumblr", url: "https://example.tumblr.com" },
      { platform: "mastodon", url: "https://oldbytes.space/@lmaa" },
    ]);

    expect(avatar).toBe("https://oldbytes.space/portrait.png");
    expect(previewImage).not.toHaveBeenCalled();
  });

  it("falls back to the website only once everything else has been tried", async () => {
    previewImage.mockImplementation(async (url: string) =>
      url === "https://example.org" ? { url: "https://example.org/logo.png", via: "icon" } : null,
    );

    const avatar = await resolveSponsorAvatar([
      { platform: "website", url: "https://example.org" },
      { platform: "tumblr", url: "https://example.tumblr.com" },
    ]);

    expect(avatar).toBe("https://example.org/logo.png");
    expect(previewImage.mock.calls.map(([url]) => url)).toEqual(["https://example.tumblr.com", "https://example.org"]);
  });

  it("gives nothing when no address yields a picture", async () => {
    previewImage.mockResolvedValue(null);
    expect(await resolveSponsorAvatar([{ platform: "website", url: "https://example.org" }])).toBeNull();
  });
});

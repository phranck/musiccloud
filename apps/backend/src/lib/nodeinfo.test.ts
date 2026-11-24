/**
 * @file Tests for asking a host which software it runs, through NodeInfo.
 *
 * Ported from lmaa.space `apps/backend/src/__tests__/og.test.ts`. Adapted: the
 * requests run through the real `fetchWithTimeout`, whose hops `vitest.setup.ts`
 * routes to the global `fetch` stubbed here and whose DNS answers it fixes, so
 * the guard that refuses private targets is the production one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubNetwork } from "./__tests__/network-stub.js";
import { log } from "./infra/logger.js";
import { detectPlatformFromHost } from "./nodeinfo.js";

describe("detectPlatformFromHost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The status a host answers with when it speaks no NodeInfo. */
  const NOT_FOUND_STATUS = 404;

  /**
   * Answers the two NodeInfo requests a host is asked: the well-known document
   * that says where the real one lives, and the real one.
   *
   * @param software - What the host reports running, or `null` for a host that
   *   answers nothing.
   */
  function stubNodeinfo(software: string | null) {
    stubNetwork((url) => {
      if (software === null) return new Response("nope", { status: NOT_FOUND_STATUS });
      if (url.endsWith("/.well-known/nodeinfo")) {
        return Response.json({
          links: [
            { rel: "http://nodeinfo.diaspora.software/ns/schema/2.0", href: "https://host.example/n/2.0" },
            { rel: "http://nodeinfo.diaspora.software/ns/schema/2.1", href: "https://host.example/n/2.1" },
          ],
        });
      }
      return Response.json({ software: { name: software, version: "0.12.7" } });
    });
  }

  it("names the service a host reports running", async () => {
    stubNodeinfo("pixelfed");
    expect(await detectPlatformFromHost("https://pixey.org/somebody")).toBe("pixelfed");
  });

  it("does not care what the operator called the place", async () => {
    // Measured across twelve instances: their names ran from "Pixey" to
    // "FediSnap", whilst every one of them reported `pixelfed` here.
    stubNodeinfo("Pixelfed");
    expect(await detectPlatformFromHost("https://fedisnap.com/somebody")).toBe("pixelfed");
  });

  it("answers for anything else that speaks NodeInfo", async () => {
    stubNodeinfo("mastodon");
    expect(await detectPlatformFromHost("https://oldbytes.space/@somebody")).toBe("mastodon");
  });

  it("names Friendica, which its own addresses cannot say either", async () => {
    // Measured on friend.enby-box.de on 2026-08-24: `software.name` is
    // `friendica`, whilst `/profile/jaddy` looks like a page on any site.
    stubNodeinfo("friendica");
    expect(await detectPlatformFromHost("https://friend.enby-box.de/profile/jaddy")).toBe("friendica");
  });

  it("leaves a host running something unmapped alone", async () => {
    stubNodeinfo("lemmy");
    expect(await detectPlatformFromHost("https://example.org/c/somewhere")).toBeNull();
  });

  it("leaves an ordinary website alone", async () => {
    stubNodeinfo(null);
    expect(await detectPlatformFromHost("https://example.org/somebody")).toBeNull();
  });

  it("refuses what is not an address", async () => {
    stubNodeinfo("pixelfed");
    expect(await detectPlatformFromHost("not an address")).toBeNull();
  });

  it("never asks a host on a private address", async () => {
    vi.spyOn(log, "deviation").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await detectPlatformFromHost("http://10.0.0.1/somebody")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

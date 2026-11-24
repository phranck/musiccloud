import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/infra/fetch", () => ({
  fetchWithTimeout: vi.fn(async () => new Response("")),
}));

import { fetchWithTimeout } from "../../../../lib/infra/fetch";
import {
  ENGLISH_ACCEPT_LANGUAGE,
  fetchProviderPage,
  PAGE_ACCEPT,
  PROVIDER_REQUEST_TIMEOUT_MS,
  withQueryParam,
} from "../browser-fetch.js";
import { SCRAPER_USER_AGENT } from "../user-agent.js";

/** The address every request in these tests goes to. */
const PAGE_URL = "https://example.test/page";

/** A timeout that differs from the default, to see that it is passed on. */
const CUSTOM_TIMEOUT_MS = 1234;

/** The mocked transport, typed so its recorded calls can be read. */
const transport = vi.mocked(fetchWithTimeout);

beforeEach(() => {
  transport.mockClear();
});

describe("fetchProviderPage", () => {
  it("sends only the user agent, within the default timeout, when nothing else is named", async () => {
    await fetchProviderPage(PAGE_URL);

    expect(transport).toHaveBeenCalledWith(
      PAGE_URL,
      { headers: { "User-Agent": SCRAPER_USER_AGENT } },
      PROVIDER_REQUEST_TIMEOUT_MS,
    );
  });

  it("sends the named Accept and Accept-Language values and the named timeout", async () => {
    await fetchProviderPage(PAGE_URL, {
      accept: PAGE_ACCEPT,
      acceptLanguage: ENGLISH_ACCEPT_LANGUAGE,
      timeoutMs: CUSTOM_TIMEOUT_MS,
    });

    expect(transport).toHaveBeenCalledWith(
      PAGE_URL,
      {
        headers: {
          "User-Agent": SCRAPER_USER_AGENT,
          Accept: PAGE_ACCEPT,
          "Accept-Language": ENGLISH_ACCEPT_LANGUAGE,
        },
      },
      CUSTOM_TIMEOUT_MS,
    );
  });

  it("keeps the method and body of the request and lets its headers win", async () => {
    await fetchProviderPage(PAGE_URL, {
      headers: { Referer: "https://example.test/", "Content-Type": "text/plain" },
      init: { method: "POST", body: "payload", headers: { "Content-Type": "application/json" } },
    });

    expect(transport).toHaveBeenCalledWith(
      PAGE_URL,
      {
        method: "POST",
        body: "payload",
        headers: {
          "User-Agent": SCRAPER_USER_AGENT,
          Referer: "https://example.test/",
          "Content-Type": "application/json",
        },
      },
      PROVIDER_REQUEST_TIMEOUT_MS,
    );
  });
});

describe("withQueryParam", () => {
  it("starts a query on a URL without one", () => {
    expect(withQueryParam("https://example.test/v1/tracks", "key", "abc")).toBe(
      "https://example.test/v1/tracks?key=abc",
    );
  });

  it("appends to an existing query and leaves its encoding byte for byte", () => {
    expect(withQueryParam("https://example.test/search?q=a%20b+c", "key", "abc")).toBe(
      "https://example.test/search?q=a%20b+c&key=abc",
    );
  });
});

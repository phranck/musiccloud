import { describe, expect, it } from "vitest";
import { TRUSTED_PROXY_HOPS, visitorAddress } from "./visitor-address.js";

/**
 * A context as Astro hands it over, with an optional `X-Forwarded-For`.
 *
 * @param forwardedFor - The header's value, or `undefined` for none.
 * @param clientAddress - What Astro worked out.
 */
function context(forwardedFor: string | undefined, clientAddress = "10.0.0.9") {
  const headers = new Headers(forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor });
  return { request: new Request("https://musiccloud.io/api/sponsorships", { headers }), clientAddress };
}

describe("visitorAddress", () => {
  it("trusts one proxy hop, as the backend's TRUST_PROXY does", () => {
    expect(TRUSTED_PROXY_HOPS).toBe(1);
  });

  it("takes the value the ingress appended, never the one the caller wrote", () => {
    expect(visitorAddress(context("198.51.100.7, 203.0.113.20"))).toBe("203.0.113.20");
  });

  it("takes the only value when the caller wrote none", () => {
    expect(visitorAddress(context("203.0.113.20"))).toBe("203.0.113.20");
  });

  it("ignores empty entries and spaces", () => {
    expect(visitorAddress(context(" 198.51.100.7 ,, 203.0.113.20 , "))).toBe("203.0.113.20");
  });

  it("falls back to Astro's address when no proxy wrote the header", () => {
    expect(visitorAddress(context(undefined))).toBe("10.0.0.9");
    expect(visitorAddress(context(""))).toBe("10.0.0.9");
  });

  it("does not read Astro's address when the header answers, because a prerendered page throws on it", () => {
    const throwing = {
      request: context("203.0.113.20").request,
      get clientAddress(): string {
        throw new Error("clientAddress is not available on a prerendered page");
      },
    };
    expect(visitorAddress(throwing)).toBe("203.0.113.20");
  });
});

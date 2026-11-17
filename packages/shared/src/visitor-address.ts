/**
 * @file The visitor's address, read the way the backend reads it.
 *
 * Astro's `clientAddress` takes the first value of `X-Forwarded-For`
 * (`getFirstForwardedValue` in `astro/dist/core/app/node.js`). The Zerops
 * ingress appends the address it saw to whatever the caller sent rather than
 * replacing it, so the first value is whatever the caller chose to write, and
 * every per-address limit behind the site's and the developer portal's proxies
 * would count a forged value.
 *
 * The backend trusts exactly one proxy hop (`TRUST_PROXY=1` in `zerops.yml`),
 * which makes it read the last value, the one the ingress appended. This file
 * reads the same value, so the address an Astro app forwards is the address
 * the backend would have seen had the visitor called it directly. Both the
 * site and the developer portal read the visitor through it.
 */

/**
 * How many proxies stand between the visitor and this server and append to
 * `X-Forwarded-For`: 1, the Zerops ingress. It has to match `TRUST_PROXY` in
 * the backend's `zerops.yml` setup, because both decide which value is real.
 */
export const TRUSTED_PROXY_HOPS = 1;

/** The header the ingress appends the visitor's address to. */
const FORWARDED_FOR_HEADER = "x-forwarded-for";

/**
 * What this file needs of an Astro context: the request and the address Astro
 * worked out. The request is described by the one method read from it, so the
 * shared package needs no DOM types.
 */
export interface VisitorAddressContext {
  /** The incoming request, whose `X-Forwarded-For` header is read. */
  request: { headers: { get(name: string): string | null } };
  /** Astro's address, used only when no proxy wrote the header, as in local development. */
  clientAddress: string;
}

/**
 * The address of the visitor, as the trusted proxy saw it.
 *
 * @param context - An Astro page or endpoint context, or anything with its `request` and `clientAddress`.
 * @returns The value {@link TRUSTED_PROXY_HOPS} from the end of `X-Forwarded-For`,
 *   or Astro's `clientAddress` when the header holds fewer values than that,
 *   which is a request no proxy handled. `clientAddress` is read only in that
 *   case, because Astro throws when it is read on a prerendered page.
 */
export function visitorAddress(context: VisitorAddressContext): string {
  const forwarded = (context.request.headers.get(FORWARDED_FOR_HEADER) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
  if (forwarded.length >= TRUSTED_PROXY_HOPS) {
    return forwarded[forwarded.length - TRUSTED_PROXY_HOPS] as string;
  }
  return context.clientAddress;
}

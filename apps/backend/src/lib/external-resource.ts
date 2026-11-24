/**
 * @file Fetches a resource from a site musiccloud does not control, through
 * the guarded outbound fetch, and holds what every such request shares: the
 * browser headers, the log component and error code, and the host a log line
 * names.
 *
 * Every request goes through `fetchWithTimeout`, which checks each redirect hop
 * and every connection against private and reserved addresses. Failures are
 * logged through `log.deviation` with the host and the reason. Used by the
 * preview reader, the NodeInfo lookup and the sponsor picture copy.
 */
import { fetchWithTimeout } from "./infra/fetch.js";
import { log } from "./infra/logger.js";

/** Request headers of a desktop browser, because several sites refuse anything else. */
export const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
};

/**
 * The component name every deviation of this module, the preview reader in
 * `preview-image.ts` and the NodeInfo lookup in `nodeinfo.ts` is logged under.
 * All three answer to one name, so a search of the logs for `PreviewImage`
 * finds every failed outbound read of the preview pipeline.
 */
export const LOG_COMPONENT = "PreviewImage";
/**
 * The error code of a recoverable deviation, as other backend services log it,
 * shared by the same three modules as {@link LOG_COMPONENT}.
 */
export const LOG_ERROR_CODE = "MC-SYS-0001";

/**
 * The host of an address, for a log line that must not carry the whole address.
 *
 * @param url - Any address.
 * @returns The host, or `"invalid"` when the address cannot be parsed.
 */
export function hostForLog(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

/**
 * Fetches an external resource through the guarded outbound fetch.
 *
 * `fetchWithTimeout` checks every redirect hop and every connection against
 * private and reserved addresses and throws on a refusal, so a public URL
 * cannot bounce the backend into an internal target. A refusal, a timeout and
 * a network failure all end here as `null`.
 *
 * @param url - The address to fetch.
 * @param init - Request options such as headers. Redirects are followed.
 * @param timeoutMs - One budget for the whole redirect chain and reading the body.
 * @returns The response and the address it finally came from, or `null` when
 *   the request was refused or failed.
 */
export async function fetchExternalResource(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; finalUrl: string } | null> {
  try {
    const response = await fetchWithTimeout(url, init, timeoutMs);
    // The transport reports the address of the hop that answered. A response
    // built by hand has none, and then the requested address is the answer.
    return { response, finalUrl: response.url || url };
  } catch (error) {
    log.deviation(
      {
        component: LOG_COMPONENT,
        errorCode: LOG_ERROR_CODE,
        operation: "preview_image_fetch",
        outcome: "resource_skipped",
        host: hostForLog(url),
      },
      error,
    );
    return null;
  }
}

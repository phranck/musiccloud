import { ENDPOINTS, type SponsorsPayload } from "@musiccloud/shared";

/**
 * Reads who carries this year's running costs, through the site's own proxy
 * (`/api/sponsors`), so the visitor's browser asks no other host.
 *
 * Kept out of the wall's effect, which calls this and stores the result, as
 * the Bandcamp lookup is. The backend caches the answer publicly for a minute.
 *
 * @param signal - Aborts the request when the wall unmounts.
 * @returns The sponsors and the year's figures, or `null` when the request
 *   fails or the answer is not that shape, in which case the wall shows nothing.
 */
export async function fetchCurrentSponsors(signal: AbortSignal): Promise<SponsorsPayload | null> {
  const res = await fetch(ENDPOINTS.frontend.sponsors, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as Partial<SponsorsPayload> | null;
  return data && Array.isArray(data.sponsors) && typeof data.costsTotalCents === "number"
    ? (data as SponsorsPayload)
    : null;
}

import { ENDPOINTS } from "@musiccloud/shared";

/**
 * Looks up whether a CC track is also on Bandcamp via the async proxy endpoint
 * (`/api/cc/bandcamp/:jamendoId`).
 *
 * Wrapping the request here, out of the component's effect, keeps network access
 * off the render path — the effect calls this and stores the result, mirroring
 * the artist-info client. The backend scrape is cached + timeout-bounded, so this
 * is cheap on repeat opens.
 *
 * @param jamendoId - The Jamendo track id.
 * @param signal - Abort signal to cancel the in-flight request on unmount.
 * @returns The Bandcamp track URL, or null when the track is not on Bandcamp,
 *   the request fails, or it is aborted.
 */
export async function lookupCcBandcampUrl(jamendoId: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch(ENDPOINTS.frontend.ccBandcamp(jamendoId), { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { bandcampUrl?: string };
  return data.bandcampUrl ?? null;
}

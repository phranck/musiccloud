/**
 * The network lookup that fetches a fresh preview URL for a share through the
 * frontend's share-preview proxy.
 */
import { ENDPOINTS } from "@musiccloud/shared";

/**
 * Fetches a playable preview URL for a share whose stored URL is missing or
 * expired.
 *
 * @param refreshShortId - The share's short ID, passed to the share-preview endpoint.
 * @param signal - Aborts the request when the player unmounts.
 * @returns The preview URL, or `null` when the response is not OK or the backend has no preview.
 * @throws The fetch error, including an `AbortError` once `signal` aborts.
 */
export async function fetchPreviewUrl(refreshShortId: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch(ENDPOINTS.frontend.sharePreview(refreshShortId), { signal });
  if (!res.ok) return null;
  const body = (await res.json()) as { previewUrl: string | null };
  return body.previewUrl;
}

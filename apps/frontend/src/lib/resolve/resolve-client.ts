import { ENDPOINTS, type ResolveErrorResponse, type UnifiedResolveSuccessResponse } from "@musiccloud/shared";
import { ResolveApiError } from "@/lib/resolve/parsers";

/**
 * Resolves a query string to a final commercial resolve result.
 *
 * Posts the query to `ENDPOINTS.frontend.resolve`, parses the JSON body, and
 * narrows it to a {@link UnifiedResolveSuccessResponse}. Mirrors the resolve
 * fetch in `useAppState` so both share-layout in-place resolves and the landing
 * page submit funnel through the same wire contract and error type.
 *
 * Throws {@link ResolveApiError} on a non-OK response (built from the error
 * payload, matching `useAppState`). Throws a plain `Error` when the response is
 * OK but carries a non-final `status` (a disambiguation / genre payload), which
 * the in-place row resolve cannot consume. An aborted request rejects with the
 * underlying `AbortError`.
 *
 * @param query - The resolve query (typically a track's platform URL).
 * @param signal - Abort signal the caller uses to cancel / time out the fetch.
 * @returns The final resolved success response.
 */
export async function resolveTrackQuery(query: string, signal: AbortSignal): Promise<UnifiedResolveSuccessResponse> {
  const response = await fetch(ENDPOINTS.frontend.resolve, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  });
  const data = (await response.json().catch(() => ({}))) as
    | UnifiedResolveSuccessResponse
    | Partial<ResolveErrorResponse>
    | { status?: string };
  if (!response.ok) {
    throw new ResolveApiError(data as Partial<ResolveErrorResponse>);
  }
  if ("status" in data && data.status) {
    throw new Error("resolve did not return a final result");
  }
  return data as UnifiedResolveSuccessResponse;
}

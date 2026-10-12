import { type AdminArtistEntityDetail, ENDPOINTS } from "@musiccloud/shared";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { type ApiRequestError, HttpStatus } from "@/shared/utils/api-error";

/**
 * Loads one artist entity with its names, lifecycle dates and memberships.
 *
 * A `404` is an answer rather than a failure, because an entity folded into
 * another one by the identity enrichment is gone for good, so it is not asked
 * for again.
 *
 * @param id - The entity id from the route. Nothing is requested without one.
 * @returns The query, whose error carries the response's status and error id.
 */
export function useArtistEntityDetail(id: string | undefined) {
  return useQuery<AdminArtistEntityDetail, ApiRequestError>({
    queryKey: ["admin", "artist-entity", id],
    queryFn: () => api.get<AdminArtistEntityDetail>(ENDPOINTS.admin.artistEntities.detail(id ?? "")),
    enabled: Boolean(id),
    retry: (failureCount, error) => error.status !== HttpStatus.NotFound && failureCount < 1,
  });
}

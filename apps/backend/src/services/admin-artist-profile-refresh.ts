import {
  type ApiErrorResponse,
  type ArtistProfile,
  type ArtistProfileManualRefreshSummary,
  type ArtistProfileRefreshResponse,
  classifyArtistProfileCacheStatus,
} from "@musiccloud/shared";
import { getAdminRepository, getRepository } from "../db/index.js";
import type { ArtistProfileRefreshEvent } from "../db/admin-repository.js";
import type { ArtistCacheIdentity, ArtistCacheRow, ArtistInfoEntity } from "../db/repository.js";
import {
  classifyUnhandledError,
  createApiErrorResponse,
  sanitizeErrorForLog,
} from "../lib/infra/api-errors.js";
import { log } from "../lib/infra/logger.js";
import { ArtistInfoSection, artistInfoRefreshCoordinator } from "./artist-info-cache.js";

interface RefreshProfileInput {
  identity: ArtistCacheIdentity;
  artistName: string;
  requestId?: string;
  startedAt: number;
}

export interface AdminArtistProfileRefreshDependencies {
  findArtistInfoEntity(artistEntityId: string): Promise<ArtistInfoEntity | null>;
  findArtistCache(identity: ArtistCacheIdentity): Promise<ArtistCacheRow | null>;
  refreshProfile(input: RefreshProfileInput): Promise<ArtistProfile | null>;
  beginArtistProfileRefresh(data: {
    actorAdminId: string;
    artistEntityId: string;
    occurredAt: Date;
  }): Promise<ArtistProfileRefreshEvent>;
  completeArtistProfileRefresh(id: string, completedAt: Date): Promise<ArtistProfileRefreshEvent>;
  failArtistProfileRefresh(
    id: string,
    data: { completedAt: Date; errorCode: string; errorId: string; cause: string },
  ): Promise<ArtistProfileRefreshEvent>;
  now(): Date;
  logDeviation: typeof log.deviation;
}

export interface AdminArtistProfileRefreshInput {
  actorAdminId: string;
  artistEntityId: string;
  requestId?: string;
}

export class AdminArtistProfileRefreshError extends Error {
  constructor(
    readonly statusCode: number,
    readonly response: ApiErrorResponse,
    readonly auditCause: string,
    readonly internalCause?: unknown,
  ) {
    super(response.message);
    this.name = "AdminArtistProfileRefreshError";
  }
}

export function createAdminArtistProfileRefreshService(dependencies: AdminArtistProfileRefreshDependencies) {
  return async function refreshAdminArtistProfile(
    input: AdminArtistProfileRefreshInput,
  ): Promise<ArtistProfileRefreshResponse> {
    const artist = await dependencies.findArtistInfoEntity(input.artistEntityId);
    if (!artist) {
      const response = createApiErrorResponse("MC-RES-0003", {
        overrideMessage: "Artist entity not found.",
      });
      throw new AdminArtistProfileRefreshError(404, response, "Artist entity not found");
    }

    const occurredAt = dependencies.now();
    const auditEvent = await dependencies.beginArtistProfileRefresh({
      actorAdminId: input.actorAdminId,
      artistEntityId: artist.artistEntityId,
      occurredAt,
    });

    try {
      const profile = await dependencies.refreshProfile({
        identity: { kind: "entity", artistEntityId: artist.artistEntityId },
        artistName: artist.artistName,
        requestId: input.requestId,
        startedAt: occurredAt.getTime(),
      });
      if (!profile) {
        const response = createApiErrorResponse("MC-API-0001", {
          overrideMessage: "Artist profile providers returned no usable profile data.",
        });
        throw new AdminArtistProfileRefreshError(
          502,
          response,
          "Artist profile providers returned no usable profile data.",
        );
      }

      const cache = await dependencies.findArtistCache({
        kind: "entity",
        artistEntityId: artist.artistEntityId,
      });
      const completedEvent = await dependencies.completeArtistProfileRefresh(auditEvent.id, dependencies.now());
      const manualRefresh = toManualRefreshSummary(completedEvent);
      return {
        artistEntityId: artist.artistEntityId,
        profileCache: classifyArtistProfileCacheStatus(
          cacheStatusInput(cache, manualRefresh),
          dependencies.now(),
        ),
        manualRefresh,
      };
    } catch (error) {
      const failure = toRefreshError(error);
      try {
        await dependencies.failArtistProfileRefresh(auditEvent.id, {
          completedAt: dependencies.now(),
          errorCode: failure.response.error,
          errorId: failure.response.errorId,
          cause: failure.auditCause,
        });
      } catch (auditError) {
        dependencies.logDeviation(
          {
            component: "AdminArtistProfileRefresh",
            errorCode: "MC-DB-0004",
            operation: "artist_profile_refresh_audit_failure",
            outcome: "refresh_failed_audit_incomplete",
            artistEntityId: artist.artistEntityId,
            refreshEventId: auditEvent.id,
            requestId: input.requestId,
          },
          auditError,
        );
      }
      throw failure;
    }
  };
}

export async function refreshAdminArtistProfile(
  input: AdminArtistProfileRefreshInput,
): Promise<ArtistProfileRefreshResponse> {
  const [repo, adminRepo] = await Promise.all([getRepository(), getAdminRepository()]);
  return createAdminArtistProfileRefreshService({
    findArtistInfoEntity: (artistEntityId) => repo.findArtistInfoEntity(artistEntityId),
    findArtistCache: (identity) => repo.findArtistCache(identity),
    refreshProfile: (refreshInput) =>
      artistInfoRefreshCoordinator.refresh(ArtistInfoSection.Profile, {
        repo,
        ...refreshInput,
      }) as Promise<ArtistProfile | null>,
    beginArtistProfileRefresh: (data) => adminRepo.beginArtistProfileRefresh(data),
    completeArtistProfileRefresh: (id, completedAt) => adminRepo.completeArtistProfileRefresh(id, completedAt),
    failArtistProfileRefresh: (id, data) => adminRepo.failArtistProfileRefresh(id, data),
    now: () => new Date(),
    logDeviation: log.deviation,
  })(input);
}

function toRefreshError(error: unknown): AdminArtistProfileRefreshError {
  if (error instanceof AdminArtistProfileRefreshError) return error;
  const classified = classifyUnhandledError(error);
  const response = createApiErrorResponse(classified.code, { overrideMessage: classified.message });
  return new AdminArtistProfileRefreshError(
    classified.statusCode,
    response,
    sanitizeErrorForLog(error, false).message.slice(0, 240),
    error,
  );
}

function toManualRefreshSummary(event: ArtistProfileRefreshEvent): ArtistProfileManualRefreshSummary {
  return {
    trigger: event.trigger,
    occurredAt: event.occurredAt.toISOString(),
    completedAt: event.completedAt?.toISOString() ?? null,
    outcome: event.outcome,
    errorCode: event.errorCode,
    errorId: event.errorId,
  };
}

function cacheStatusInput(
  cache: ArtistCacheRow | null,
  latestManualRefresh: ArtistProfileManualRefreshSummary,
) {
  const hasProfile = cache?.profile !== null && cache?.profile !== undefined;
  return {
    profileUpdatedAt:
      hasProfile && cache && cache.profileUpdatedAt > 0 ? new Date(cache.profileUpdatedAt).toISOString() : null,
    profileProviders: hasProfile && cache ? cache.profileProviders : [],
    latestManualRefresh,
  };
}

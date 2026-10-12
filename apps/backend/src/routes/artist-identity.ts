/**
 * @file Artist lifecycle dates and band memberships, keyed:
 * GET `/api/v1/artists/events`, GET `/api/v1/artists/:artistEntityId/members`
 * and GET `/api/v1/artists/:artistEntityId/memberships`.
 *
 * Registered inside the `authenticatePublic` scope in `server.ts`, because
 * every operation in the published contract needs an API key. The identity
 * enrichment in `services/artist-identity/enrich.ts` records the data these
 * routes read.
 *
 * The responses are built by `services/artist-identity/public.ts`, which leaves
 * out where each fact came from and how sure its source was.
 */

import {
  ARTIST_LIFECYCLE_EVENT_TYPES,
  type ArtistLifecycleEventType,
  ENDPOINTS,
  ROUTE_TEMPLATES,
} from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { getRepository } from "../db/index.js";
import { artistEntityIdSchema, publicErrorResponse } from "../docs/public-response-schema.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";
import { toPublicLifecycleEvent, toPublicMemberships } from "../services/artist-identity/public.js";

/** Lifecycle dates and memberships change rarely, so a response may be reused for an hour. */
const ARTIST_IDENTITY_CACHE_CONTROL = "public, max-age=3600";

/** The responses every keyed artist identity operation documents beside its success. */
const KEYED_ERROR_RESPONSES = {
  401: publicErrorResponse("Missing, invalid, or revoked API key."),
  429: publicErrorResponse(
    "The issued API key exceeded its assigned rolling `60`-second or rolling `24`-hour quota. Inspect `context` and `Retry-After` before retrying.",
  ),
} as const;

const CACHE_CONTROL_HEADER = {
  "Cache-Control": {
    type: "string",
    enum: [ARTIST_IDENTITY_CACHE_CONTROL],
    description: `Always \`${ARTIST_IDENTITY_CACHE_CONTROL}\`.`,
  },
} as const;

/**
 * Applies the per-IP limit to a first-party caller without an API key. A keyed
 * caller is quota-checked in `authenticatePublic` already.
 *
 * @returns `true` when the request was answered with a rate-limit error.
 */
function rejectedByIpLimit(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.apiClient) return false;
  const rateLimit = apiRateLimiter.check(request.ip);
  if (!rateLimit.limited) return false;
  void sendRateLimitError(reply, rateLimit);
  return true;
}

/** The path parameter both membership operations take. */
const ARTIST_ENTITY_PARAMS = {
  type: "object",
  required: ["artistEntityId"],
  properties: {
    artistEntityId: artistEntityIdSchema(
      "Normalized musiccloud artist entity ID. Take it from `artistCredits[].artistEntityId` in a successful track or album response, or from `events[].artistEntityId` in `GET /api/v1/artists/events`.",
    ),
  },
  additionalProperties: false,
} as const;

export default async function artistIdentityRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { month: number; day: number; eventType?: ArtistLifecycleEventType[] } }>(
    ENDPOINTS.v1.artists.events,
    {
      schema: {
        tags: ["Artist"],
        summary: "List artist birthdays, death anniversaries and band formations on a calendar day",
        "x-codeSamples": buildCodeSamples({
          method: "GET",
          path: "/api/v1/artists/events",
          query: { month: "10", day: "7", eventType: "birth" },
          auth: "apiKey",
        }),
        description:
          "Returns the lifecycle events of catalog artists that fall on one calendar day, in any year: births and deaths of people, formations and disbandings of groups. Only events whose full date is known are returned. Catalog artists are those with a musiccloud artist page and the members and groups one band membership away from them.",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          required: ["month", "day"],
          properties: {
            month: {
              type: "integer",
              minimum: 1,
              maximum: 12,
              description: "Calendar month from `1` to `12` that the events fall in.",
            },
            day: {
              type: "integer",
              minimum: 1,
              maximum: 31,
              description: "Day of the month from `1` to `31` that the events fall on.",
            },
            eventType: {
              type: "array",
              items: { type: "string", enum: [...ARTIST_LIFECYCLE_EVENT_TYPES] },
              uniqueItems: true,
              description:
                "Event types to include: `birth`, `death`, `formed`, or `disbanded`. Repeat the parameter to ask for several.\n\n**Default**: all four types.",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: "`ArtistLifecycleEventsResponse` with the events on the requested day.",
            headers: CACHE_CONTROL_HEADER,
            $ref: "ArtistLifecycleEventsResponse#",
          },
          400: publicErrorResponse("A month or day is missing or outside its range, or an event type is unknown."),
          ...KEYED_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply) => {
      if (rejectedByIpLimit(request, reply)) return reply;
      const { month, day } = request.query;
      const eventTypes = request.query.eventType ?? [...ARTIST_LIFECYCLE_EVENT_TYPES];

      const repo = await getRepository();
      const events = await repo.listArtistIdentityEventsByDay({ month, day, eventTypes, catalogOnly: true });

      reply.header("Cache-Control", ARTIST_IDENTITY_CACHE_CONTROL);
      return reply.send({ month, day, events: events.map(toPublicLifecycleEvent) });
    },
  );

  for (const side of ["members", "memberships"] as const) {
    const isGroupSide = side === "members";
    app.get<{ Params: { artistEntityId: string } }>(
      ROUTE_TEMPLATES.v1.artists[side],
      {
        schema: {
          tags: ["Artist"],
          summary: isGroupSide ? "List the members of a group" : "List the groups an artist belongs to",
          "x-codeSamples": buildCodeSamples({
            method: "GET",
            path: `/api/v1/artists/artist_radiohead/${side}`,
            auth: "apiKey",
          }),
          description: isGroupSide
            ? "Returns the members of a group, one entry per stint, with their roles and the dates the stint began and ended as far as they are known. A person has no members, so a person's ID returns an empty list."
            : "Returns the groups an artist belongs or belonged to, one entry per stint, with the artist's roles and the dates as far as they are known. An artist who is in no group returns an empty list.",
          security: [{ ApiKeyAuth: [] }],
          params: ARTIST_ENTITY_PARAMS,
          response: {
            200: {
              description: isGroupSide
                ? "`ArtistMembershipList` with the group's members."
                : "`ArtistMembershipList` with the artist's groups.",
              headers: CACHE_CONTROL_HEADER,
              $ref: "ArtistMembershipList#",
            },
            400: publicErrorResponse("The artist entity ID is malformed."),
            404: publicErrorResponse("No artist entity has this ID."),
            ...KEYED_ERROR_RESPONSES,
          },
        },
      },
      async (request, reply) => {
        if (rejectedByIpLimit(request, reply)) return reply;
        const { artistEntityId } = request.params;

        const repo = await getRepository();
        if (!(await repo.findArtistInfoEntity(artistEntityId))) {
          return reply.status(404).send(createApiErrorResponse("MC-RES-0003"));
        }
        const records = isGroupSide
          ? await repo.listArtistGroupMembers(artistEntityId)
          : await repo.listArtistMemberships(artistEntityId);

        reply.header("Cache-Control", ARTIST_IDENTITY_CACHE_CONTROL);
        return reply.send({ artistEntityId, memberships: toPublicMemberships(records) });
      },
    );
  }
}

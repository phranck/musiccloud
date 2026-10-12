/**
 * @file Public OpenAPI schemas for artist lifecycle dates and band
 * memberships. They describe the shapes in `@musiccloud/shared`'s
 * `artist-identity.ts`, and `OPENAPI_SCHEMAS` registers them with the rest.
 */

import { ARTIST_ENTITY_TYPES, ARTIST_LIFECYCLE_EVENT_TYPES, DATE_PRECISIONS } from "@musiccloud/shared";

export const PartialDateSchema = {
  $id: "PartialDate",
  type: "object",
  description:
    "A date known only as precisely as its source states it. Read `precision` first: the parts beyond it are `null`.",
  required: ["precision", "year", "month", "day"],
  additionalProperties: false,
  properties: {
    precision: {
      type: "string",
      enum: [...DATE_PRECISIONS],
      description: "How much of the date is known: `year`, `month`, `day`, or `unknown`.",
    },
    year: {
      type: "integer",
      nullable: true,
      description: "Four-digit year. The key is always included and its value is `null` when the year is unknown.",
    },
    month: {
      type: "integer",
      minimum: 1,
      maximum: 12,
      nullable: true,
      description:
        "Month from `1` to `12`. The key is always included and its value is `null` unless `precision` is `month` or `day`.",
    },
    day: {
      type: "integer",
      minimum: 1,
      maximum: 31,
      nullable: true,
      description: "Day of the month. The key is always included and its value is `null` unless `precision` is `day`.",
    },
  },
  example: { precision: "day", year: 1968, month: 10, day: 7 },
} as const;

export const ArtistLifecycleEventSchema = {
  $id: "ArtistLifecycleEvent",
  type: "object",
  description:
    "One lifecycle event of one artist: a birth or death for a person, a formation or disbanding for a group.",
  required: ["artistEntityId", "artistName", "artistType", "eventType", "date"],
  additionalProperties: false,
  properties: {
    artistEntityId: {
      type: "string",
      description:
        "Normalized musiccloud artist entity ID. Pass it to `GET /api/v1/artists/{artistEntityId}/members` or `GET /api/v1/artists/{artistEntityId}/memberships`.",
    },
    artistName: { type: "string", description: "The artist's canonical display name." },
    artistType: {
      type: "string",
      enum: [...ARTIST_ENTITY_TYPES],
      description: "Whether the artist is a `person`, a `group`, a `persona`, or of `unknown` type.",
    },
    eventType: {
      type: "string",
      enum: [...ARTIST_LIFECYCLE_EVENT_TYPES],
      description: "`birth` and `death` belong to a person, `formed` and `disbanded` to a group.",
    },
    date: { allOf: [{ $ref: "PartialDate#" }], description: "When the event happened, as precisely as it is known." },
  },
  example: {
    artistEntityId: "artist_thom_yorke",
    artistName: "Thom Yorke",
    artistType: "person",
    eventType: "birth",
    date: { precision: "day", year: 1968, month: 10, day: 7 },
  },
} as const;

export const ArtistLifecycleEventsResponseSchema = {
  $id: "ArtistLifecycleEventsResponse",
  type: "object",
  description: "The lifecycle events of catalog artists that fall on one calendar day, in any year.",
  required: ["month", "day", "events"],
  additionalProperties: false,
  properties: {
    month: { type: "integer", minimum: 1, maximum: 12, description: "The requested month, echoed." },
    day: { type: "integer", minimum: 1, maximum: 31, description: "The requested day of the month, echoed." },
    events: {
      type: "array",
      items: { $ref: "ArtistLifecycleEvent#" },
      description:
        "Events whose full date is known and falls on the requested day, ordered by event type and then by artist name. Empty when none does.",
    },
  },
  example: {
    month: 10,
    day: 7,
    events: [
      {
        artistEntityId: "artist_thom_yorke",
        artistName: "Thom Yorke",
        artistType: "person",
        eventType: "birth",
        date: { precision: "day", year: 1968, month: 10, day: 7 },
      },
    ],
  },
} as const;

export const ArtistMembershipSchema = {
  $id: "ArtistMembership",
  type: "object",
  description: "One stint of one member in one group. A member who left and rejoined has one entry per stint.",
  required: [
    "groupArtistEntityId",
    "groupName",
    "memberArtistEntityId",
    "memberName",
    "roles",
    "begin",
    "end",
    "isCurrent",
  ],
  additionalProperties: false,
  properties: {
    groupArtistEntityId: { type: "string", description: "Normalized musiccloud artist entity ID of the group." },
    groupName: { type: "string", description: "The group's canonical display name." },
    memberArtistEntityId: { type: "string", description: "Normalized musiccloud artist entity ID of the member." },
    memberName: { type: "string", description: "The member's canonical display name." },
    roles: {
      type: "array",
      items: { type: "string" },
      description:
        "Instruments and attributes such as `original` or `lead vocals`, in alphabetical order. Empty when none are recorded.",
    },
    begin: {
      anyOf: [{ $ref: "PartialDate#" }, { type: "null" }],
      description: "When the stint began. The key is always included and its value is `null` when nothing is known.",
    },
    end: {
      anyOf: [{ $ref: "PartialDate#" }, { type: "null" }],
      description:
        "When the stint ended. The key is always included and its value is `null` when it has not ended or nothing is known.",
    },
    isCurrent: {
      type: "boolean",
      nullable: true,
      description:
        "`true` while the stint lasts and `false` once it ended. The key is always included and its value is `null` where neither is recorded.",
    },
  },
  example: {
    groupArtistEntityId: "artist_radiohead",
    groupName: "Radiohead",
    memberArtistEntityId: "artist_thom_yorke",
    memberName: "Thom Yorke",
    roles: ["lead vocals", "original", "piano"],
    begin: null,
    end: null,
    isCurrent: true,
  },
} as const;

export const ArtistMembershipListSchema = {
  $id: "ArtistMembershipList",
  type: "object",
  description: "The band memberships of one artist: the members of a group, or the groups a person belongs to.",
  required: ["artistEntityId", "memberships"],
  additionalProperties: false,
  properties: {
    artistEntityId: { type: "string", description: "The requested artist entity ID, echoed." },
    memberships: {
      type: "array",
      items: { $ref: "ArtistMembership#" },
      description: "Current stints first, then by the year a stint began. Empty when none is recorded.",
    },
  },
  example: {
    artistEntityId: "artist_radiohead",
    memberships: [
      {
        groupArtistEntityId: "artist_radiohead",
        groupName: "Radiohead",
        memberArtistEntityId: "artist_thom_yorke",
        memberName: "Thom Yorke",
        roles: ["lead vocals", "original", "piano"],
        begin: null,
        end: null,
        isCurrent: true,
      },
    ],
  },
} as const;

/** The artist identity schemas, in the order they reference each other. */
export const ARTIST_IDENTITY_OPENAPI_SCHEMAS = [
  PartialDateSchema,
  ArtistLifecycleEventSchema,
  ArtistLifecycleEventsResponseSchema,
  ArtistMembershipSchema,
  ArtistMembershipListSchema,
] as const;

/**
 * @file Turns a stored artist entity into the detail the admin dashboard
 * shows: the public shape of each fact, with the source that stated it.
 *
 * The public API leaves the source out, in `public.ts`. The operator gets it,
 * because checking a date or a membership starts with who asserted it. Two
 * sources stating the same stint stay two entries here for the same reason,
 * where the public answer merges them.
 */

import {
  type AdminArtistEntityDetail,
  type AdminArtistFactSource,
  type AdminArtistLifecycleEvent,
  type AdminArtistMembership,
  partialDateFromParts,
} from "@musiccloud/shared";

import type { ArtistEntityEventRecord, ArtistEntityIdentityRecord } from "../../db/admin-repository.js";
import type { ArtistGroupMembershipRecord } from "../../db/repository.js";
import { toPublicMembership } from "./public.js";

/**
 * The source of one stored fact.
 *
 * @returns The source, or `null` where no source is linked to the fact.
 */
function factSource(
  provider: string | null,
  url: string | null,
  fetchedAt: number | null,
): AdminArtistFactSource | null {
  return provider ? { provider, url, fetchedAt } : null;
}

function toAdminLifecycleEvent(record: ArtistEntityEventRecord): AdminArtistLifecycleEvent {
  return {
    id: record.id,
    eventType: record.eventType,
    date: partialDateFromParts(record.datePrecision, record.eventYear, record.eventMonth, record.eventDay) ?? {
      precision: "unknown",
      year: null,
      month: null,
      day: null,
    },
    source: factSource(record.sourceProvider, record.sourceUrl, record.sourceFetchedAt),
  };
}

function toAdminMembership(record: ArtistGroupMembershipRecord): AdminArtistMembership {
  return {
    id: record.membershipId,
    ...toPublicMembership(record),
    source: factSource(record.sourceProvider, record.sourceUrl, record.sourceFetchedAt),
  };
}

/**
 * One stored artist entity as the dashboard's detail page reads it.
 *
 * @param record - The entity with its names, events and memberships.
 * @returns The detail, each fact with its source.
 */
export function toAdminArtistEntityDetail(record: ArtistEntityIdentityRecord): AdminArtistEntityDetail {
  return {
    id: record.id,
    name: record.name,
    entityType: record.entityType,
    verificationStatus: record.verificationStatus,
    hasProfile: record.hasProfile,
    shortId: record.shortId,
    createdAt: record.createdAt,
    names: record.names,
    events: record.events.map(toAdminLifecycleEvent),
    members: record.members.map(toAdminMembership),
    memberOf: record.memberOf.map(toAdminMembership),
  };
}

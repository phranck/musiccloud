/**
 * @file Turns stored artist lifecycle events and memberships into the public
 * shapes in `@musiccloud/shared`.
 *
 * The stored records carry the source, its URL and its confidence. None of
 * that leaves the server: the public shapes are built field by field, so a
 * column added to a record never reaches a response by accident.
 */

import { type ArtistLifecycleEvent, type ArtistMembership, partialDateFromParts } from "@musiccloud/shared";

import type { ArtistGroupMembershipRecord, ArtistIdentityEventRecord } from "../../db/repository.js";

/** One stored lifecycle event in its public form. */
export function toPublicLifecycleEvent(record: ArtistIdentityEventRecord): ArtistLifecycleEvent {
  return {
    artistEntityId: record.artistEntityId,
    artistName: record.displayName,
    artistType: record.entityType,
    eventType: record.eventType,
    date: partialDateFromParts(record.datePrecision, record.eventYear, record.eventMonth, record.eventDay) ?? {
      precision: "unknown",
      year: null,
      month: null,
      day: null,
    },
  };
}

/**
 * One stored membership in its public form, without merging it with others.
 *
 * The admin detail builds on this and adds the source, so the fields a
 * membership shows are named once for both audiences.
 */
export function toPublicMembership(record: ArtistGroupMembershipRecord): ArtistMembership {
  return {
    groupArtistEntityId: record.groupArtistEntityId,
    groupName: record.groupName,
    memberArtistEntityId: record.memberArtistEntityId,
    memberName: record.memberName,
    roles: [...record.roles].sort(),
    begin: partialDateFromParts(record.beginDatePrecision, record.beginYear, record.beginMonth, record.beginDay),
    end: partialDateFromParts(record.endDatePrecision, record.endYear, record.endMonth, record.endDay),
    isCurrent: record.isCurrent,
  };
}

/**
 * Stored memberships in their public form, one per stint.
 *
 * Two rows for the same member in the same group over the same dates are one
 * stint, whichever source wrote them, so they are merged with all their roles.
 *
 * @param records - The memberships in the order they should appear.
 * @returns The public memberships, in that order, without repeats.
 */
export function toPublicMemberships(records: ArtistGroupMembershipRecord[]): ArtistMembership[] {
  const stints = new Map<string, ArtistMembership>();
  for (const membership of records.map(toPublicMembership)) {
    const key = JSON.stringify([
      membership.groupArtistEntityId,
      membership.memberArtistEntityId,
      membership.begin,
      membership.end,
    ]);
    const existing = stints.get(key);
    if (existing) {
      existing.roles = [...new Set([...existing.roles, ...membership.roles])].sort();
    } else {
      stints.set(key, membership);
    }
  }
  return [...stints.values()];
}

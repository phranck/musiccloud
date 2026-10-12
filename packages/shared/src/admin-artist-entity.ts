/**
 * @file The shapes the admin dashboard reads about artist entities: the list,
 * and one entity's names, lifecycle dates and band memberships.
 *
 * Unlike the public shapes in `artist-identity.ts`, a fact here carries the
 * source that stated it and when that source was read, because an operator
 * checking a date or a membership needs to know who asserted it.
 */

import type { ArtistEntityType, ArtistLifecycleEventType, ArtistMembership, PartialDate } from "./artist-identity.js";

/** How far an artist entity has been confirmed. Every entity starts as a `candidate`. */
export const ARTIST_VERIFICATION_STATUSES = ["candidate", "verified", "rejected"] as const;

export type ArtistVerificationStatus = (typeof ARTIST_VERIFICATION_STATUSES)[number];

/** The kinds of name an artist entity stores. `canonical` is its own name, `credit` one printed on a release. */
export const ARTIST_NAME_TYPES = ["canonical", "alias", "legal", "stage", "credit", "sort"] as const;

export type ArtistNameType = (typeof ARTIST_NAME_TYPES)[number];

/** One row of the admin artist entity list. */
export interface AdminArtistEntityListItem {
  id: string;
  /** The entity's preferred name, or `[unnamed artist]` where it has none. */
  name: string;
  entityType: ArtistEntityType;
  verificationStatus: ArtistVerificationStatus;
  trackCreditCount: number;
  albumCreditCount: number;
  /** Whether a resolved artist page exists for the entity. */
  hasProfile: boolean;
  /** The artist page's short id, where there is one. */
  shortId: string | null;
  /** When the entity was created, in epoch milliseconds. */
  createdAt: number;
}

/** Where a stored fact came from. */
export interface AdminArtistFactSource {
  /** The source's key, such as `musicbrainz`. */
  provider: string;
  /** The page at the source that states the fact, where one was recorded. */
  url: string | null;
  /** When the source was last read, in epoch milliseconds, where that was recorded. */
  fetchedAt: number | null;
}

/** One stored name of an artist entity. */
export interface AdminArtistEntityName {
  id: string;
  name: string;
  nameType: ArtistNameType;
  /** The locale the name belongs to, or `null` for a name used everywhere. */
  locale: string | null;
}

/** One lifecycle event of the entity, with its source. */
export interface AdminArtistLifecycleEvent {
  id: string;
  eventType: ArtistLifecycleEventType;
  date: PartialDate;
  source: AdminArtistFactSource | null;
}

/** One stored membership stint, with its source. Two sources stating the same stint are two entries. */
export interface AdminArtistMembership extends ArtistMembership {
  id: string;
  source: AdminArtistFactSource | null;
}

/** Everything the dashboard shows about one artist entity. */
export interface AdminArtistEntityDetail {
  id: string;
  /** The entity's preferred name, or `[unnamed artist]` where it has none. */
  name: string;
  entityType: ArtistEntityType;
  verificationStatus: ArtistVerificationStatus;
  hasProfile: boolean;
  shortId: string | null;
  /** When the entity was created, in epoch milliseconds. */
  createdAt: number;
  /** Every stored name, the preferred one first. */
  names: AdminArtistEntityName[];
  /** The entity's lifecycle events, the earliest first. */
  events: AdminArtistLifecycleEvent[];
  /** The members of the entity as a group. Empty for an entity that is no group. */
  members: AdminArtistMembership[];
  /** The groups the entity belongs or belonged to. */
  memberOf: AdminArtistMembership[];
}

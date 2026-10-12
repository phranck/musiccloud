/**
 * @file The public shapes of artist lifecycle dates and band memberships, as
 * the API returns them and the dashboard reads them.
 *
 * Where the data came from and how sure the source was stays on the server.
 * These shapes carry only what an artist's biography would print.
 */

/** The lifecycle events an artist has: birth and death for a person, formation and disbanding for a group. */
export const ARTIST_LIFECYCLE_EVENT_TYPES = ["birth", "death", "formed", "disbanded"] as const;

export type ArtistLifecycleEventType = (typeof ARTIST_LIFECYCLE_EVENT_TYPES)[number];

/** How much of a date is known. `unknown` marks a date whose source gave no usable value. */
export const DATE_PRECISIONS = ["year", "month", "day", "unknown"] as const;

export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/** What kind of artist an entity is. */
export const ARTIST_ENTITY_TYPES = ["person", "group", "persona", "unknown"] as const;

export type ArtistEntityType = (typeof ARTIST_ENTITY_TYPES)[number];

/** A date known only as precisely as its source states it. The parts beyond the precision are `null`. */
export interface PartialDate {
  precision: DatePrecision;
  year: number | null;
  month: number | null;
  day: number | null;
}

/** One lifecycle event of one artist. */
export interface ArtistLifecycleEvent {
  artistEntityId: string;
  artistName: string;
  artistType: ArtistEntityType;
  eventType: ArtistLifecycleEventType;
  date: PartialDate;
}

/** The lifecycle events that fall on one calendar day, in any year. */
export interface ArtistLifecycleEventsResponse {
  month: number;
  day: number;
  events: ArtistLifecycleEvent[];
}

/** One stint of one member in one group. A member who left and rejoined has two. */
export interface ArtistMembership {
  groupArtistEntityId: string;
  groupName: string;
  memberArtistEntityId: string;
  memberName: string;
  /** Instruments and attributes such as `original`, in alphabetical order. */
  roles: string[];
  begin: PartialDate | null;
  end: PartialDate | null;
  /** `true` while the stint lasts, `false` once it ended, `null` where nobody recorded either. */
  isCurrent: boolean | null;
}

/** The memberships of one artist: a group's members, or the groups a person belongs to. */
export interface ArtistMembershipList {
  artistEntityId: string;
  memberships: ArtistMembership[];
}

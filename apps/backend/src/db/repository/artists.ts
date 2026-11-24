/**
 * Repository contract for artists: resolving and persisting artists with their
 * cross-service links, the artist-info cache (popular tracks, profile, tour
 * dates), and the reads of normalized artist identity (lifecycle events and
 * band memberships). `postgres-artists.ts` implements it behind the
 * `PostgresAdapter` facade.
 */

import type {
  ArtistEvent,
  ArtistLifecycleEventType,
  ArtistProfile,
  ArtistProfileProvider,
  ArtistTopTrack,
  ArtistEntityType as SharedArtistEntityType,
  ArtistVerificationStatus as SharedArtistVerificationStatus,
  DatePrecision as SharedDatePrecision,
} from "@musiccloud/shared";
import type { ExternalIdRecord, NormalizedArtist } from "../../services/types.js";

// ─── Artist Resolution Types ────────────────────────────────────────────────

/** Cached artist with its cross-service links */
export interface CachedArtistResult {
  artistId: string;
  updatedAt: number;
  artist: NormalizedArtist;
  links: Array<{
    service: string;
    url: string;
    confidence: number;
    matchMethod: string;
  }>;
}

/** Data needed to persist a resolved artist with its cross-service links */
export interface PersistArtistData {
  sourceArtist: {
    name: string;
    imageUrl?: string;
    genres?: string[];
    sourceService?: string;
    sourceUrl?: string;
  };
  links: Array<{
    service: string;
    url: string;
    confidence: number;
    matchMethod: string;
    externalId?: string;
  }>;
}

// ─── Artist Cache Types ───────────────────────────────────────────────────────

/** Artist cache row shape returned or accepted by the database repository layer. */
export interface ArtistCacheRow {
  artistName: string;
  topTracks: ArtistTopTrack[];
  profile: ArtistProfile | null;
  profileProviders: ArtistProfileProvider[];
  events: ArtistEvent[];
  tracksUpdatedAt: number;
  profileUpdatedAt: number;
  eventsUpdatedAt: number;
}

/** Stable identity used to address an artist-info cache record. */
export type ArtistCacheIdentity = { kind: "entity"; artistEntityId: string } | { kind: "name"; artistName: string };

/** Artist cache payload shape returned or accepted by the database repository layer. */
export interface ArtistCacheData {
  /** Stable cache identity. Name identities preserve the legacy key format. */
  identity: ArtistCacheIdentity;
  /** Display name used by the response and upstream artist services. */
  artistName: string;
  topTracks?: ArtistTopTrack[];
  profile?: ArtistProfile | null;
  /** Providers that supplied fields to `profile`; written with that section only. */
  profileProviders?: ArtistProfileProvider[];
  events?: ArtistEvent[];
  profileUpdatedAt?: number;
  tracksUpdatedAt?: number;
  eventsUpdatedAt?: number;
}

/** Exact normalized artist identity used by the artist-info route. */
export interface ArtistInfoEntity {
  artistEntityId: string;
  artistName: string;
}

// ─── Normalized Artist Identity Types ────────────────────────────────────────

/** Artist entity type union used by the database repository layer. */
export type ArtistEntityType = SharedArtistEntityType;
/** Artist verification status union used by the database repository layer. */
export type ArtistVerificationStatus = SharedArtistVerificationStatus;
/** Artist identity event type union used by the database repository layer. */
export type ArtistIdentityEventType = ArtistLifecycleEventType;
/** Date precision union used by the database repository layer. */
export type DatePrecision = SharedDatePrecision;

/** Artist identity event record shape returned or accepted by the database repository layer. */
export interface ArtistIdentityEventRecord {
  eventId: string;
  artistEntityId: string;
  entityType: ArtistEntityType;
  verificationStatus: ArtistVerificationStatus;
  displayName: string;
  eventType: ArtistIdentityEventType;
  dateValue: string | null;
  datePrecision: DatePrecision;
  eventYear: number | null;
  eventMonth: number | null;
  eventDay: number | null;
  placeName: string | null;
  countryCode: string | null;
  sourceProvider: string | null;
  sourceUrl: string | null;
  confidence: number | null;
}

/** Artist group membership record shape returned or accepted by the database repository layer. */
export interface ArtistGroupMembershipRecord {
  membershipId: string;
  groupArtistEntityId: string;
  groupName: string;
  memberArtistEntityId: string;
  memberName: string;
  memberNameCredit: string | null;
  roles: string[];
  beginDate: string | null;
  beginDatePrecision: DatePrecision;
  beginYear: number | null;
  beginMonth: number | null;
  beginDay: number | null;
  endDate: string | null;
  endDatePrecision: DatePrecision;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
  isCurrent: boolean | null;
  sourceProvider: string | null;
  sourceUrl: string | null;
  /** When the source was last read, in epoch milliseconds, or `null` where that was not recorded. */
  sourceFetchedAt: number | null;
  confidence: number | null;
}

/**
 * Resolves, persists and caches artists, and reads their normalized identity.
 * `TrackRepository` extends it, so every caller of the full repository keeps
 * these methods.
 */
export interface ArtistRepository {
  // Artist: Read operations
  /**
   * Finds artist by URL.
   *
   * @param url - The `url` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findArtistByUrl(url: string): Promise<CachedArtistResult | null>;
  /**
   * Finds artist by name.
   *
   * @param name - The `name` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findArtistByName(name: string): Promise<CachedArtistResult | null>;

  // Artist: Write operations (transaction-safe)
  /**
   * Persists artist with links.
   *
   * @param data - The `data` value.
   * @returns The requested repository result.
   */
  persistArtistWithLinks(data: PersistArtistData): Promise<{ artistId: string; shortId: string }>;
  /**
   * Adds links to artist.
   *
   * @param artistId - The `artistId` value.
   * @param links - The `links` value.
   * @returns A promise that resolves when the operation completes.
   */
  addLinksToArtist(
    artistId: string,
    links: Array<{
      service: string;
      url: string;
      confidence: number;
      matchMethod: string;
      externalId?: string;
    }>,
  ): Promise<void>;

  // External-ID aggregation for artists. `CatalogRepository` documents the
  // idempotent insert contract it shares with the track and album variants.
  /**
   * Adds artist external IDs.
   *
   * @param artistId - The `artistId` value.
   * @param records - The `records` value.
   * @returns A promise that resolves when the operation completes.
   */
  addArtistExternalIds(artistId: string, records: ExternalIdRecord[]): Promise<void>;

  // Artist cache (popular tracks, profile, tour dates)
  /**
   * Finds artist cache.
   *
   * @param identity - The cache identity. Name identities keep the legacy
   * cache namespace; entity identities use a separate namespace.
   * @returns The matching record, or `null` when no row matches.
   */
  findArtistCache(identity: ArtistCacheIdentity): Promise<ArtistCacheRow | null>;
  /**
   * Finds artist info alias by short ID.
   *
   * @param shortId - The `shortId` value.
   * @param artistName - The `artistName` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findArtistInfoAliasByShortId(shortId: string, artistName: string): Promise<string | null>;
  /**
   * Saves artist cache.
   *
   * @param data - The `data` value.
   * @returns A promise that resolves when the operation completes.
   */
  saveArtistCache(data: ArtistCacheData): Promise<void>;

  /**
   * Finds an exact normalized artist entity and its preferred stored name.
   *
   * @param artistEntityId - The normalized artist entity identifier.
   * @returns The entity's canonical lookup identity, or `null` when it is
   * unknown or has no usable stored name.
   */
  findArtistInfoEntity(artistEntityId: string): Promise<ArtistInfoEntity | null>;

  // Normalized artist identity reads (migration 0029)
  /**
   * Lists artist identity events by day.
   *
   * @param params - The `params` value.
   * @returns The matching rows.
   */
  listArtistIdentityEventsByDay(params: {
    month: number;
    day: number;
    locale?: string;
    eventTypes?: ArtistIdentityEventType[];
    catalogOnly?: boolean;
  }): Promise<ArtistIdentityEventRecord[]>;
  /**
   * Lists artist group members.
   *
   * @param groupArtistEntityId - The `groupArtistEntityId` value.
   * @param locale - The `locale` value.
   * @returns The matching rows.
   */
  listArtistGroupMembers(groupArtistEntityId: string, locale?: string): Promise<ArtistGroupMembershipRecord[]>;
  /**
   * Lists artist memberships.
   *
   * @param memberArtistEntityId - The `memberArtistEntityId` value.
   * @param locale - The `locale` value.
   * @returns The matching rows.
   */
  listArtistMemberships(memberArtistEntityId: string, locale?: string): Promise<ArtistGroupMembershipRecord[]>;
  /**
   * Finds artist entity ID by identifier.
   *
   * @param provider - The `provider` value.
   * @param externalId - The `externalId` value.
   * @returns The matching record, or `null` when no row matches.
   */
  findArtistEntityIdByIdentifier(provider: string, externalId: string): Promise<string | null>;
}

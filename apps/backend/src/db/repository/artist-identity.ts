/**
 * Repository contract for the artist identity enrichment: choosing the artist
 * entities to look up next, and recording what a provider such as MusicBrainz
 * says about them. `postgres-artist-identity.ts` implements it behind the
 * `PostgresAdapter` facade.
 */

import type { ArtistEntityType, ArtistIdentityEventType, DatePrecision } from "./artists.js";

/** A date stated only as precisely as its source knows it. */
export interface PartialDateRecord {
  /** The full date as `YYYY-MM-DD`, present only when the day is known. */
  value: string | null;
  precision: DatePrecision;
  year: number | null;
  month: number | null;
  day: number | null;
}

/** One band membership in an {@link ArtistIdentitySnapshot}, seen from the snapshot's artist. */
export interface ArtistMembershipSnapshot {
  /** Whether the snapshot's artist is the member or the group of this membership. */
  side: "member" | "group";
  /** The artist on the other side, by the provider's id. */
  counterpart: { providerArtistId: string; name: string; entityType: ArtistEntityType };
  begin: PartialDateRecord | null;
  end: PartialDateRecord | null;
  /** `false` once the provider marks the membership as ended, `null` where it says nothing. */
  isCurrent: boolean | null;
  /** Instruments and attributes such as `original`, as the provider names them. */
  roles: string[];
}

/** One provider's account of an artist's identity, as the identity enrichment records it. */
export interface ArtistIdentitySnapshot {
  provider: "musicbrainz";
  providerArtistId: string;
  sourceUrl: string;
  name: string;
  entityType: ArtistEntityType;
  /** Lifecycle dates the provider knows, already typed for the entity: birth and death, or formed and disbanded. */
  events: Array<{ eventType: ArtistIdentityEventType; date: PartialDateRecord }>;
  /** One entry per stint, with every role the provider lists for it. */
  memberships: ArtistMembershipSnapshot[];
}

/** An artist entity the identity enrichment should look up next. */
export interface ArtistIdentityCandidate {
  artistEntityId: string;
  /** The MusicBrainz id the entity is already known by, if any. */
  musicBrainzId: string | null;
  /** The entity's Spotify and Deezer artist links. */
  serviceLinks: Array<{ service: string; externalId: string | null; url: string }>;
}

/** What one identity check came to, recorded per entity and provider. */
export type ArtistIdentityCheckOutcome = "matched" | "no_match" | "conflict" | "failed";

/**
 * Selects artist entities for the identity enrichment and records its
 * results. `TrackRepository` extends it, so every caller of the full
 * repository keeps these methods.
 */
export interface ArtistIdentityEnrichmentRepository {
  /**
   * The artist entities the identity enrichment should look up next: catalog
   * artists with a profile, and the artists one band membership away from
   * them, whose MusicBrainz check is missing or due. Only entities with a
   * MusicBrainz id or a Spotify or Deezer link come back, because nothing else
   * identifies them exactly.
   *
   * @param params.limit - The most entities to return.
   * @param params.recheckBefore - A check older than this is due again.
   * @param params.retryFailedBefore - A failed check older than this is due again.
   * @returns The due entities, those never checked first, then the oldest checks.
   */
  listArtistIdentityCandidates(params: {
    limit: number;
    recheckBefore: Date;
    retryFailedBefore: Date;
  }): Promise<ArtistIdentityCandidate[]>;
  /**
   * Records a provider's account of an artist in one transaction: the
   * entity's type and provider id, its lifecycle dates, and the memberships on
   * its side, each replacing what the same provider recorded before. An artist
   * on the other side of a membership that no entity carries yet becomes one.
   *
   * @param artistEntityId - The entity the snapshot describes.
   * @param snapshot - What the provider says about it.
   * @param checkedAt - When the provider was asked.
   * @returns `matched`, or `conflict` when the provider id already belongs to
   *   another catalog entity and nothing was written.
   */
  recordArtistIdentity(
    artistEntityId: string,
    snapshot: ArtistIdentitySnapshot,
    checkedAt: Date,
  ): Promise<"matched" | "conflict">;
  /**
   * Records an identity check that wrote no snapshot.
   *
   * @param artistEntityId - The entity that was checked.
   * @param outcome - Why nothing was written.
   * @param checkedAt - When the provider was asked.
   */
  recordArtistIdentityCheck(
    artistEntityId: string,
    outcome: Exclude<ArtistIdentityCheckOutcome, "matched">,
    checkedAt: Date,
  ): Promise<void>;
}

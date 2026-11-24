/**
 * @file Helpers that distil ExternalIdRecord lists out of the various
 * NormalizedX shapes the resolvers work with. The records produced here
 * feed straight into the `*_external_ids` aggregation tables introduced
 * by migration 0019.
 *
 * Every resolver (track, album, artist) needs the same "scan everything we
 * just observed and emit ExternalIdRecord triples" logic, so it lives here
 * once. That keeps the rules consistent, most notably the "drop empty
 * values, drop the synthetic `cached` source" filter and the de-duplication
 * key, so the aggregation table never grows poisoned rows.
 *
 * The functions are pure and deterministic. They neither read from nor
 * write to the database; persistence is the caller's job.
 */
import type { ExternalIdRecord, NormalizedAlbum, NormalizedArtist, NormalizedTrack } from "./types.js";

/**
 * Separator between the fields of an external-id de-duplication key.
 *
 * It is the NUL character, which no provider puts into an id type, an id
 * value or a service name. A printable separator such as a space lets two
 * different triples join to the same key (`"a b" + "c"` and `"a" + "b c"`),
 * and the second one would be dropped as a duplicate.
 */
const EXTERNAL_ID_KEY_SEPARATOR = "\u0000";

/**
 * Source service that marks an observation replayed from the resolve cache.
 *
 * It names no provider, so a record attributed to it is dropped rather than
 * stored, because the aggregation tables record which provider reported an id.
 */
const CACHED_SOURCE_SERVICE = "cached";

/**
 * Build the key under which an external-id observation is de-duplicated.
 *
 * @param idType - Kind of identifier, such as `isrc`, `upc`, `mbid` or `isni`.
 * @param idValue - The identifier itself, as the provider reported it.
 * @param sourceService - Provider that reported the identifier.
 * @returns A key that is equal for two observations exactly when all three
 *   fields are equal, joined with `EXTERNAL_ID_KEY_SEPARATOR`.
 */
function externalIdKey(idType: string, idValue: string, sourceService: string): string {
  return [idType, idValue, sourceService].join(EXTERNAL_ID_KEY_SEPARATOR);
}

/**
 * Accumulator that the three collectors share.
 *
 * @property push - Record one observation. An empty or missing `idValue` and
 *   the `CACHED_SOURCE_SERVICE` source are ignored, and an observation whose
 *   `externalIdKey` was already recorded is ignored as a duplicate.
 * @property records - The unique observations in the order they were first
 *   pushed.
 */
interface ExternalIdCollector {
  push: (idType: string, idValue: string | undefined, sourceService: string) => void;
  records: ExternalIdRecord[];
}

/**
 * Create an empty `ExternalIdCollector`.
 *
 * @returns A collector with no records and its own de-duplication set, so two
 *   collectors never affect each other.
 */
function createExternalIdCollector(): ExternalIdCollector {
  const seenKeys = new Set<string>();
  const records: ExternalIdRecord[] = [];

  const push = (idType: string, idValue: string | undefined, sourceService: string): void => {
    if (!idValue) return;
    if (sourceService === CACHED_SOURCE_SERVICE) return;
    const key = externalIdKey(idType, idValue, sourceService);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    records.push({ idType, idValue, sourceService });
  };

  return { push, records };
}

/**
 * Build a set of unique External-ID records from the source track plus
 * every cross-service link's reported ISRC, MBID and ISWC. Duplicate
 * (idType, idValue, sourceService) triples are collapsed; the unique index
 * in the DB would reject them anyway, but de-duplicating up-front keeps the
 * persisted call tighter and avoids redundant transaction work.
 *
 * @param sourceTrack - Originating observation, absent for a late-only batch.
 *   Late identifiers retain their actual provider instead of being attributed
 *   to the service that originally seeded the recording.
 * @param linkObservations - Optional secondary observations. Each entry
 *   carries the ids reported by a specific service while resolving the same
 *   track. Missing ids are dropped silently. Defaults to no observations.
 * @returns Unique identifier observations with their reporting provider.
 */
export function collectTrackExternalIds(
  sourceTrack: NormalizedTrack | undefined,
  linkObservations: ReadonlyArray<{ service: string; isrc?: string; mbid?: string; iswc?: string }> = [],
): ExternalIdRecord[] {
  const collector = createExternalIdCollector();

  if (sourceTrack) {
    collector.push("isrc", sourceTrack.isrc, sourceTrack.sourceService);
    collector.push("mbid", sourceTrack.mbid, sourceTrack.sourceService);
    collector.push("iswc", sourceTrack.iswc, sourceTrack.sourceService);
  }
  for (const observation of linkObservations) {
    collector.push("isrc", observation.isrc, observation.service);
    collector.push("mbid", observation.mbid, observation.service);
    collector.push("iswc", observation.iswc, observation.service);
  }

  return collector.records;
}

/**
 * Album equivalent of `collectTrackExternalIds`. Emits UPC and MBID
 * records; EAN plugs in with one line when an adapter exposes it.
 *
 * @param sourceAlbum - Originating observation, whose ids are attributed to
 *   its `sourceService`.
 * @param linkObservations - Optional secondary observations. Each entry
 *   carries the ids reported by a specific service while resolving the same
 *   album. Missing ids are dropped silently. Defaults to no observations.
 * @returns Unique identifier observations with their reporting provider.
 */
export function collectAlbumExternalIds(
  sourceAlbum: NormalizedAlbum,
  linkObservations: ReadonlyArray<{ service: string; upc?: string; mbid?: string }> = [],
): ExternalIdRecord[] {
  const collector = createExternalIdCollector();

  collector.push("upc", sourceAlbum.upc, sourceAlbum.sourceService);
  collector.push("mbid", sourceAlbum.mbid, sourceAlbum.sourceService);
  for (const observation of linkObservations) {
    collector.push("upc", observation.upc, observation.service);
    collector.push("mbid", observation.mbid, observation.service);
  }

  return collector.records;
}

/**
 * Artist equivalent. Emits MBID and ISNI records when adapters expose
 * them. Today the MusicBrainz adapter is the primary source for MBID;
 * Last.fm responses also carry MBIDs for popular artists and propagate
 * them through `NormalizedArtist.mbid`.
 *
 * @param sourceArtist - Originating observation, whose ids are attributed to
 *   its `sourceService`.
 * @param linkObservations - Optional secondary observations. Each entry
 *   carries the ids reported by a specific service while resolving the same
 *   artist. Missing ids are dropped silently. Defaults to no observations.
 * @returns Unique identifier observations with their reporting provider.
 */
export function collectArtistExternalIds(
  sourceArtist: NormalizedArtist,
  linkObservations: ReadonlyArray<{ service: string; mbid?: string; isni?: string }> = [],
): ExternalIdRecord[] {
  const collector = createExternalIdCollector();

  collector.push("mbid", sourceArtist.mbid, sourceArtist.sourceService);
  collector.push("isni", sourceArtist.isni, sourceArtist.sourceService);
  for (const observation of linkObservations) {
    collector.push("mbid", observation.mbid, observation.service);
    collector.push("isni", observation.isni, observation.service);
  }

  return collector.records;
}

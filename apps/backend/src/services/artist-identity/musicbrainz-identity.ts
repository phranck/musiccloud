/**
 * @file What MusicBrainz says about who an artist is: its type, its lifecycle
 * dates and its band memberships, and which MusicBrainz artist a streaming
 * service's artist page belongs to.
 *
 * MusicBrainz is the provider the backend already speaks to that records life
 * spans and "member of band" relations, and its core data is CC0. Requests go
 * through the adapter's `mbFetch`, so they share its request gate and its
 * contact `User-Agent`.
 */

import { ResourceKind, Service } from "@musiccloud/shared";

import type {
  ArtistEntityType,
  ArtistIdentitySnapshot,
  ArtistMembershipSnapshot,
  PartialDateRecord,
} from "../../db/repository.js";
import { serviceHttpError } from "../../lib/resolve/service-errors.js";
import { mbFetch, parseMusicBrainzJson } from "../plugins/musicbrainz/adapter.js";

/** A date as MusicBrainz writes it: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
const MUSICBRAINZ_DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** The relation MusicBrainz records band membership under. */
const MEMBER_OF_BAND = "member of band";

interface MbLifeSpan {
  begin?: string | null;
  end?: string | null;
  ended?: boolean | null;
}

interface MbRelatedArtist {
  id: string;
  name: string;
  type?: string | null;
}

interface MbArtistRelation {
  type: string;
  direction?: "forward" | "backward";
  "target-type"?: string;
  artist?: MbRelatedArtist;
  begin?: string | null;
  end?: string | null;
  ended?: boolean | null;
  attributes?: string[];
}

/** The part of `/artist/{id}?inc=artist-rels` the enrichment reads. */
export interface MbIdentityArtist {
  id: string;
  name: string;
  type?: string | null;
  "life-span"?: MbLifeSpan;
  relations?: MbArtistRelation[];
}

/** The part of `/url?resource=…&inc=artist-rels` the enrichment reads. */
export interface MbUrlLookup {
  relations?: MbArtistRelation[];
}

/**
 * Reads a MusicBrainz date into its parts, as precise as it is written.
 *
 * @param text - The date as MusicBrainz states it, or nothing.
 * @returns The date's parts, with the full date only when the day is known, or
 *   `null` for an absent or malformed date.
 */
export function parseMusicBrainzDate(text: string | null | undefined): PartialDateRecord | null {
  const match = text ? MUSICBRAINZ_DATE_PATTERN.exec(text) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : null;
  const day = match[3] ? Number(match[3]) : null;
  if (month !== null && (month < 1 || month > 12)) return null;
  if (day !== null && (day < 1 || day > 31)) return null;

  if (day !== null) return { value: match[0], precision: "day", year, month, day };
  if (month !== null) return { value: null, precision: "month", year, month, day: null };
  return { value: null, precision: "year", year, month: null, day: null };
}

/**
 * The entity type a MusicBrainz artist type stands for. An orchestra and a
 * choir are groups of people as much as a band is, and a character is a
 * persona somebody performs as.
 */
export function entityTypeForMusicBrainzType(type: string | null | undefined): ArtistEntityType {
  switch (type) {
    case "Person":
      return "person";
    case "Group":
    case "Orchestra":
    case "Choir":
      return "group";
    case "Character":
      return "persona";
    default:
      return "unknown";
  }
}

/**
 * The lifecycle dates of an artist: birth and death for a person, formation
 * and disbanding for a group. A persona and an artist of unknown type have
 * none, because a life span means something different for each.
 */
function lifecycleEvents(entityType: ArtistEntityType, lifeSpan: MbLifeSpan | undefined) {
  const eventTypes =
    entityType === "person"
      ? (["birth", "death"] as const)
      : entityType === "group"
        ? (["formed", "disbanded"] as const)
        : null;
  if (!eventTypes) return [];

  const events: ArtistIdentitySnapshot["events"] = [];
  const begin = parseMusicBrainzDate(lifeSpan?.begin);
  const end = parseMusicBrainzDate(lifeSpan?.end);
  if (begin) events.push({ eventType: eventTypes[0], date: begin });
  if (end) events.push({ eventType: eventTypes[1], date: end });
  return events;
}

/**
 * The band memberships of an artist, one per stint.
 *
 * MusicBrainz lists one relation per instrument, so a guitarist who also sings
 * appears twice for the same years. Relations to the same artist over the same
 * dates are one stint, carrying every role either of them names.
 */
function bandMemberships(relations: MbArtistRelation[] | undefined): ArtistMembershipSnapshot[] {
  const stints = new Map<string, ArtistMembershipSnapshot>();
  for (const relation of relations ?? []) {
    if (relation.type !== MEMBER_OF_BAND || !relation.artist) continue;
    const side = relation.direction === "backward" ? "group" : "member";
    const key = [side, relation.artist.id, relation.begin ?? "", relation.end ?? ""].join("|");
    const existing = stints.get(key);
    if (existing) {
      existing.roles = [...new Set([...existing.roles, ...(relation.attributes ?? [])])].sort();
      continue;
    }
    stints.set(key, {
      side,
      counterpart: {
        providerArtistId: relation.artist.id,
        name: relation.artist.name,
        entityType: entityTypeForMusicBrainzType(relation.artist.type),
      },
      begin: parseMusicBrainzDate(relation.begin),
      end: parseMusicBrainzDate(relation.end),
      isCurrent: relation.ended === true || relation.end ? false : relation.ended === false ? true : null,
      roles: [...new Set(relation.attributes ?? [])].sort(),
    });
  }
  return [...stints.values()];
}

/**
 * Turns a MusicBrainz artist with its relations into the snapshot the identity
 * enrichment records.
 *
 * @param artist - The artist as `/artist/{id}?inc=artist-rels` returns it.
 * @returns The artist's type, lifecycle dates and band memberships.
 */
export function mapMusicBrainzIdentity(artist: MbIdentityArtist): ArtistIdentitySnapshot {
  const entityType = entityTypeForMusicBrainzType(artist.type);
  return {
    provider: "musicbrainz",
    providerArtistId: artist.id,
    sourceUrl: `https://musicbrainz.org/artist/${artist.id}`,
    name: artist.name,
    entityType,
    events: lifecycleEvents(entityType, artist["life-span"]),
    memberships: bandMemberships(artist.relations),
  };
}

/**
 * Fetches what MusicBrainz says about an artist.
 *
 * MusicBrainz answers a merged artist's old id with the artist it was merged
 * into, so the snapshot carries the id from the answer rather than the one
 * asked for.
 *
 * @param musicBrainzId - The artist's MusicBrainz id.
 * @returns The snapshot, or `null` when MusicBrainz has no such artist.
 * @throws A `ResolveError` with a MusicBrainz code for any other failed answer.
 */
export async function fetchMusicBrainzIdentity(musicBrainzId: string): Promise<ArtistIdentitySnapshot | null> {
  const response = await mbFetch(`/artist/${encodeURIComponent(musicBrainzId)}?inc=artist-rels&fmt=json`);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.MusicBrainz, response.status, ResourceKind.Artist, musicBrainzId);

  const artist = await parseMusicBrainzJson<MbIdentityArtist>(response, `artist/${musicBrainzId}`);
  if (!artist) throw serviceHttpError(Service.MusicBrainz, 502, ResourceKind.Artist, musicBrainzId);
  return mapMusicBrainzIdentity(artist);
}

/**
 * The MusicBrainz artist a URL belongs to, read from the relations MusicBrainz
 * records on the URL.
 *
 * @param lookup - The answer of `/url?resource=…&inc=artist-rels`.
 * @returns The artist's id when exactly one artist claims the URL, otherwise
 *   `null`, because a URL two artists claim identifies neither.
 */
export function musicBrainzIdFromUrlLookup(lookup: MbUrlLookup): string | null {
  const artistIds = new Set(
    (lookup.relations ?? []).flatMap((relation) =>
      relation["target-type"] === "artist" && relation.artist ? [relation.artist.id] : [],
    ),
  );
  return artistIds.size === 1 ? [...artistIds][0]! : null;
}

/**
 * Asks MusicBrainz which artist a streaming service's artist page belongs to.
 *
 * @param url - The artist page, in the form MusicBrainz records it.
 * @returns The MusicBrainz id, or `null` when MusicBrainz does not know the
 *   page or more than one artist claims it.
 * @throws A `ResolveError` with a MusicBrainz code for a failed answer other than 404.
 */
export async function findMusicBrainzIdForUrl(url: string): Promise<string | null> {
  const response = await mbFetch(`/url?resource=${encodeURIComponent(url)}&inc=artist-rels&fmt=json`);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.MusicBrainz, response.status, ResourceKind.Artist, url);

  const lookup = await parseMusicBrainzJson<MbUrlLookup>(response, `url ${url}`);
  if (!lookup) throw serviceHttpError(Service.MusicBrainz, 502, ResourceKind.Artist, url);
  return musicBrainzIdFromUrlLookup(lookup);
}

/**
 * @file Tidal's JSON:API search document: fetching `/searchResults`, checking
 * the document and projecting one ranked relationship into concrete resources.
 *
 * The documented query returns one search-results resource. Its relationships
 * provide ranking; `included` is only an unordered resource store. A missing
 * referenced resource, malformed consumed metadata, or failed search route is
 * an upstream failure, never a catalogue miss.
 */
import { Operation, ResourceKind, Service } from "@musiccloud/shared";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";
import { serviceHttpError } from "../../../lib/resolve/service-errors";
import { tidalFetch } from "./client.js";
import { parseDuration } from "./duration.js";
import type {
  TidalAlbumResource,
  TidalArtworkRelationships,
  TidalImageLink,
  TidalRelatedResource,
  TidalTrackResource,
  TidalTrackResponse,
} from "./types.js";

/** Search operations own their relationship name, includes and expected label field. */
const SEARCH_RELATIONSHIPS = {
  tracks: {
    include: "tracks.artists,tracks.albums,tracks.albums.coverArt",
    label: "title",
    kind: ResourceKind.Track,
    optional: { isrc: "string", explicit: "boolean" },
  },
  albums: {
    include: "albums.artists,albums.coverArt",
    label: "title",
    kind: ResourceKind.Album,
    optional: { barcodeId: "string", releaseDate: "string", numberOfItems: "number" },
  },
  artists: { include: "artists,artists.profileArt", label: "name", kind: ResourceKind.Artist, optional: {} },
} as const;

/** Resources projected from the corresponding JSON:API search relationship. */
export interface TidalSearchResourceMap {
  tracks: TidalTrackResource;
  albums: TidalAlbumResource;
  artists: {
    id: string;
    attributes: { name: string; imageLinks?: TidalImageLink[] };
    relationships?: TidalArtworkRelationships;
  };
}

/** Minimal included-resource boundary; concrete shapes are checked before projection. */
interface TidalIncludedResource {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  relationships?: TidalRelatedResource["relationships"];
}

/** The current API returns one search-results resource, never a primary track array. */
interface TidalSearchDocument {
  data: Array<{
    type: string;
    relationships?: Partial<Record<keyof TidalSearchResourceMap, { data?: Array<{ id: string; type: string }> }>>;
  }>;
  included?: TidalIncludedResource[];
}

/**
 * Searches the current query endpoint and projects one ranked relationship.
 *
 * @param query - Search text, encoded as the documented query parameter.
 * @param relationship - Resource kind and its owned include/label contract.
 * @returns Ranked concrete resources and the included artist/album metadata.
 * @throws {UpstreamUnavailableError} on malformed JSON:API data; an invalid
 * search route also throws instead of becoming a month-long catalogue miss.
 */
export async function searchCatalogue<Kind extends keyof TidalSearchResourceMap>(
  query: string,
  relationship: Kind,
): Promise<{ data: TidalSearchResourceMap[Kind][]; included: TidalTrackResponse["included"] }> {
  const contract = SEARCH_RELATIONSHIPS[relationship];
  const params = new URLSearchParams({ "filter[query]": query, countryCode: "US", include: contract.include });
  const response = await tidalFetch(`/searchResults?${params}`);
  if (!response.ok)
    throw serviceHttpError(Service.Tidal, response.status, contract.kind, "catalogue search", Operation.Search);
  let document: TidalSearchDocument;
  try {
    document = await response.json();
  } catch {
    throw new UpstreamUnavailableError("tidal", "catalogue search answered with invalid JSON");
  }
  if (
    !document ||
    !Array.isArray(document.data) ||
    document.data.length !== 1 ||
    document.data[0]?.type !== "searchResults" ||
    (document.included !== undefined && !Array.isArray(document.included))
  ) {
    throw new UpstreamUnavailableError("tidal", "catalogue search answered with an invalid resource document");
  }
  const identifiers = document.data[0].relationships?.[relationship]?.data;
  if (!Array.isArray(identifiers))
    throw new UpstreamUnavailableError("tidal", "catalogue search omitted its ranked relationship");
  const included = document.included ?? [];
  if (
    included.some(
      (resource) =>
        !resource ||
        typeof resource.id !== "string" ||
        typeof resource.type !== "string" ||
        !resource.attributes ||
        typeof resource.attributes !== "object",
    )
  ) {
    throw new UpstreamUnavailableError("tidal", "catalogue search included malformed resources");
  }
  const resources = identifiers.map((identifier) => {
    if (
      !identifier ||
      identifier.type !== relationship ||
      typeof identifier.id !== "string" ||
      !/^\d+$/.test(identifier.id)
    ) {
      throw new UpstreamUnavailableError("tidal", "catalogue search included an invalid resource identifier");
    }
    const resource = included.find((entry) => entry.id === identifier.id && entry.type === relationship);
    const label = resource?.attributes[contract.label];
    if (!resource || typeof label !== "string" || !label.trim()) {
      throw new UpstreamUnavailableError("tidal", "catalogue search did not include a referenced resource");
    }
    validateSearchAttributes(resource.attributes, relationship);
    if (relationship !== "artists") {
      const artists = resource.relationships?.artists?.data;
      if (
        !Array.isArray(artists) ||
        artists.length === 0 ||
        artists.some(
          (artist) =>
            !artist ||
            typeof artist.id !== "string" ||
            !included.some(
              (entry) =>
                entry.id === artist.id &&
                entry.type === "artists" &&
                typeof entry.attributes.name === "string" &&
                entry.attributes.name.trim().length > 0,
            ),
        )
      ) {
        throw new UpstreamUnavailableError("tidal", "catalogue search omitted referenced artist metadata");
      }
    }
    return resource;
  });
  // The boundary above checks the kind, id, required label and artist metadata.
  return {
    data: resources as unknown as TidalSearchResourceMap[Kind][],
    included: included as TidalTrackResponse["included"],
  };
}

/**
 * Checks consumed optional fields before they reach scoring or image selection.
 *
 * Missing/null optional values are allowed, but a value of the wrong type is
 * not a clean miss and must not enter the negative cache. Unknown fields do
 * not constrain the provider's response shape.
 *
 * @param attributes - Included resource attributes after required-label checks.
 * @param relationship - Resource kind selecting the consumed optional fields.
 * @throws UpstreamUnavailableError for malformed consumed metadata.
 */
function validateSearchAttributes(
  attributes: Record<string, unknown>,
  relationship: keyof TidalSearchResourceMap,
): void {
  for (const [field, expected] of Object.entries(SEARCH_RELATIONSHIPS[relationship].optional)) {
    const value = attributes[field];
    if (
      value != null &&
      (typeof value !== expected || (typeof value === "number" && (!Number.isFinite(value) || value < 0)))
    ) {
      throw new UpstreamUnavailableError("tidal", "catalogue search included malformed attributes");
    }
  }
  if (relationship === "tracks" && attributes.duration != null) {
    const duration = attributes.duration;
    if (typeof duration !== "number" && typeof duration !== "string")
      throw new UpstreamUnavailableError("tidal", "catalogue search included an invalid duration");
    const parsed = parseDuration(duration);
    if (parsed === undefined || !Number.isFinite(parsed) || parsed < 0)
      throw new UpstreamUnavailableError("tidal", "catalogue search included an invalid duration");
  }
  const images = attributes.imageLinks;
  if (
    images != null &&
    (!Array.isArray(images) || images.some((image) => !image || typeof image.href !== "string" || !image.href.trim()))
  ) {
    throw new UpstreamUnavailableError("tidal", "catalogue search included malformed image metadata");
  }
}

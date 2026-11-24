/**
 * @file Tidal OpenAPI v2 JSON:API resource shapes shared by the adapter and
 * the search document handling in `search-document.ts`.
 */

/** A provider-supplied image variant; dimensions choose among actual hrefs only. */
export interface TidalImageLink {
  href: string;
  meta?: { width: number; height: number };
}

/** Optional to-many artwork linkage, distinct from the included file resource. */
export interface TidalArtworkRelationship {
  data?: Array<{ id: string; type: string }> | null;
}

/** Keeps album covers and artist portraits as separate relationship roles. */
export interface TidalArtworkRelationships {
  coverArt?: TidalArtworkRelationship;
  profileArt?: TidalArtworkRelationship;
}

/** Shared included-resource fields consumed by identity, listings and artwork. */
export interface TidalRelatedResource {
  id: string;
  type: string;
  attributes: {
    name?: string;
    title?: string;
    isrc?: string;
    trackNumber?: number;
    duration?: number | string;
    imageLinks?: TidalImageLink[];
    files?: TidalImageLink[];
  };
  relationships?: TidalTrackResource["relationships"] & TidalArtworkRelationships;
}

/** A track resource as returned by lookups and projected from search. */
export interface TidalTrackResource {
  id: string;
  attributes: {
    title: string;
    isrc?: string;
    duration?: number | string; // ISO 8601 duration or seconds
    explicit?: boolean;
    externalLinks?: Array<{ href: string; meta: { type: string } }>;
    imageLinks?: Array<{ href: string; meta: { width: number; height: number } }>;
  };
  relationships?: {
    artists?: {
      data: Array<{ id: string }>;
    };
    albums?: {
      data: Array<{ id: string }>;
    };
  };
}

/** A track lookup document: the track plus its included related resources. */
export interface TidalTrackResponse {
  data: TidalTrackResource;
  included?: TidalRelatedResource[];
}

/** An ISRC-filtered track collection and its included related resources. */
export interface TidalSearchResponse {
  data: TidalTrackResource[];
  included?: TidalRelatedResource[];
}

/** An album resource as returned by lookups and projected from search. */
export interface TidalAlbumResource {
  id: string;
  attributes: {
    title: string;
    barcodeId?: string; // UPC
    releaseDate?: string;
    numberOfItems?: number;
    imageLinks?: Array<{ href: string; meta: { width: number; height: number } }>;
  };
  relationships?: TidalArtworkRelationships & {
    artists?: { data: Array<{ id: string }> };
    items?: { data: Array<{ id: string }> };
  };
}

/** An album lookup document: the album plus its included related resources. */
export interface TidalAlbumResponse {
  data: TidalAlbumResource;
  included?: TidalRelatedResource[];
}

/** UPC-filtered album collections contain albums directly, unlike text-search documents. */
export interface TidalAlbumSearchResponse {
  data: TidalAlbumResource[];
  included?: TidalAlbumResponse["included"];
}

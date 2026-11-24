/**
 * Reusable OpenAPI / AJV schemas for the public v1 API. Registered via
 * `app.addSchema(...)` in `server.ts` so every route can reference them
 * with `{ $ref: "<Name>#" }` and `@fastify/swagger` re-publishes them
 * under `components.schemas.<Name>` in the generated OpenAPI document.
 *
 * Keep the shapes in sync with the TypeScript interfaces in
 * `@musiccloud/shared` (`packages/shared/src/api.ts` + `content.ts` +
 * `plugins.ts`). Changing a shape here without updating the shared type
 * (or vice versa) produces silently drifting docs.
 *
 * Every schema carries an `example` so Swagger UI renders a realistic
 * payload for Try-It-Out and code-sample generation. Examples use
 * "Take on Me" by a-ha throughout for visual consistency.
 */

import { ARTIST_IDENTITY_OPENAPI_SCHEMAS } from "./artist-identity-openapi-schemas.js";
import {
  ArtistEventSchema,
  ArtistInfoSchema,
  ArtistProfileSchema,
  ArtistTopTrackSchema,
  CcArtistInfoSchema,
  CcArtistProfileSchema,
  CcArtistTopTrackSchema,
  CcSimilarArtistTrackSchema,
  SimilarArtistTrackSchema,
} from "./artist-info-openapi-schemas.js";
import {
  AlbumSchema,
  ArtistCreditSchema,
  ArtistSchema,
  OgMetaSchema,
  PlatformLinkSchema,
  TrackSchema,
  VinylLayoutSchema,
  VinylLayoutTrackSchema,
  VinylSideSchema,
} from "./catalog-openapi-schemas.js";
import {
  CcAlbumResolveSuccessSchema,
  CcAlbumSchema,
  CcArtistResolveSuccessSchema,
  CcArtistSchema,
  CcBandcampAvailabilityResponseSchema,
  CcMusicInfoSchema,
  CcRandomExampleResponseSchema,
  CcResolveSuccessSchema,
  CcTrackResolveSuccessSchema,
  CcTrackSchema,
  CcTrackStatsSchema,
} from "./cc-openapi-schemas.js";
import {
  ActiveServiceSchema,
  ContentPageSummarySchema,
  NavItemSchema,
  PublicContentPageSchema,
  PublicPageSegmentSchema,
} from "./content-openapi-schemas.js";
import {
  CcGenreAlbumCandidateSchema,
  CcGenreArtistCandidateSchema,
  CcGenreBrowseResponseSchema,
  CcGenreSearchResponseSchema,
  CcGenreTileSchema,
  CcGenreTrackCandidateSchema,
  GenreAlbumCandidateSchema,
  GenreArtistCandidateSchema,
  GenreBrowseResponseSchema,
  GenreSearchResponseSchema,
  GenreTileSchema,
  GenreTrackCandidateSchema,
} from "./genre-openapi-schemas.js";
import {
  HealthStatusResponseSchema,
  HealthUnavailableResponseSchema,
  PublicTierSchema,
} from "./platform-openapi-schemas.js";
import {
  AlbumResolveSuccessSchema,
  ArtistResolveSuccessSchema,
  DisambiguationCandidateSchema,
  LinkMetadataResponseSchema,
  ResolveDisambiguationSchema,
  ResolveSuccessSchema,
  TrackResolveSuccessSchema,
  UnifiedResolveSuccessSchema,
} from "./resolve-openapi-schemas.js";
import {
  AlbumSharePageResponseSchema,
  ArtistSharePageResponseSchema,
  CcAlbumSharePageResponseSchema,
  CcArtistSharePageResponseSchema,
  CcTrackSharePageResponseSchema,
  SharePageSchema,
  SharePreviewResponseSchema,
  TrackSharePageResponseSchema,
} from "./share-openapi-schemas.js";

export * from "./artist-info-openapi-schemas.js";
export * from "./catalog-openapi-schemas.js";
export * from "./cc-openapi-schemas.js";
export * from "./content-openapi-schemas.js";
export * from "./genre-openapi-schemas.js";
export * from "./platform-openapi-schemas.js";
export * from "./resolve-openapi-schemas.js";
export * from "./share-openapi-schemas.js";

/**
 * All schemas registered at app boot — the order matters: dependents last.
 *
 * `NavItemSchema`, `PublicContentPageSchema`, and `ContentPageSummarySchema`
 * are included because the internal SSR helper routes (`/api/v1/nav`,
 * `/api/v1/content`, `/api/v1/content/:slug`) still need them for runtime
 * response serialization. Those routes themselves are hidden from the
 * public API reference by the `transform` filter in `server.ts`.
 */
export const OPENAPI_SCHEMAS = [
  ArtistCreditSchema,
  HealthStatusResponseSchema,
  HealthUnavailableResponseSchema,
  PublicTierSchema,
  CcBandcampAvailabilityResponseSchema,
  CcRandomExampleResponseSchema,
  SharePreviewResponseSchema,
  TrackSchema,
  VinylLayoutTrackSchema,
  VinylSideSchema,
  VinylLayoutSchema,
  AlbumSchema,
  ArtistSchema,
  PlatformLinkSchema,
  LinkMetadataResponseSchema,
  DisambiguationCandidateSchema,
  OgMetaSchema,
  ResolveSuccessSchema,
  ResolveDisambiguationSchema,
  TrackResolveSuccessSchema,
  AlbumResolveSuccessSchema,
  ArtistResolveSuccessSchema,
  UnifiedResolveSuccessSchema,
  GenreTrackCandidateSchema,
  GenreAlbumCandidateSchema,
  GenreArtistCandidateSchema,
  GenreTileSchema,
  GenreSearchResponseSchema,
  GenreBrowseResponseSchema,
  CcGenreTrackCandidateSchema,
  CcGenreAlbumCandidateSchema,
  CcGenreArtistCandidateSchema,
  CcGenreTileSchema,
  CcGenreSearchResponseSchema,
  CcGenreBrowseResponseSchema,
  ArtistTopTrackSchema,
  ArtistProfileSchema,
  ArtistEventSchema,
  SimilarArtistTrackSchema,
  ArtistInfoSchema,
  CcArtistTopTrackSchema,
  CcArtistProfileSchema,
  CcSimilarArtistTrackSchema,
  CcArtistInfoSchema,
  CcMusicInfoSchema,
  CcTrackStatsSchema,
  CcTrackSchema,
  CcAlbumSchema,
  CcArtistSchema,
  CcTrackResolveSuccessSchema,
  CcAlbumResolveSuccessSchema,
  CcArtistResolveSuccessSchema,
  CcResolveSuccessSchema,
  TrackSharePageResponseSchema,
  AlbumSharePageResponseSchema,
  ArtistSharePageResponseSchema,
  CcTrackSharePageResponseSchema,
  CcAlbumSharePageResponseSchema,
  CcArtistSharePageResponseSchema,
  SharePageSchema,
  PublicPageSegmentSchema,
  PublicContentPageSchema,
  ContentPageSummarySchema,
  NavItemSchema,
  ActiveServiceSchema,
  ...ARTIST_IDENTITY_OPENAPI_SCHEMAS,
] as const;

import {
  buildActiveConfig,
  ccResolveDataToResult,
  ccResultToShareProps,
  parseUnifiedResolveResponse,
} from "@/lib/resolve/parsers";
import { resolveCcCandidate, resolveTrackQuery } from "@/lib/resolve/resolve-client";
import type { ArtistInfoContext } from "@/lib/share/artist-info-client";
import { buildShareViewFromResolvedResponse } from "@/lib/share/share-view";
import { type ActiveResult, ActiveResultKind } from "@/lib/types/app";
import { type MediaCardContentConfiguration, MediaCardContentTypeValue } from "@/lib/types/media-card";

/**
 * The in-place share update a resolver produces — exactly the inputs the
 * ShareLayout `Resolved` reducer action consumes, plus the short URL for the
 * address bar.
 *
 * Both the commercial and CC resolvers return this one shape, so ShareLayout can
 * swap the result in place (no navigation, no global re-mount) without knowing
 * which mode produced it.
 *
 * @property shortUrl - The freshly minted short URL, written to the address bar
 *   via `replaceBrowserUrlWithShortUrl` (a history replace, not a navigation).
 * @property config - The media-card configuration for the resolved entity. For a
 *   CC track it carries `ccInfoContent` / `ccJamendoArtistId`, so the secondary
 *   card and artist column follow automatically.
 * @property artistName - The artist name driving the shared artist column.
 * @property artistInfoContext - Commercial narrowing context (shortId /
 *   artistEntityId); absent for CC, which drives its column off
 *   `config.ccJamendoArtistId` instead.
 * @property pageTitle - Document title for the resolved entity, set on a
 *   persistent share page; absent for a landing result (no entity-level title).
 */
interface ResolvedShareUpdate {
  shortUrl: string;
  config: MediaCardContentConfiguration;
  artistName: string;
  artistInfoContext?: ArtistInfoContext;
  pageTitle?: string;
}

/**
 * The context ShareLayout hands a resolver on each artist-column row click.
 *
 * @property signal - Abort signal for cancellation / timeout (owned by ShareLayout).
 * @property configType - The current config's discriminant. The commercial
 *   resolver needs it to pick the share-page vs landing-result config shape; the
 *   CC resolver ignores it.
 */
interface TrackResolveContext {
  signal: AbortSignal;
  configType: MediaCardContentConfiguration["type"];
}

/**
 * Resolves a clicked artist-column row candidate (the row's `deezerUrl` slot) to
 * an in-place {@link ResolvedShareUpdate}.
 *
 * The shared protocol behind every artist-column row resolve: commercial and CC
 * each provide one implementation, and ShareLayout consumes the protocol
 * generically — so neither mode needs its own navigation or global-dispatch
 * path. Swapping the resolver swaps the data source without touching the
 * in-place update mechanics.
 */
export type TrackResolver = (candidate: string, ctx: TrackResolveContext) => Promise<ResolvedShareUpdate>;

/** The artist name driving the column: an artist result uses its own name, a
 *  song/album uses its primary artist. */
function resultArtistName(active: ActiveResult): string {
  return active.kind === ActiveResultKind.Artist ? active.name : active.artist;
}

/**
 * Commercial {@link TrackResolver}: resolves the candidate through the unified
 * resolve endpoint, then builds the share-page config (persistent `/:shortId`)
 * or the landing-result config depending on the current config shape.
 */
export const commercialTrackResolver: TrackResolver = async (candidate, { signal, configType }) => {
  const resolved = await resolveTrackQuery(candidate, signal);
  if (configType === MediaCardContentTypeValue.Share) {
    const next = buildShareViewFromResolvedResponse(resolved);
    return {
      shortUrl: resolved.shortUrl,
      config: next.config,
      artistName: next.artistName,
      artistInfoContext: next.artistInfoContext,
      pageTitle: next.pageTitle,
    };
  }
  const active = parseUnifiedResolveResponse(resolved);
  return { shortUrl: resolved.shortUrl, config: buildActiveConfig(active), artistName: resultArtistName(active) };
};

/**
 * CC {@link TrackResolver}: resolves the candidate through the CC resolve
 * endpoint and builds the CC config (which carries `ccInfoContent` and
 * `ccJamendoArtistId`). The artist column loads async from
 * `config.ccJamendoArtistId`, so no narrowing context is returned.
 */
export const ccTrackResolver: TrackResolver = async (candidate, { signal }) => {
  const data = await resolveCcCandidate(candidate, signal);
  const { config, artistName } = ccResultToShareProps(ccResolveDataToResult(data));
  const pageTitle = config.artist ? `${config.title} by ${config.artist} - musiccloud` : `${config.title} - musiccloud`;
  return { shortUrl: config.shortUrl, config, artistName, pageTitle };
};

import { type ApiLink, getPlatformLabel, isValidServiceId, type MatchMethod, type ServiceId } from "@musiccloud/shared";
import { stripTrackingParams } from "../platform/url.js";

export type PublicLinkSource = {
  service: string;
  url: string;
  confidence?: number | null;
  matchMethod?: string | null;
};

type ApiLinkOptions = {
  stripTracking?: boolean;
};

const PUBLIC_MATCH_METHODS: readonly MatchMethod[] = ["isrc", "search", "cache", "upc", "isrc-inference"];

function isPublicMatchMethod(value: unknown): value is ApiLink["matchMethod"] {
  return typeof value === "string" && PUBLIC_MATCH_METHODS.includes(value as MatchMethod);
}

function isPublicConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function normalizeUrl(url: string, options: ApiLinkOptions): string {
  return options.stripTracking ? stripTrackingParams(url) : url;
}

function hasUrl(link: PublicLinkSource): boolean {
  return typeof link.url === "string" && link.url.length > 0;
}

function platformDisplayName(service: ServiceId): string {
  return getPlatformLabel(service);
}

/**
 * Convert resolver/internal link records into the public `ApiLink` contract.
 *
 * DB rows, cache rows, and resolver adapter results are not UI-ready payloads:
 * they carry technical service ids and may carry adapter-specific display
 * names. Public responses hydrate labels from shared platform metadata so
 * stale cache rows cannot leak ids like `apple-music` into rendered buttons.
 *
 * Fresh resolve responses keep resolver confidence and match method, but only
 * when both values are valid for the public schema. Cache-backed reads use
 * `toCachedApiLinks` instead, because their stored match metadata describes
 * the original resolve, not the current DB/cache read.
 */
export function toApiLinks(links: readonly PublicLinkSource[], options: ApiLinkOptions = {}): ApiLink[] {
  return links.reduce<ApiLink[]>((apiLinks, link) => {
    if (!hasUrl(link) || !isValidServiceId(link.service)) return apiLinks;
    if (!isPublicConfidence(link.confidence) || !isPublicMatchMethod(link.matchMethod)) return apiLinks;

    apiLinks.push({
      service: link.service,
      displayName: platformDisplayName(link.service),
      url: normalizeUrl(link.url, options),
      confidence: link.confidence,
      matchMethod: link.matchMethod,
    });
    return apiLinks;
  }, []);
}

/**
 * Convert cache/DB read links into public `ApiLink` objects.
 *
 * Cache-backed share/link reads intentionally overwrite match metadata with
 * `confidence: 1` and `matchMethod: "cache"`: the public response is saying
 * "this is a trusted persisted link", not re-reporting the adapter strategy
 * from the original resolve that created the row.
 */
export function toCachedApiLinks(links: readonly PublicLinkSource[], options: ApiLinkOptions = {}): ApiLink[] {
  return links.reduce<ApiLink[]>((apiLinks, link) => {
    if (!hasUrl(link) || !isValidServiceId(link.service)) return apiLinks;

    apiLinks.push({
      service: link.service,
      displayName: platformDisplayName(link.service),
      url: normalizeUrl(link.url, options),
      confidence: 1,
      matchMethod: "cache",
    });
    return apiLinks;
  }, []);
}

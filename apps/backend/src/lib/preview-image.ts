/**
 * @file Finds the picture a web page shows: a site's own mark or the portrait
 * on somebody's profile.
 *
 * Ported from lmaa.space `apps/backend/src/lib/og.ts`, where it reads shop
 * logos. Adapted: every request goes through `fetchExternalResource` in
 * `external-resource.ts`, which uses `fetchWithTimeout` to check each redirect
 * hop and every connection against private and reserved addresses, in place of
 * lmaa's own redirect loop and `isPublicFetchTarget`; failures are logged
 * through `log.deviation` with the host and the reason. The image header
 * parsers live in `image-dimensions.ts`, and lmaa's `detectPlatformFromHost`
 * lives in `nodeinfo.ts`. lmaa's shop link checker (`inspectImageUrl`) is not
 * ported, because nothing in musiccloud calls it. Not to be confused with
 * `lib/server/og.ts`, which writes musiccloud's own OpenGraph tags.
 */
import { fetchExternalResource, HEADERS, hostForLog, LOG_COMPONENT, LOG_ERROR_CODE } from "./external-resource.js";
import { readBodyPrefix, readJsonWithLimit, readTextPrefix } from "./http-body.js";
import { parseImageDimensions, parseSvgDimensions } from "./image-dimensions.js";
import { log } from "./infra/logger.js";

/** File types that are never a usable picture: animations and favicon containers. */
const SKIP_EXT = /\.(gif|ico)(\?|$)/i;
/**
 * Paths and names that are never a shop's own mark, whatever their size.
 *
 * Three groups, each of which produced a wrong logo in the field. Payment and
 * shipping marks belong to somebody else and sit in every footer. Product
 * imagery is the shop's stock rather than its identity, and a catalogue page
 * offers hundreds. Bot-challenge assets belong to the guard in front of the
 * shop: die-buchfinken.de returned the Anubis mascot, because the crawler never
 * saw the shop at all.
 */
const SKIP_NAME_PATTERNS =
  /pixel|tracking|1x1|blank|spacer|paypal|klarna|visa|mastercard|maestro|amex|sofort|giropay|sepa|applepay|apple-pay|googlepay|google-pay|bancontact|ideal|eps[-_.]|p24|oxxo|zahlart|payment[-_]|paybybank|banktransfer|vorkasse|rechnung|nachnahme|dhl|dpd|hermes|gls|ups[-_.]|versand|product[-_]image|produktbild|thumbnail[-_]image|\/anubis\/|challenge|captcha/i;
/** How long one image probe may take, redirects and the header bytes included. */
const PROBE_TIMEOUT_MS = 4000;
/** How long reading a page may take, redirects and the body included. */
const HTML_TIMEOUT_MS = 10000;
/** How long reading a web app manifest may take. */
const MANIFEST_TIMEOUT_MS = 5000;
/** How many inline `<img>` tags of one page are probed at most. */
const MAX_INLINE_IMG_CANDIDATES = 12;

/** How many leading bytes of an image a probe asks for with a `Range` header. */
const PROBE_RANGE_BYTES = 32 * 1024;
/** The `Range` header value that asks for {@link PROBE_RANGE_BYTES}. */
const PROBE_RANGE_HEADER = `bytes=0-${PROBE_RANGE_BYTES - 1}`;
/** The status a server answers when it refuses a ranged request. */
const HTTP_RANGE_NOT_SATISFIABLE = 416;
/** The statuses a probe accepts: a whole body or the requested range. */
const PROBE_OK_STATUSES: ReadonlySet<number> = new Set([200, 206]);

// Byte budgets for bodies fetched from sites we do not control. A timeout alone
// does not bound memory, because a fast server sends a great deal within it.
/** Enough for the `<head>` of any real shop page, which is all that is parsed. */
const MAX_HTML_BYTES = 512 * 1024;
/** Enough header data for images with unusually large metadata blocks. */
const MAX_IMAGE_HEADER_BYTES = 1024 * 1024;
/** A web app manifest is a small JSON document. */
const MAX_MANIFEST_BYTES = 256 * 1024;

/**
 * The word standing on its own, between separators or at either end.
 *
 * `logout` is excluded by the trailing condition rather than by name: a letter
 * may not follow, so `logo-` and `logo.` match whilst `logout` does not.
 */
const LOGO_NAME_PATTERN = /(^|[^a-z])(logo|brand|wordmark|signet)([^a-z]|$)/i;

/**
 * The same word run into a name in camel case, as `KiddicraftLogo1000head`.
 *
 * Case matters here, which is why this is separate: the capital is what marks
 * the word boundary a separator would otherwise provide. `logout` is refused
 * again, since a shop that writes `ShopLogout` means the door and not the mark.
 */
const LOGO_CAMEL_PATTERN = /[a-z](Logo|Brand|Wordmark|Signet)(?!ut)/;

/**
 * Where a candidate picture was declared, which decides how much it is trusted.
 *
 * `apple-touch` is a declared touch icon, `og` a sharing image from OpenGraph,
 * Twitter cards, `image_src` or JSON-LD, `manifest` an icon of the web app
 * manifest, `icon` a declared favicon, `inline-logo` an `<img>` named like a
 * logo, `inline-other` any other `<img>`, `header-logo` an `<img>` in the
 * masthead named like a logo, and `guessed` a conventional path nothing
 * declared.
 */
type CandidateKind =
  | "apple-touch"
  | "og"
  | "manifest"
  | "icon"
  | "inline-logo"
  | "inline-other"
  /** In the masthead and named like a logo: the shop's own mark. */
  | "header-logo"
  /** Not declared anywhere, tried at a path the platform conventionally uses. */
  | "guessed";

/**
 * What a caller is looking for on the page.
 *
 * `site-mark` is a site's own mark, which is what a website needs. `portrait` is
 * the picture a page shows of a person, which is what a sponsor's profile
 * carries. The two want opposite things from the same page, so the question is
 * asked once here rather than as a handful of flags at each call site. The
 * default of {@link fetchPreviewImage} is `site-mark`.
 */
export type PreviewIntent = "site-mark" | "portrait";

/**
 * The order a site's own mark is looked for in.
 *
 * A touch icon comes early because it is the mark a site cuts for exactly this
 * purpose, whilst its `og:image` is usually a banner.
 */
const SITE_MARK_PRIORITY: CandidateKind[] = [
  // First, because it is the mark itself. A sharing image is a photograph often
  // enough that a directory of shops would show scenery instead of brands.
  "header-logo",
  "apple-touch",
  "manifest",
  "icon",
  "inline-logo",
  // A conventional touch icon is a stronger mark signal than a product photo
  // from OpenGraph or an arbitrary inline image.
  "guessed",
];

/**
 * The order a person's picture is looked for in.
 *
 * The other way round, because on a profile the `og:image` is the portrait and
 * the touch icon belongs to the service rather than to the person. Looking for
 * a mark on a profile returns the platform's logo, which is the one picture
 * nobody wants there.
 */
const PORTRAIT_PRIORITY: CandidateKind[] = [
  // A person's page wants the person, so a masthead mark ranks below the
  // sharing image here, exactly opposite to a shop.
  "og",
  "apple-touch",
  "manifest",
  "icon",
  "inline-logo",
  "inline-other",
  "header-logo",
  "guessed",
];

/**
 * The smallest longer side, in pixels, a candidate of each kind must measure.
 * A candidate below it is discarded before ranking.
 */
const MIN_DIMENSION_BY_KIND: Record<CandidateKind, number> = {
  "apple-touch": 96,
  og: 128,
  manifest: 96,
  icon: 96,
  "inline-logo": 64,
  "inline-other": 128,
  "header-logo": 64,
  guessed: 96,
};

/** The kinds that may be an SVG: those that declare themselves a mark or an icon. */
const SVG_ACCEPTING_KINDS: ReadonlySet<CandidateKind> = new Set([
  "header-logo",
  "inline-logo",
  "apple-touch",
  "manifest",
  "icon",
]);

/**
 * Detects whether a URL looks like a logo asset rather than a content image.
 *
 * @param url - Absolute or relative image URL.
 * @returns `true` when the URL contains a logo-style keyword in path/query.
 *
 * @remarks
 * Used to upgrade plain inline `<img>` candidates to a higher priority group.
 * A directory name alone is not enough: theme and asset directories also hold
 * trust badges, widgets, hero banners and product imagery.
 */
export function isLogoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const name = parsed.pathname + parsed.search;
    return LOGO_NAME_PATTERN.test(name) || LOGO_CAMEL_PATTERN.test(name);
  } catch {
    return LOGO_NAME_PATTERN.test(url) || LOGO_CAMEL_PATTERN.test(url);
  }
}

/**
 * Resolves homepage origin from an arbitrary URL.
 *
 * @param url - Any absolute URL.
 * @returns URL origin (`protocol//host`) or original input when parsing fails.
 */
export function extractHomepage(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

/**
 * What a relative URL in this document resolves against.
 *
 * A browser obeys `<base href>` and so must anything reading the same markup.
 * Several content management systems set one, and where the document sits
 * deeper than the base, ignoring it turns every relative path into a wrong one.
 * icomp.de serves `/index.php/en/news.html` with its assets at the root, so its
 * logo resolved to a 404 until this was read.
 *
 * @param html - The document, or as much of it as was read.
 * @param documentUrl - Where the document came from, after redirects.
 * @returns The base to resolve against. The document URL where there is no
 *   usable `base` tag, which is what the specification says.
 */
export function documentBase(html: string, documentUrl: string): string {
  const tag = html.match(/<base\b[^>]*>/i)?.[0];
  if (!tag) return documentUrl;

  const href = tag.match(/\bhref=["']([^"']*)["']/i)?.[1]?.trim();
  if (!href) return documentUrl;

  try {
    // Resolved against the document, because a base may itself be relative.
    return new URL(href, documentUrl).toString();
  } catch {
    return documentUrl;
  }
}

/**
 * Resolves an address a page declared against the page's base.
 *
 * @param src - The address as the page wrote it.
 * @param base - What relative addresses resolve against.
 * @returns The absolute address, or `null` for an inline `data:` address or one
 *   that cannot be parsed.
 */
function resolveUrl(src: string, base: string): string | null {
  if (!src || src.startsWith("data:")) return null;
  try {
    return src.startsWith("http") ? src : new URL(src, base).toString();
  } catch {
    return null;
  }
}

/**
 * Reads the leading part of a page as text.
 *
 * @param url - The page's address.
 * @returns The page's prefix, or `null` when it could not be read or was empty.
 */
async function fetchHtml(url: string): Promise<string | null> {
  const result = await fetchExternalResource(url, { headers: HEADERS }, HTML_TIMEOUT_MS);
  if (!result?.response.ok) return null;

  // The prefix rather than the whole document, because this HTML is scanned for
  // tags and never parsed as a unit. Everything the scan wants sits in the
  // head, so a storefront a few kilobytes over budget still answers, whereas
  // discarding it answered nothing at all. bestware.com is 540 KB against a
  // 512 KB budget and lost its logo to exactly that.
  const html = await readTextPrefix(result.response, MAX_HTML_BYTES);
  if (html.length === 0) {
    log.deviation({
      component: LOG_COMPONENT,
      errorCode: LOG_ERROR_CODE,
      operation: "preview_image_html",
      outcome: "empty_document",
      host: hostForLog(url),
    });
    return null;
  }
  return html;
}

/**
 * Requests an image, optionally only its leading bytes.
 *
 * @param url - The image's address.
 * @param range - Whether to ask for {@link PROBE_RANGE_BYTES} only.
 * @returns The response and its final address, or `null` when refused or failed.
 */
async function fetchImageResource(
  url: string,
  range: boolean,
): Promise<{ response: Response; finalUrl: string } | null> {
  return fetchExternalResource(
    url,
    {
      headers: {
        "User-Agent": HEADERS["User-Agent"],
        Accept: "image/*",
        ...(range ? { Range: PROBE_RANGE_HEADER } : {}),
      },
    },
    PROBE_TIMEOUT_MS,
  );
}

/**
 * Requests an image's leading bytes, and the whole image from a server that
 * refuses ranged requests.
 *
 * @param url - The image's address.
 * @returns The response and its final address, or `null` when refused or failed.
 */
async function fetchImageResourceWithFallback(url: string): Promise<{ response: Response; finalUrl: string } | null> {
  const ranged = await fetchImageResource(url, true);
  if (ranged?.response.status !== HTTP_RANGE_NOT_SATISFIABLE) return ranged;
  return fetchImageResource(url, false);
}

/**
 * Downloads enough of an image to read its native header and returns the real
 * pixel dimensions plus the final resolved URL.
 *
 * @param url - Absolute image URL.
 * @param kind - Where the candidate was declared, which decides whether an SVG counts.
 * @returns `{ url, width, height }` when the image was reached and decoded, otherwise `null`.
 *
 * @remarks
 * Asks for the first {@link PROBE_RANGE_BYTES} to keep the transfer small. A
 * server may ignore that and send the whole file; only the leading header bytes
 * are read and the stream is then cancelled. Total file size is not an
 * acceptance criterion. Servers that reject ranges are retried with a normal GET.
 */
async function probeImage(
  url: string,
  kind: CandidateKind,
): Promise<{ url: string; width: number; height: number } | null> {
  if (SKIP_EXT.test(url)) return null;
  if (SKIP_NAME_PATTERNS.test(url)) return null;

  const result = await fetchImageResourceWithFallback(url);
  if (!result) return null;

  if (!PROBE_OK_STATUSES.has(result.response.status)) return null;

  const contentType = result.response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !contentType.startsWith("image/")) return null;

  try {
    const buf = await readBodyPrefix(result.response, MAX_IMAGE_HEADER_BYTES);
    const svg = contentType.includes("image/svg+xml") || /\.svg(?:\?|$)/i.test(url);
    if (svg && !SVG_ACCEPTING_KINDS.has(kind)) return null;
    const dims = svg ? parseSvgDimensions(buf) : parseImageDimensions(buf);
    if (!dims || dims.width <= 0 || dims.height <= 0) return null;
    return { url: result.finalUrl, ...dims };
  } catch (error) {
    log.deviation(
      {
        component: LOG_COMPONENT,
        errorCode: LOG_ERROR_CODE,
        operation: "preview_image_probe",
        outcome: "candidate_skipped",
        host: hostForLog(url),
      },
      error,
    );
    return null;
  }
}

// === Candidate collection ===
// All sources are collected up front, then probed. The naming and `sizes`
// attributes on `<link>` tags are NOT used as ranking input, because sites
// often declare large sizes for tiny PNGs, so only the real header dimensions
// count.

/**
 * One picture a page declares, before it is measured.
 *
 * @property url - The absolute address, raised to `https`.
 * @property kind - Where it was declared, which decides its rank.
 * @property via - The source the caller is told about, such as `og:image`.
 */
type Candidate = { url: string; kind: CandidateKind; via: string };

/**
 * Query keys through which a CDN is asked for a particular size.
 *
 * Only unambiguous ones. A version or cache-busting key is deliberately absent,
 * because dropping it can change what the CDN serves rather than only how large
 * it serves it.
 */
const SIZE_QUERY_KEYS = new Set([
  "crop",
  "fit",
  "h",
  "height",
  "max-h",
  "max-w",
  "maxheight",
  "maxwidth",
  "resize",
  "s",
  "size",
  "sz",
  "w",
  "width",
]);

/**
 * The same image without the size its page asked for.
 *
 * A page routinely declares a large logo at icon size, because that is what the
 * page itself needs. The probe then measures the thumbnail, finds it under the
 * minimum for its kind, and discards a picture that was never too small. Asking
 * the same URL without those parameters returns the original.
 *
 * @param url - The URL as the page declared it.
 * @returns The URL without sizing parameters, or `null` where there were none
 *   to remove or the URL cannot be parsed. `null` means the caller has nothing
 *   new to enqueue.
 */
export function withoutSizeConstraints(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  let removed = false;
  for (const key of [...parsed.searchParams.keys()]) {
    if (!SIZE_QUERY_KEYS.has(key.toLowerCase())) continue;
    parsed.searchParams.delete(key);
    removed = true;
  }
  if (!removed) return null;

  // `URL` keeps a bare "?" once every parameter is gone, and that string is not
  // the same URL for the `seen` set or for a cache in front of it.
  return parsed.searchParams.size === 0 ? `${parsed.origin}${parsed.pathname}${parsed.hash}` : parsed.toString();
}

/**
 * The same address over a protected connection.
 *
 * A page reached over `https` may still declare its own pictures over `http`,
 * and a browser refuses those when the site's policy allows `img-src https:`
 * only. Storing the secure form is the answer, because a host that answers on
 * `https` serves the same file there. One that does not fails its probe, and
 * the candidate is dropped rather than kept at an address that can never be
 * drawn.
 *
 * @param url - An absolute URL.
 * @returns The `https` form, or the URL unchanged when it is not `http`.
 */
export function secureImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") return url;
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Adds a candidate once, and its unsized variant where it has one.
 *
 * @param out - The candidates collected so far; mutated.
 * @param seen - The addresses already collected; mutated.
 * @param rawUrl - The address as resolved from the page, or `null` to skip.
 * @param kind - Where it was declared.
 * @param via - The source the caller is told about.
 */
function pushCandidate(
  out: Candidate[],
  seen: Set<string>,
  rawUrl: string | null,
  kind: CandidateKind,
  via: string,
): void {
  if (!rawUrl) return;
  const url = secureImageUrl(rawUrl);
  if (seen.has(url)) return;
  if (SKIP_EXT.test(url)) return;
  seen.add(url);
  out.push({ url, kind, via });

  // Every source converges here, so one line covers link icons, manifests,
  // meta tags and inline images alike. The stripped variant is probed like any
  // other candidate; where it does not exist it fails that probe and costs a
  // single request.
  const full = withoutSizeConstraints(url);
  if (full && !seen.has(full) && !SKIP_EXT.test(full)) {
    seen.add(full);
    out.push({ url: full, kind, via: `${via}-full` });
  }
}

/**
 * Collects the pictures a page names in one kind of `<meta>` tag.
 *
 * @param html - The page.
 * @param base - What relative addresses resolve against.
 * @param property - The tag's name, such as `og:image`.
 * @param attr - Whether the name stands in `property` or in `name`.
 * @param kind - The kind every match is collected as.
 * @param via - The source the caller is told about.
 * @param out - The candidates collected so far; mutated.
 * @param seen - The addresses already collected; mutated.
 */
function collectMetaImage(
  html: string,
  base: string,
  property: string,
  attr: "property" | "name",
  kind: CandidateKind,
  via: string,
  out: Candidate[],
  seen: Set<string>,
): void {
  const propPattern = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\b[^>]*${attr}=["']${propPattern}["'][^>]*content=["']([^"']+)["']`, "gi"),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${propPattern}["']`, "gi"),
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      pushCandidate(out, seen, resolveUrl(match[1].trim(), base), kind, via);
    }
  }
}

/**
 * Collects the icons and sharing images a page declares in `<link>` tags.
 *
 * @param html - The page.
 * @param base - What relative addresses resolve against.
 * @param out - The candidates collected so far; mutated.
 * @param seen - The addresses already collected; mutated.
 */
function collectLinkIcons(html: string, base: string, out: Candidate[], seen: Set<string>): void {
  for (const [, attrs] of html.matchAll(/<link\b([^>]+)>/gi)) {
    const relMatch = attrs.match(/\brel=["']([^"']+)["']/i);
    if (!relMatch) continue;
    const rel = relMatch[1].toLowerCase();
    let kind: CandidateKind | null = null;
    let via: string | null = null;
    if (/\bapple-touch-icon(?:-precomposed)?\b/.test(rel)) {
      kind = "apple-touch";
      via = "apple-icon";
    } else if (/\b(?:shortcut\s+)?icon\b/.test(rel)) {
      kind = "icon";
      via = "icon";
    } else if (/\bfluid-icon\b/.test(rel)) {
      kind = "icon";
      via = "fluid-icon";
    } else if (/\bimage_src\b/.test(rel)) {
      kind = "og";
      via = "image_src";
    }
    if (!kind || !via) continue;

    const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    pushCandidate(out, seen, resolveUrl(hrefMatch[1].trim(), base), kind, via);
  }
}

/**
 * Collects every `image` a JSON-LD value names, at any depth.
 *
 * @param data - A parsed JSON-LD value.
 * @param base - What relative addresses resolve against.
 * @param out - The candidates collected so far; mutated.
 * @param seen - The addresses already collected; mutated.
 */
function collectJsonLdImages(data: unknown, base: string, out: Candidate[], seen: Set<string>): void {
  if (!data) return;
  if (Array.isArray(data)) {
    for (const item of data) collectJsonLdImages(item, base, out, seen);
    return;
  }
  if (typeof data !== "object") return;

  const obj = data as Record<string, unknown>;
  const img = obj.image;
  if (typeof img === "string") {
    pushCandidate(out, seen, resolveUrl(img, base), "og", "json-ld");
  } else if (Array.isArray(img)) {
    for (const entry of img) {
      if (typeof entry === "string") {
        pushCandidate(out, seen, resolveUrl(entry, base), "og", "json-ld");
      } else if (entry && typeof entry === "object") {
        const entryUrl = (entry as Record<string, unknown>).url;
        if (typeof entryUrl === "string") {
          pushCandidate(out, seen, resolveUrl(entryUrl, base), "og", "json-ld");
        }
      }
    }
  } else if (img && typeof img === "object") {
    const imgUrl = (img as Record<string, unknown>).url;
    if (typeof imgUrl === "string") {
      pushCandidate(out, seen, resolveUrl(imgUrl, base), "og", "json-ld");
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      collectJsonLdImages(value, base, out, seen);
    }
  }
}

/**
 * Collects the pictures named in a page's JSON-LD blocks.
 *
 * @param html - The page.
 * @param base - What relative addresses resolve against.
 * @param out - The candidates collected so far; mutated.
 * @param seen - The addresses already collected; mutated.
 */
function collectJsonLdBlocks(html: string, base: string, out: Candidate[], seen: Set<string>): void {
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      collectJsonLdImages(JSON.parse(match[1].trim()), base, out, seen);
    } catch {
      // Malformed JSON-LD blocks are common; skip silently
    }
  }
}

/**
 * How many pictures into a page the masthead still counts.
 *
 * Three, because a masthead holds a mark and rarely much else: often one
 * picture, sometimes a second for narrow screens, occasionally a third.
 */
const MASTHEAD_IMAGE_COUNT = 3;

/**
 * Whether a picture is early enough on the page to be the shop's own mark.
 *
 * Counted in pictures rather than in bytes. Byte position looks like the
 * obvious measure and is the wrong one: a modern storefront carries tens of
 * kilobytes of inline styles and structured data before its first picture, and
 * measuring bestware.com put its wordmark at byte 81.438 of 539.643. Counting
 * pictures puts the same wordmark first, as it does for every page checked.
 *
 * A closing `header` still wins where a page has one, since that is the page
 * saying so itself. Most do not: of the shops checked, not one carried a
 * `header` element.
 *
 * @param html - The document, or as much of it as was read.
 * @param imageIndex - Which picture this is, counted from zero.
 * @param offset - Where the picture sits, in bytes.
 * @returns Whether it belongs to the masthead.
 */
export function isMastheadImage(html: string, imageIndex: number, offset: number): boolean {
  const closing = html.search(/<\/header\s*>/i);
  if (closing > 0) return offset < closing;
  return imageIndex < MASTHEAD_IMAGE_COUNT;
}

/**
 * Collects the page's inline `<img>` tags, up to {@link MAX_INLINE_IMG_CANDIDATES}.
 *
 * @param html - The page.
 * @param base - What relative addresses resolve against.
 * @param out - The candidates collected so far; mutated.
 * @param seen - The addresses already collected; mutated.
 */
function collectInlineImages(html: string, base: string, out: Candidate[], seen: Set<string>): void {
  let added = 0;
  let imageIndex = -1;
  for (const match of html.matchAll(/<img\b([^>]+)>/gi)) {
    if (added >= MAX_INLINE_IMG_CANDIDATES) break;
    imageIndex += 1;
    const attrs = match[1];
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const src = srcMatch[1].trim();
    if (SKIP_NAME_PATTERNS.test(src) || SKIP_EXT.test(src)) continue;
    const resolved = resolveUrl(src, base);
    if (!resolved) continue;

    // A picture in the masthead whose name also says logo is the mark itself,
    // and it beats the sharing image, which is usually a photograph. Both
    // conditions are required: position alone would take a hero banner, and the
    // name alone takes the brands a shop stocks, of which a hardware store
    // carries a dozen further down the page.
    const inMasthead = isMastheadImage(html, imageIndex, match.index ?? 0);
    const named = isLogoUrl(resolved);
    const kind: CandidateKind = inMasthead && named ? "header-logo" : named ? "inline-logo" : "inline-other";
    const via = kind === "header-logo" ? "header-logo" : kind === "inline-logo" ? "inline-logo" : "inline-img";
    pushCandidate(out, seen, resolved, kind, via);
    added++;
  }
}

/**
 * Reads the icon addresses a web app manifest lists.
 *
 * @param manifestUrl - The manifest's address.
 * @param base - What relative icon addresses resolve against.
 * @returns The absolute icon addresses, empty on any failure.
 */
async function fetchManifestIcons(manifestUrl: string, base: string): Promise<string[]> {
  const result = await fetchExternalResource(
    manifestUrl,
    { headers: { "User-Agent": HEADERS["User-Agent"], Accept: "application/json,*/*" } },
    MANIFEST_TIMEOUT_MS,
  );
  if (!result?.response.ok) return [];
  try {
    const json = await readJsonWithLimit<{ icons?: unknown }>(result.response, MAX_MANIFEST_BYTES);
    if (!json) return [];
    if (!Array.isArray(json.icons)) return [];
    const out: string[] = [];
    for (const icon of json.icons) {
      if (icon && typeof icon === "object") {
        const src = (icon as Record<string, unknown>).src;
        if (typeof src === "string") {
          const resolved = resolveUrl(src, base);
          if (resolved) out.push(resolved);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Finds the address of the web app manifest a page links.
 *
 * @param html - The page.
 * @param base - What a relative address resolves against.
 * @returns The manifest's absolute address, or `null` when the page links none.
 */
function extractManifestHref(html: string, base: string): string | null {
  const match =
    html.match(/<link\b[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["']/i) ??
    html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']manifest["']/i);
  if (!match) return null;
  return resolveUrl(match[1].trim(), base);
}

/**
 * Resolves the best preview image available for a page.
 *
 * @param pageUrl - The page's address, as an operator entered it.
 * @param options - `intent` says whether the site's mark or a person's portrait
 *   is wanted; the default is `site-mark`.
 * @returns `{ url, via }` of the best candidate, or `null` when no candidate
 *          reaches the minimum dimension threshold.
 *
 * @remarks
 * All candidates from meta tags, link tags, JSON-LD, the web app manifest,
 * well-known paths, and inline images are collected, fetched and measured.
 *
 * A `site-mark` accepts only sources that identify themselves as a logo or an
 * icon: header/inline images with an explicit logo-style name, declared touch,
 * manifest and favicon entries, then conventional well-known icon paths. It
 * deliberately returns `null` rather than fall back to OpenGraph, JSON-LD or an
 * arbitrary inline image, because those are commonly product photos or banners.
 * A `portrait` keeps those broad image fallbacks because that intent asks for a
 * person or profile image rather than a site identity.
 *
 * Within each bucket the candidate with the largest real `max(width, height)`
 * wins. Site-declared `sizes` attributes are ignored deliberately because they
 * often misrepresent the actual asset. Explicit SVG logos are measured from
 * their `viewBox` or dimensions and accepted in logo/icon buckets.
 */
export async function fetchPreviewImage(
  pageUrl: string,
  options: { intent?: PreviewIntent } = {},
): Promise<{ url: string; via: string } | null> {
  const intent = options.intent ?? "site-mark";
  const priority = intent === "portrait" ? PORTRAIT_PRIORITY : SITE_MARK_PRIORITY;
  const homepage = extractHomepage(pageUrl);
  // A site's own homepage is the right second place to look, because a deep
  // page and the site share a mark. A profile's is not: the homepage there
  // belongs to the service, and its picture would win on size and show the
  // platform instead of the person.
  const urlsToTry =
    intent === "portrait"
      ? [pageUrl]
      : pageUrl !== `${homepage}/` && pageUrl !== homepage
        ? [pageUrl, `${homepage}/`]
        : [pageUrl];

  const htmlEntries = await Promise.all(urlsToTry.map(async (url) => ({ url, html: await fetchHtml(url) })));
  // Keyed by where the document came from, so two attempts stay apart, and
  // carrying the base a browser would resolve against, which is not always the
  // same thing.
  const htmlMap = new Map<string, { html: string; base: string }>();
  for (const { url, html } of htmlEntries) {
    if (html) htmlMap.set(url, { html, base: documentBase(html, url) });
  }

  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  for (const [, { html, base: baseUrl }] of htmlMap) {
    collectMetaImage(html, baseUrl, "og:image", "property", "og", "og:image", candidates, seen);
    collectMetaImage(html, baseUrl, "og:image:secure_url", "property", "og", "og:image", candidates, seen);
    collectMetaImage(html, baseUrl, "og:image:url", "property", "og", "og:image", candidates, seen);
    collectMetaImage(html, baseUrl, "twitter:image", "name", "og", "twitter:image", candidates, seen);
    collectMetaImage(html, baseUrl, "twitter:image:src", "name", "og", "twitter:image", candidates, seen);
    collectLinkIcons(html, baseUrl, candidates, seen);
    collectJsonLdBlocks(html, baseUrl, candidates, seen);
  }

  const manifestIconEntries = await Promise.all(
    Array.from(htmlMap).map(async ([, { html, base: baseUrl }]) => {
      const manifestUrl = extractManifestHref(html, baseUrl);
      return manifestUrl ? fetchManifestIcons(manifestUrl, manifestUrl) : [];
    }),
  );
  for (const icons of manifestIconEntries) {
    for (const icon of icons) pushCandidate(candidates, seen, icon, "manifest", "manifest");
  }

  // Guessed at the site's root, so they belong to the service rather than to
  // whoever the page is about, and they are left out when a person is wanted.
  // All of them are `guessed` rather than the kind their path suggests, because
  // a guess must not outrank what the page declares about itself.
  if (intent !== "portrait") {
    pushCandidate(candidates, seen, `${homepage}/apple-touch-icon.png`, "guessed", "well-known");
    pushCandidate(candidates, seen, `${homepage}/apple-touch-icon-precomposed.png`, "guessed", "well-known");
    pushCandidate(candidates, seen, `${homepage}/favicon.png`, "guessed", "well-known");
  }

  for (const [, { html, base: baseUrl }] of htmlMap) {
    collectInlineImages(html, baseUrl, candidates, seen);
  }

  if (candidates.length === 0) return null;

  const probed = await Promise.all(
    candidates.map(async (candidate) => {
      const probe = await probeImage(candidate.url, candidate.kind);
      if (!probe) return null;
      return { ...probe, kind: candidate.kind, via: candidate.via, requestedUrl: candidate.url };
    }),
  );

  const byKind = new Map<CandidateKind, typeof probed>();
  for (const result of probed) {
    if (!result) continue;
    const minDim = MIN_DIMENSION_BY_KIND[result.kind];
    if (Math.max(result.width, result.height) < minDim) continue;
    const bucket = byKind.get(result.kind) ?? [];
    bucket.push(result);
    byKind.set(result.kind, bucket);
  }

  for (const kind of priority) {
    const bucket = byKind.get(kind);
    if (!bucket || bucket.length === 0) continue;
    let largest = bucket[0];
    for (const entry of bucket) {
      if (!entry || !largest) continue;
      if (Math.max(entry.width, entry.height) > Math.max(largest.width, largest.height)) {
        largest = entry;
      }
    }
    if (largest) return { url: largest.requestedUrl, via: largest.via };
  }

  return null;
}

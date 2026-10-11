/**
 * Last.fm `artist.getInfo` wrapper. Returns the bio summary, listener
 * counts, and similar-artist names. Upstream biography HTML is normalized
 * here so every caller receives plain text rather than parser-sensitive markup.
 */

import { type DefaultTreeAdapterTypes, parseFragment } from "parse5";
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { readLastFmJson } from "./lastfm-response.js";

const API_BASE = "https://ws.audioscrobbler.com/2.0";
const TIMEOUT_MS = 5000;
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const DISCARDED_ELEMENT_NAMES = new Set([
  "embed",
  "iframe",
  "noembed",
  "noscript",
  "object",
  "plaintext",
  "script",
  "style",
  "template",
  "textarea",
  "xmp",
]);
const BLOCK_ELEMENT_NAMES = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

export interface LastFmArtistInfoResult {
  bioSummary: string | null;
  scrobbles: number | null;
  listeners: number | null;
  similarArtists: string[];
}

interface LastFmArtistInfoResponse {
  artist?: {
    bio?: { summary?: string };
    stats?: { playcount?: string; listeners?: string };
    similar?: { artist?: { name: string }[] };
  };
}

/**
 * Reads an artist's Last.fm bio, listener counts and similar artists.
 *
 * @param name - The artist name.
 * @returns The info, or `null` when no API key is configured or Last.fm does
 *   not know the artist.
 * @throws {UpstreamUnavailableError} when Last.fm did not answer.
 */
export async function fetchLastFmArtistInfo(name: string): Promise<LastFmArtistInfoResult | null> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return null;

  const res = await fetchWithTimeout(
    `${API_BASE}/?method=artist.getInfo&artist=${encodeURIComponent(name)}&api_key=${encodeURIComponent(apiKey)}&format=json`,
    {},
    TIMEOUT_MS,
  );
  const data = await readLastFmJson<LastFmArtistInfoResponse>(res, "artist.getInfo");
  const artist = data?.artist;
  if (!artist) return null;

  return {
    bioSummary: extractBioSummary(artist.bio?.summary ?? null),
    scrobbles: artist.stats?.playcount ? parseInt(artist.stats.playcount, 10) : null,
    listeners: artist.stats?.listeners ? parseInt(artist.stats.listeners, 10) : null,
    similarArtists: (artist.similar?.artist ?? []).slice(0, 5).map((a) => a.name),
  };
}

function collectReadableText(node: DefaultTreeAdapterTypes.Node, chunks: string[]): void {
  if (node.nodeName === "#text" && "value" in node) {
    chunks.push(node.value);
    return;
  }

  if ("tagName" in node) {
    const elementName = node.tagName.toLowerCase();
    if (node.namespaceURI !== HTML_NAMESPACE || DISCARDED_ELEMENT_NAMES.has(elementName)) return;

    const separatesText = BLOCK_ELEMENT_NAMES.has(elementName);
    if (separatesText) chunks.push(" ");
    for (const child of node.childNodes) collectReadableText(child, chunks);
    if (separatesText) chunks.push(" ");
    return;
  }

  if ("childNodes" in node) {
    for (const child of node.childNodes) collectReadableText(child, chunks);
  }
}

function collapseWhitespace(value: string): string {
  let result = "";
  let separatorPending = false;

  for (const character of value) {
    if (character.trim().length === 0) {
      separatorPending = result.length > 0;
      continue;
    }
    if (separatorPending) result += " ";
    result += character;
    separatorPending = false;
  }

  return result;
}

function parsePlainTextFragment(value: string): string {
  const chunks: string[] = [];
  collectReadableText(parseFragment(value), chunks);
  return collapseWhitespace(chunks.join(""));
}

/**
 * Last.fm controls this HTML fragment, while profile consumers require a
 * plain-text contract. Parsing once removes active nodes and attributes;
 * parsing the extracted text again prevents entity-encoded markup from
 * becoming executable if a later rendering boundary interprets the value.
 */
function extractBioSummary(raw: string | null): string | null {
  if (!raw) return null;
  const decodedText = parsePlainTextFragment(raw);
  if (!decodedText) return null;
  return parsePlainTextFragment(decodedText) || null;
}

/**
 * @file Renders the picture, the PDF and the YouTube video.
 *
 * All three carry an address the page wrote, so all three check it before it
 * reaches an attribute. A picture and a PDF may point anywhere the reader can
 * already go, which is this site or an https address. A video points nowhere at
 * all until a reader starts it: the identifier is read out of whatever was
 * written and the embed address is then built here, from a host this file
 * names, so nothing a page writes decides where the frame loads from.
 */

import {
  IMAGE_SHORTCODE,
  MEDIA_DEFAULT_ASPECT,
  PDF_SHORTCODE,
  parseShortcodes,
  readShortcodeAt,
  type ShortcodeDefinition,
  type ShortcodeParamValue,
  YOUTUBE_SHORTCODE,
} from "@musiccloud/shared";
import type { MarkedExtension, Tokens } from "marked";

/** Where an embedded video is loaded from, whatever the page wrote. */
const YOUTUBE_EMBED_ORIGIN = "https://www.youtube-nocookie.com/embed/";

/** What a YouTube identifier looks like. Eleven characters, and never a path. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The addresses a video may be named by, each one holding the identifier. */
const YOUTUBE_ID_PATTERNS = [
  /[?&]v=([A-Za-z0-9_-]{11})/,
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
  /youtube(?:-nocookie)?\.com\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/,
];

/** An address a page may point at: this site, or somewhere reachable over https. */
const SAFE_TARGET = /^(?:\/[^/\\]|https:\/\/)/;

/** What the label on a PDF card reads when the page names nothing. */
const PDF_DEFAULT_LABEL = "Open the PDF";

interface McImageToken extends Tokens.Generic {
  type: "mcImage";
  src: string;
  alt: string;
  caption: string;
  width: number | null;
  height: number | null;
}

interface McPdfToken extends Tokens.Generic {
  type: "mcPdf";
  href: string;
  title: string;
  label: string;
}

interface McYouTubeToken extends Tokens.Generic {
  type: "mcYouTube";
  videoId: string;
  title: string;
  caption: string;
  aspect: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

/**
 * Reads one media shortcode, if one begins here.
 *
 * @param source - What marked is offering, from the current position.
 * @param definition - Which of the three to look for.
 * @returns The raw source, the address after the colon, and the resolved
 *   parameters, or `null` when the source does not begin with that shortcode or
 *   names no address.
 */
function readMediaSource(
  source: string,
  definition: ShortcodeDefinition,
): { raw: string; target: string; params: Record<string, ShortcodeParamValue> } | null {
  const node = readShortcodeAt(source, 0);
  if (!node || node.token !== definition.token) return null;

  const [parsed] = parseShortcodes(node.source.raw, [definition]);
  const target = parsed?.target?.trim();
  if (!target) return null;

  return { raw: node.source.raw, target, params: parsed?.params ?? {} };
}

/**
 * A string parameter, or what stands in for it.
 *
 * @param value - What the parser handed back.
 * @param fallback - What holds when the page named nothing.
 * @returns The text, trimmed.
 */
function text(value: ShortcodeParamValue | undefined, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * An integer parameter, or nothing.
 *
 * @param value - What the parser handed back, already inside its declared
 *   bounds.
 * @returns The figure, or `null` where the page named none.
 */
function measurement(value: ShortcodeParamValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * The YouTube identifier a page named, however it named it.
 *
 * @param target - What stood after the colon.
 * @returns The eleven characters, or `null` when nothing in there is one.
 */
function readVideoId(target: string): string | null {
  if (YOUTUBE_ID.test(target)) return target;
  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const found = target.match(pattern)?.[1];
    if (found) return found;
  }
  return null;
}

/**
 * A ratio as CSS.
 *
 * The page names a shape as `16:9`, which is how a reader would say it, and
 * `aspect-ratio` wants the same two figures with a solidus between them.
 *
 * @param aspect - The ratio the page named, already checked by the parser.
 * @returns The declaration's value.
 */
function aspectRatio(aspect: ShortcodeParamValue | undefined): string {
  if (typeof aspect !== "string") return MEDIA_DEFAULT_ASPECT;
  const [width, height] = aspect.split(":");
  return width && height ? `${width} / ${height}` : MEDIA_DEFAULT_ASPECT;
}

/**
 * The three media shortcodes as a marked extension.
 *
 * @returns The extension, ready to register.
 */
export function createMediaExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: "mcImage",
        level: "block",
        start(source: string) {
          return source.match(/\[\[image:/)?.index;
        },
        tokenizer(source: string) {
          const read = readMediaSource(source, IMAGE_SHORTCODE);
          if (!read || !SAFE_TARGET.test(read.target)) return;

          const caption = text(read.params.caption);
          return {
            type: "mcImage",
            raw: read.raw,
            src: read.target,
            // A picture with a caption and no alternative text is described by
            // its caption, which is better than being described twice or not at
            // all.
            alt: text(read.params.alt, caption),
            caption,
            width: measurement(read.params.width),
            height: measurement(read.params.height),
          } satisfies McImageToken;
        },
        renderer(token) {
          const image = token as McImageToken;
          const width = image.width === null ? "" : ` width="${image.width}"`;
          const height = image.height === null ? "" : ` height="${image.height}"`;
          const picture = `<img class="mc-figure__image" src="${escapeHtmlAttribute(image.src)}" alt="${escapeHtmlAttribute(image.alt)}"${width}${height}>`;
          // A picture with a caption is a figure, which is the element that
          // says the two belong together. One without a caption is not, so it
          // gets a plain container and no empty `figcaption`.
          if (!image.caption) return `<div class="mc-figure">${picture}</div>\n`;
          return `<figure class="mc-figure">${picture}<figcaption>${escapeHtml(image.caption)}</figcaption></figure>\n`;
        },
      },
      {
        name: "mcPdf",
        level: "block",
        start(source: string) {
          return source.match(/\[\[pdf:/)?.index;
        },
        tokenizer(source: string) {
          const read = readMediaSource(source, PDF_SHORTCODE);
          if (!read || !SAFE_TARGET.test(read.target)) return;

          return {
            type: "mcPdf",
            raw: read.raw,
            href: read.target,
            // The file's own name is what a reader would otherwise read off the
            // address bar, so it stands in for a heading nobody wrote.
            title: text(read.params.title, read.target.split("/").pop() ?? read.target),
            label: text(read.params.label, PDF_DEFAULT_LABEL),
          } satisfies McPdfToken;
        },
        renderer(token) {
          const pdf = token as McPdfToken;
          return [
            '<div class="mc-pdf">',
            `<p class="mc-pdf__title">${escapeHtml(pdf.title)}</p>`,
            `<a class="mc-pdf__link" href="${escapeHtmlAttribute(pdf.href)}" rel="noopener noreferrer">${escapeHtml(pdf.label)}</a>`,
            "</div>\n",
          ].join("");
        },
      },
      {
        name: "mcYouTube",
        level: "block",
        start(source: string) {
          return source.match(/\[\[youtube:/)?.index;
        },
        tokenizer(source: string) {
          const read = readMediaSource(source, YOUTUBE_SHORTCODE);
          if (!read) return;

          const videoId = readVideoId(read.target);
          if (!videoId) return;

          return {
            type: "mcYouTube",
            raw: read.raw,
            videoId,
            title: text(read.params.title),
            caption: text(read.params.caption),
            aspect: aspectRatio(read.params.aspect),
          } satisfies McYouTubeToken;
        },
        renderer(token) {
          const video = token as McYouTubeToken;
          // A link rather than a frame. The portal swaps it for the frame when
          // a reader clicks it, so nothing reaches YouTube for anybody who
          // never plays the video, and the sanitizer never has to admit an
          // iframe from a page.
          const heading = video.title ? `<p class="mc-video__title">${escapeHtml(video.title)}</p>` : "";
          const caption = video.caption ? `<figcaption>${escapeHtml(video.caption)}</figcaption>` : "";
          const address = `${YOUTUBE_EMBED_ORIGIN}${video.videoId}`;
          return [
            '<figure class="mc-video">',
            heading,
            `<a class="mc-video__link" style="aspect-ratio:${video.aspect}" href="${escapeHtmlAttribute(address)}" rel="noopener noreferrer">Play the video</a>`,
            caption,
            "</figure>\n",
          ].join("");
        },
      },
    ],
  };
}

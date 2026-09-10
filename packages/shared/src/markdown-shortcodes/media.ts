/**
 * @file The three shortcodes that point at something outside the text.
 *
 * Each one carries its target after a colon, as in `[[image:/assets/key.png]]`,
 * which is what sets them apart from everything else in the registry. Markdown
 * can already link an image; what it cannot do is give one a caption, a size,
 * or an aspect ratio, and that is what these are for.
 */

import { ContentContext } from "../content-context.js";
import { ShortcodeToken } from "./tokens.js";
import {
  type ShortcodeDefinition,
  ShortcodeParamType,
  ShortcodePlacement,
  ShortcodeRenderMode,
  ShortcodeSyntax,
  ShortcodeTargetRule,
} from "./types.js";

/**
 * Every content surface renders these.
 *
 * The site and the portal both import the shared stylesheet that arranges this
 * markup, so a page written on either side renders the same way. What differs
 * is the material each surface declares for it.
 */
const EVERY_CONTENT_CONTEXT = ContentContext.Frontend | ContentContext.DeveloperPortal;

/**
 * Where an embedded video is loaded from, whatever a page wrote.
 *
 * One answer, read by the renderer that builds the address and by the content
 * policy that has to permit that frame. Two would drift, and the drift would
 * arrive as a video that renders and then refuses to load.
 *
 * The nocookie host is the one YouTube offers for exactly this, and a reader
 * reaches it only after starting the video.
 */
export const YOUTUBE_EMBED_HOST = "https://www.youtube-nocookie.com";

/** Where a video's frame is loaded from, with the identifier appended. */
export const YOUTUBE_EMBED_PREFIX = `${YOUTUBE_EMBED_HOST}/embed/`;

/**
 * What the browser lets a video frame do.
 *
 * `allow-same-origin` is about YouTube's own origin rather than ours, because
 * the frame is loaded from theirs, so it lets their player reach its own storage
 * and nothing of this site's. Everything left out is left out on purpose: a
 * video cannot navigate the page it stands in, submit a form, or open a window.
 */
export const YOUTUBE_FRAME_SANDBOX = "allow-scripts allow-same-origin allow-presentation";

/** The features a video frame may use, named for the `allow` attribute. */
export const YOUTUBE_FRAME_PERMISSIONS = "accelerometer; autoplay; encrypted-media; picture-in-picture";

/** The largest picture a page may ask for, in either direction. */
export const MAX_MEDIA_EDGE = 4096;

/**
 * The shape an embedded video is given when the page names none.
 *
 * Written as CSS rather than as two numbers, because that is what reaches the
 * `aspect-ratio` property and splitting it would mean putting it back together
 * in the renderer.
 */
export const MEDIA_DEFAULT_ASPECT = "16 / 9";

/** The aspect ratios a page may name, each one a shape rather than a measurement. */
export const MediaAspect = {
  Widescreen: "16:9",
  Classic: "4:3",
  Square: "1:1",
  Portrait: "9:16",
} as const;

/** One of the ratios in {@link MediaAspect}. */
export type MediaAspectValue = (typeof MediaAspect)[keyof typeof MediaAspect];

/** A picture, optionally with a caption and a size of its own. */
export const IMAGE_SHORTCODE = {
  token: ShortcodeToken.Image,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Required,
  placement: ShortcodePlacement.Block,
  label: "Picture",
  description:
    "Shows a picture, optionally with a caption underneath and a size of its own. The target is the address it is served from, either a path on this site or a full https address. Without a size it takes the width of the column and keeps its own proportions.",
  examples: [
    "[[image:/assets/console.png]]",
    '[[image:/assets/console.png alt="The console" caption="Your key, once"]]',
  ],
  allowedContextMask: EVERY_CONTENT_CONTEXT,
  params: [
    {
      name: "alt",
      type: ShortcodeParamType.String,
      defaultLabel: "the caption, where there is one, and otherwise nothing",
      label: "What the picture shows, for anybody who cannot see it",
    },
    {
      name: "caption",
      type: ShortcodeParamType.String,
      defaultLabel: "no caption",
      label: "Caption underneath the picture",
    },
    {
      name: "width",
      type: ShortcodeParamType.Integer,
      min: 1,
      max: MAX_MEDIA_EDGE,
      defaultLabel: "the width of the column",
      label: "Width in pixels",
    },
    {
      name: "height",
      type: ShortcodeParamType.Integer,
      min: 1,
      max: MAX_MEDIA_EDGE,
      defaultLabel: "whatever keeps the picture's own proportions",
      label: "Height in pixels",
    },
  ],
} as const satisfies ShortcodeDefinition;

/** A PDF, linked as a card a reader can see before they open it. */
export const PDF_SHORTCODE = {
  token: ShortcodeToken.Pdf,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Required,
  placement: ShortcodePlacement.Block,
  label: "PDF",
  description:
    "Links a PDF as a card rather than as a bare link, so a reader can see what it is before they open it. The target is the address the file is served from. It opens in a tab of its own.",
  examples: ["[[pdf:/assets/terms.pdf]]", '[[pdf:/assets/terms.pdf title="Terms of use" label="Read the terms"]]'],
  allowedContextMask: EVERY_CONTENT_CONTEXT,
  params: [
    {
      name: "title",
      type: ShortcodeParamType.String,
      defaultLabel: "the file's own name",
      label: "Heading on the card",
    },
    {
      name: "label",
      type: ShortcodeParamType.String,
      defaultLabel: "Open the PDF",
      label: "What the link underneath the heading reads",
    },
  ],
} as const satisfies ShortcodeDefinition;

/** A YouTube video, embedded in the page. */
export const YOUTUBE_SHORTCODE = {
  token: ShortcodeToken.YouTube,
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Html,
  target: ShortcodeTargetRule.Required,
  placement: ShortcodePlacement.Block,
  label: "YouTube",
  description:
    "Embeds a YouTube video. The target is the address of the video or the identifier on its own, so a watch address, a youtu.be address and a bare identifier all work. Nothing loads from YouTube until a reader starts the video.",
  examples: [
    "[[youtube:dQw4w9WgXcQ]]",
    '[[youtube:https://youtu.be/dQw4w9WgXcQ caption="The whole thing in three minutes"]]',
  ],
  allowedContextMask: EVERY_CONTENT_CONTEXT,
  params: [
    {
      name: "title",
      type: ShortcodeParamType.String,
      defaultLabel: "no heading",
      label: "Heading above the video",
    },
    {
      name: "caption",
      type: ShortcodeParamType.String,
      defaultLabel: "no caption",
      label: "Caption underneath the video",
    },
    {
      name: "aspect",
      type: ShortcodeParamType.Enum,
      values: Object.values(MediaAspect),
      defaultValue: MediaAspect.Widescreen,
      label: "The shape the video is given",
    },
  ],
} as const satisfies ShortcodeDefinition;

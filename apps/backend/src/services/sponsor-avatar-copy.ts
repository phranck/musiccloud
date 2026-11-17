/**
 * @file Turns the address of a sponsor's picture into a copy musiccloud stores.
 *
 * This is the step lmaa.space does not have, because lmaa keeps the foreign
 * address. The picture is downloaded once through the guarded outbound fetch,
 * decoded, cut to a square and encoded again as PNG, so what is stored and
 * served is always an image this server wrote and never the bytes a foreign
 * host chose to send.
 */

import { Jimp } from "jimp";

import { readBodyWithLimit } from "../lib/http-body.js";
import { log } from "../lib/infra/logger.js";
import { fetchExternalResource, hostForLog, parseImageDimensions } from "../lib/preview-image.js";
import { storeSponsorAvatar } from "./sponsor-avatars.js";

/** How long downloading the picture may take, redirects and body included. */
const DOWNLOAD_TIMEOUT_MS = 10_000;

/**
 * The largest picture downloaded, in bytes. A profile picture is rarely past a
 * megabyte; the budget leaves room for an uncompressed one and stops a host
 * that keeps sending.
 */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/**
 * The longest side a picture may have before it is decoded, in pixels.
 * Decoding allocates four bytes per pixel, so a small file that declares a
 * huge canvas is refused from its header before it can take the memory.
 */
const MAX_SOURCE_SIDE_PX = 4096;

/**
 * The side of the stored square, in pixels. The dashboard shows the picture at
 * 96 CSS pixels, so this is sharp at two device pixels per CSS pixel and more.
 */
const AVATAR_SIDE_PX = 256;

/** The media type every stored copy is encoded in. */
const STORED_MIME = "image/png";

/** The media type prefix a downloaded picture must declare. */
const IMAGE_MIME_PREFIX = "image/";

/** The one image type refused, because it is a document that can carry script. */
const SVG_MIME = "image/svg+xml";

/** The component name every deviation of this module is logged under. */
const LOG_COMPONENT = "SponsorAvatarCopy";
/** The error code of a recoverable deviation, as other backend services log it. */
const LOG_ERROR_CODE = "MC-SYS-0001";

/**
 * Downloads a picture, re-encodes it as a square PNG and stores it.
 *
 * Anything that is not a raster image Jimp can decode is refused: an SVG, a
 * WebP, an HTML page served under an image address, a body past
 * {@link MAX_SOURCE_BYTES}, or a canvas past {@link MAX_SOURCE_SIDE_PX}. Each
 * refusal is logged with the host and the reason and answered with `null`, so
 * the caller tells the operator that no picture was found.
 *
 * @param pictureUrl - A public `https` address the lookup found.
 * @returns The stored copy's id, or `null` when the picture could not be copied.
 */
export async function copySponsorAvatar(pictureUrl: string): Promise<string | null> {
  const result = await fetchExternalResource(
    pictureUrl,
    { headers: { Accept: `${IMAGE_MIME_PREFIX}*` } },
    DOWNLOAD_TIMEOUT_MS,
  );
  if (!result) return null;

  const { response } = result;
  const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!response.ok || !mediaType.startsWith(IMAGE_MIME_PREFIX) || mediaType === SVG_MIME) {
    await response.body?.cancel();
    return refuse(pictureUrl, "not_a_raster_image");
  }

  const bytes = await readBodyWithLimit(response, MAX_SOURCE_BYTES);
  if (!bytes) return refuse(pictureUrl, "too_large");

  const dimensions = parseImageDimensions(bytes);
  if (dimensions && Math.max(dimensions.width, dimensions.height) > MAX_SOURCE_SIDE_PX) {
    return refuse(pictureUrl, "canvas_too_large");
  }

  try {
    const image = await Jimp.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    image.cover({ w: AVATAR_SIDE_PX, h: AVATAR_SIDE_PX });
    const png = await image.getBuffer(STORED_MIME);
    return await storeSponsorAvatar(png);
  } catch (error) {
    return refuse(pictureUrl, "undecodable", error);
  }
}

/**
 * Logs why a picture was not copied, with its host and never its bytes.
 *
 * @param pictureUrl - The address that was asked.
 * @param outcome - The reason, as a stable token a log search can filter on.
 * @param error - The decoder's error, where there is one.
 * @returns `null`, so a refusal reads as one line at the call site.
 */
function refuse(pictureUrl: string, outcome: string, error?: unknown): null {
  log.deviation(
    {
      component: LOG_COMPONENT,
      errorCode: LOG_ERROR_CODE,
      operation: "sponsor_avatar_copy",
      outcome,
      host: hostForLog(pictureUrl),
    },
    error,
  );
  return null;
}

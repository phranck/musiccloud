/**
 * @file The rule for an image a route receives as a `data:` URL.
 *
 * The developer avatar, the admin user avatar and the admin email asset all
 * take an image this way, and all three apply this one rule, so hardening it
 * reaches every one of them. The accepted types and the size cap come from
 * `@musiccloud/shared`, where the portal and the dashboard read them too.
 */
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MIME_TYPES, type ImageUploadMimeType } from "@musiccloud/shared";

/**
 * The request body cap for a route that receives an image as a `data:` URL.
 *
 * Base64 needs four characters for every three bytes, so a body carrying an
 * image of {@link IMAGE_UPLOAD_MAX_BYTES} is about a third larger than the
 * image. The cap leaves room for that and for the rest of the JSON body.
 */
export const IMAGE_UPLOAD_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

/** Why {@link parseImageDataUrl} refused an upload. Each route maps these to its own response. */
export const ImageUploadRefusal = {
  /** Not a base64 `data:` URL of one of the accepted image types. */
  UnsupportedType: "unsupported_type",
  /** Larger than {@link IMAGE_UPLOAD_MAX_BYTES} once decoded. */
  TooLarge: "too_large",
} as const;

/** One of {@link ImageUploadRefusal}. */
export type ImageUploadRefusalValue = (typeof ImageUploadRefusal)[keyof typeof ImageUploadRefusal];

/** What {@link parseImageDataUrl} found. */
export type ParsedImageDataUrl =
  | { ok: true; mimeType: ImageUploadMimeType; base64: string }
  | { ok: false; reason: ImageUploadRefusalValue };

/** The prefix of a base64 `data:` URL, capturing its media type. */
const BASE64_DATA_URL_PREFIX = /^data:([^;,]+);base64,/;

/**
 * Whether a media type is one an upload may have.
 *
 * @param mimeType - The media type the `data:` URL names.
 * @returns Whether it is one of {@link IMAGE_UPLOAD_MIME_TYPES}.
 */
function isImageUploadMimeType(mimeType: string): mimeType is ImageUploadMimeType {
  return (IMAGE_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Checks an image a request carries as a `data:` URL.
 *
 * The type is read from the URL's prefix and has to be one of
 * {@link IMAGE_UPLOAD_MIME_TYPES}, exactly and in lower case. The size is the
 * exact length the base64 decodes to, which `Buffer.byteLength` computes
 * without decoding, so an image of exactly {@link IMAGE_UPLOAD_MAX_BYTES} is
 * accepted and one byte more is not.
 *
 * @param dataUrl - The value from the request body.
 * @returns The media type and the base64 payload, or why the upload is refused.
 */
export function parseImageDataUrl(dataUrl: string): ParsedImageDataUrl {
  const prefix = BASE64_DATA_URL_PREFIX.exec(dataUrl);
  const mimeType = prefix?.[1];
  if (!prefix || mimeType === undefined || !isImageUploadMimeType(mimeType)) {
    return { ok: false, reason: ImageUploadRefusal.UnsupportedType };
  }

  const base64 = dataUrl.slice(prefix[0].length);
  if (Buffer.byteLength(base64, "base64") > IMAGE_UPLOAD_MAX_BYTES) {
    return { ok: false, reason: ImageUploadRefusal.TooLarge };
  }
  return { ok: true, mimeType, base64 };
}

/**
 * The `error` string the admin avatar and the admin email asset routes answer
 * a refused upload with. The two routes share their response shape, and the
 * developer portal's route answers with its own envelope.
 */
export const ADMIN_IMAGE_REFUSAL_ERRORS: Record<ImageUploadRefusalValue, string> = {
  [ImageUploadRefusal.UnsupportedType]: "Only JPEG, PNG or WebP",
  [ImageUploadRefusal.TooLarge]: `File too large (max ${IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024}MB)`,
};

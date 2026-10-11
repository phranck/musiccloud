/**
 * @file The lengths, ceilings and accepted types that the backend enforces
 * and that the developer portal and the admin dashboard check before sending.
 *
 * A limit stated in two places is two limits: the field stops accepting input
 * at one number whilst the route refuses at another, and nobody notices until a
 * value falls between them. Each one is therefore stated here once, and every
 * side reads it from here.
 */

/**
 * How long a developer's display name may be.
 *
 * The name is what the portal calls the developer, so it is theirs to choose;
 * the bound exists so it fits the places it is shown rather than to restrict
 * what it says.
 */
export const MAX_DISPLAY_NAME_LENGTH = 200;

/**
 * The shortest password an account may have, on the developer portal and on the
 * admin surface alike.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * The longest password an account may have.
 *
 * The bound keeps a request body finite rather than keeping a password short.
 * Passwords are hashed with bcrypt, which reads the first 72 bytes and ignores
 * the rest, so a password longer than that is no harder to guess than its first
 * 72 bytes.
 */
export const PASSWORD_MAX_LENGTH = 256;

/**
 * Checks a password a request wants to set against
 * {@link PASSWORD_MIN_LENGTH} and {@link PASSWORD_MAX_LENGTH}.
 *
 * Every route that sets a password asks this one question, on the developer
 * portal and on the admin surface alike, so no path can store a password the
 * others would refuse. The value comes straight from a request body, so
 * anything that is not a string is refused as well rather than reaching the
 * hash.
 *
 * @param password - The value the request carried.
 * @returns The message to answer with when the value is refused, or `null`
 *   when it may be stored.
 */
export function validatePasswordLength(password: unknown): string | null {
  if (
    typeof password === "string" &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  ) {
    return null;
  }
  return `password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`;
}

/**
 * The image types an upload may have: an avatar on either surface, or an image
 * for an email.
 *
 * SVG is not among them on purpose, because an SVG can carry script, and an
 * uploaded email image is served back publicly with the type it was stored
 * with.
 */
export const IMAGE_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** One of {@link IMAGE_UPLOAD_MIME_TYPES}. */
export type ImageUploadMimeType = (typeof IMAGE_UPLOAD_MIME_TYPES)[number];

/** {@link IMAGE_UPLOAD_MIME_TYPES} as a file input's `accept` attribute expects it. */
export const IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_MIME_TYPES.join(",");

/** What an uploaded image may weigh once decoded, which is 5 MB. */
export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

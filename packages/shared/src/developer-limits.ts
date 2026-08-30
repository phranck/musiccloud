/**
 * @file The lengths and ceilings the developer portal and the backend both
 * enforce.
 *
 * A limit stated in two places is two limits: the field stops accepting input
 * at one number whilst the route refuses at another, and nobody notices until a
 * value falls between them. Each one is therefore stated here once, and both
 * sides read it from here.
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

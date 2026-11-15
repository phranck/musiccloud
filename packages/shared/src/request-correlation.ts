/** Header carrying the opaque correlation id between frontend SSR and the backend share read. */
export const CORRELATION_ID_HEADER = "x-mc-correlation-id";

/** Maximum accepted correlation-id length, which comfortably covers a UUID. */
export const CORRELATION_ID_MAX_LENGTH = 64;

/** Bounded ASCII token accepted for log correlation. It carries no identity or authorization meaning. */
export const CORRELATION_ID_PATTERN = new RegExp(`^[A-Za-z0-9-]{1,${CORRELATION_ID_MAX_LENGTH}}$`);

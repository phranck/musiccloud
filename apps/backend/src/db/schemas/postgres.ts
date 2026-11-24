/**
 * The Drizzle schema of the Postgres database, one file per domain under `domains/`.
 *
 * `drizzle.config.postgres.ts` and every importer read the schema from this file, so it
 * re-exports every table of every domain. `domains/column-types.ts` holds column helpers
 * and no tables, so it is not re-exported.
 */

export * from "./domains/admin-users.js";
export * from "./domains/album-catalog.js";
export * from "./domains/app-telemetry.js";
export * from "./domains/artist-cache.js";
export * from "./domains/artist-credits.js";
export * from "./domains/artist-identity.js";
export * from "./domains/artist-profiles.js";
export * from "./domains/bank.js";
export * from "./domains/billing.js";
export * from "./domains/content-navigation.js";
export * from "./domains/crawl.js";
export * from "./domains/creative-commons.js";
export * from "./domains/developer-accounts.js";
export * from "./domains/email.js";
export * from "./domains/media-caches.js";
export * from "./domains/site-settings.js";
export * from "./domains/sponsoring.js";
export * from "./domains/track-catalog.js";
export * from "./domains/vinyl-layouts.js";

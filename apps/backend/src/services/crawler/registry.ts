/**
 * @file Crawler-source registry.
 *
 * Mirrors the build-time static-array pattern from `services/plugins/registry.ts`:
 * `SOURCES` is a plain array literal, new sources are added by appending
 * the imported source object, and removing one means deleting an import line
 * (the compiler then flags any code that still referenced the source).
 *
 * No runtime `register(...)` side-effect imports — the convention in this
 * project is build-time array literal, so the heartbeat can synchronously
 * answer "what should I tick?" with a list lookup.
 */

import { deezerChartsSource } from "./sources/deezer-charts.js";
import type { CrawlerSource } from "./types.js";

/**
 * Static, build-time list of all crawler sources. Heartbeat ticks every
 * source whose `crawl_state.next_run_at` has elapsed (and `enabled = true`,
 * and `running_since IS NULL`). Adding a new source: import it, append it.
 */
export const SOURCES: readonly CrawlerSource[] = [deezerChartsSource];

/**
 * Lookup by id. Returns `null` when no source with that id is registered;
 * the heartbeat treats unknown sources as "ignore this `crawl_state` row"
 * (the row may persist from a previous deploy that registered the source).
 */
export function getCrawlerSource(id: string): CrawlerSource | null {
  return SOURCES.find((s) => s.id === id) ?? null;
}

/** Sync read of all registered sources. Used by the seeder + admin views. */
export function listCrawlerSources(): readonly CrawlerSource[] {
  return SOURCES;
}

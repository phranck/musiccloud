import { VALID_SERVICE_IDS } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { ALBUM_PREVIEW_URL_SELECT, TRACK_PREVIEW_URL_SELECT } from "../postgres-shared.js";

/**
 * Reads the service ids a preview `SELECT` fragment admits from its
 * `service IN (...)` predicate.
 *
 * @param fragment - One of the preview `SELECT` fragments.
 * @returns The quoted ids of the predicate, unquoted and sorted, or an empty
 *   list when the fragment has no such predicate.
 */
function admittedServices(fragment: string): string[] {
  const list = /\.service IN \(([^)]*)\)/.exec(fragment)?.[1];
  if (!list) return [];
  return list
    .split(",")
    .map((entry) => entry.trim().replace(/^'|'$/g, ""))
    .sort();
}

/**
 * A preview row of a removed service stays in the database, and its URL points
 * at a host nobody serves any more. The fragments that pick a share page's
 * preview therefore admit only the services this build knows.
 */
describe("preview SELECT fragments", () => {
  it.each([
    ["track", TRACK_PREVIEW_URL_SELECT],
    ["album", ALBUM_PREVIEW_URL_SELECT],
  ])("admit exactly the known services for a %s", (_kind, fragment) => {
    expect(admittedServices(fragment)).toEqual([...VALID_SERVICE_IDS].sort());
  });
});

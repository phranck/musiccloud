/**
 * A service saying that a track, album or artist does not exist is a missing
 * item, not an outage, so the resolve operations answer it with 404 as their
 * schema documents. The codes come from the helpers every adapter uses, for
 * every service there is.
 */
import { getErrorEntry, ResourceKind, Service } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { serviceHttpError, serviceNotFoundError } from "../lib/resolve/service-errors.js";

const SERVICES = Object.values(Service);

describe("per-service error status", () => {
  it.each(SERVICES)("answers 404 when %s has no such item", (service) => {
    expect(getErrorEntry(serviceNotFoundError(service, ResourceKind.Album, "missing").code).httpStatus).toBe(404);
    expect(getErrorEntry(serviceHttpError(service, 404, ResourceKind.Track, "missing").code).httpStatus).toBe(404);
  });

  it.each(SERVICES)("keeps 503 when %s fails for another reason", (service) => {
    expect(getErrorEntry(serviceHttpError(service, 500, ResourceKind.Track, "id").code).httpStatus).toBe(503);
    expect(getErrorEntry(serviceHttpError(service, 401, ResourceKind.Track, "id").code).httpStatus).toBe(503);
  });
});

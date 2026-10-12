/**
 * A service saying that a track, album or artist does not exist is a missing
 * item, not an outage, so the resolve operations answer it with 404 as their
 * schema documents. The codes come from the helpers every adapter uses, for
 * every service there is.
 */
import { ADAPTER_ERROR_CODE_PREFIX, getErrorEntry, getPlatformLabel, ResourceKind, Service } from "@musiccloud/shared";
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

describe("per-service error names and codes", () => {
  /** The statuses the helper turns into distinct codes. */
  const STATUSES = [401, 404, 429, 500];

  it.each(SERVICES)("names %s by its platform label", (service) => {
    const label = getPlatformLabel(service);

    for (const status of STATUSES) {
      expect(serviceHttpError(service, status, ResourceKind.Track, "id").message.startsWith(`${label} `)).toBe(true);
    }
    expect(serviceNotFoundError(service, ResourceKind.Track, "id").message.startsWith(`${label}: `)).toBe(true);
  });

  it("gives every service a prefix", () => {
    for (const service of SERVICES) {
      expect(ADAPTER_ERROR_CODE_PREFIX[service]).toMatch(/^[1-9]\d?$/);
    }
  });

  /** A code a user quotes has to name one service and one failure, or support decodes the wrong one. */
  it("gives every service and status a code of its own", () => {
    const codes = SERVICES.flatMap((service) =>
      STATUSES.map((status) => serviceHttpError(service, status, ResourceKind.Track, "id").code),
    );

    expect(new Set(codes).size).toBe(codes.length);
  });
});

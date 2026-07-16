import { ENDPOINTS } from "@musiccloud/shared";

import { backendUrl, internalHeaders } from "./api";

const AVAILABILITY_TIMEOUT_MS = 2_000;

export interface PortalAvailability {
  maintenance: boolean;
  public: boolean;
}

/**
 * Reads the persisted portal availability through the backend's internal API.
 * A failed or malformed read deliberately returns `null`, allowing middleware
 * to fail closed without exposing an unfinished portal.
 */
export async function getPortalAvailability(): Promise<PortalAvailability | null> {
  try {
    const response = await fetch(backendUrl(ENDPOINTS.internal.developer.portalAvailability), {
      headers: internalHeaders(),
      signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
    });

    if (!response.ok) {
      logAvailabilityDeviation({ reason: "unexpected_status", status: response.status });
      return null;
    }

    const payload: unknown = await response.json();
    if (!isPortalAvailability(payload)) {
      logAvailabilityDeviation({ reason: "invalid_payload" });
      return null;
    }

    return payload;
  } catch (error) {
    logAvailabilityDeviation({
      cause: error instanceof Error ? error.name : "UnknownError",
      reason: "request_failed",
    });
    return null;
  }
}

function isPortalAvailability(value: unknown): value is PortalAvailability {
  return (
    typeof value === "object" &&
    value !== null &&
    "public" in value &&
    "maintenance" in value &&
    typeof value.public === "boolean" &&
    typeof value.maintenance === "boolean"
  );
}

function logAvailabilityDeviation(fields: { cause?: string; reason: string; status?: number }): void {
  // Do not include response bodies, endpoint URLs, headers, or error messages:
  // all can contain deployment details or credentials. The event stays useful
  // for operators through its stable code and outcome.
  console.warn(
    JSON.stringify({
      errorCode: "MC-DEV-0001",
      operation: "developer_portal_availability_read",
      outcome: "fail_closed",
      ...fields,
    }),
  );
}

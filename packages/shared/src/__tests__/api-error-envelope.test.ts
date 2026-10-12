import { describe, expect, it } from "vitest";
import { createApiErrorBody, parseApiErrorResponse } from "../api.js";
import { ERROR_CODE_REGISTRY } from "../error-codes.js";

describe("parseApiErrorResponse", () => {
  it("returns the fields of a complete body", () => {
    expect(
      parseApiErrorResponse({
        error: "MC-RES-0001",
        message: "Gone. (MC-RES-0001)",
        errorId: "e-1",
        context: { kind: "track", limit: 3 },
      }),
    ).toEqual({
      error: "MC-RES-0001",
      message: "Gone. (MC-RES-0001)",
      errorId: "e-1",
      context: { kind: "track", limit: 3 },
    });
  });

  it("leaves out what is missing or of the wrong type, and an empty incident reference", () => {
    expect(parseApiErrorResponse({ error: 42, message: null, errorId: "", context: { ok: "yes", bad: [1] } })).toEqual({
      context: { ok: "yes" },
    });
  });

  it("reads nothing from a body that is not an object", () => {
    expect(parseApiErrorResponse("Bad Gateway")).toEqual({});
    expect(parseApiErrorResponse(null)).toEqual({});
  });
});

describe("createApiErrorBody", () => {
  it("renders the registry's sentence with the code and keeps the incident reference", () => {
    expect(createApiErrorBody("MC-REQ-0001", { errorId: "e-2" })).toEqual({
      error: "MC-REQ-0001",
      errorId: "e-2",
      message: `${ERROR_CODE_REGISTRY["MC-REQ-0001"].userMessage} (MC-REQ-0001)`,
    });
  });

  it("maps a legacy code and fills placeholders from the context it carries", () => {
    const body = createApiErrorBody("RATE_LIMITED", {
      errorId: "e-3",
      context: { limit: 10, windowSeconds: 60, retryAfterSeconds: 5 },
    });

    expect(body.error).toBe("MC-API-0003");
    expect(body.message).toBe(
      "Too many requests. You can make 10 requests per 60 seconds. Please try again in 5 seconds. (MC-API-0003)",
    );
    expect(body.context).toEqual({ limit: 10, windowSeconds: 60, retryAfterSeconds: 5 });
  });
});

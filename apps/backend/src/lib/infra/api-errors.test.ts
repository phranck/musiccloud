import { describe, expect, it } from "vitest";

import {
  classifyUnhandledError,
  createApiErrorResponse,
  normalizeApiErrorPayload,
  sanitizeErrorForLog,
} from "./api-errors.js";

describe("classifyUnhandledError", () => {
  it("maps PostgreSQL permission failures without exposing the raw message", () => {
    const result = classifyUnhandledError({ code: "42501", message: "permission denied for table secrets" });

    expect(result).toEqual({
      code: "MC-DB-0001",
      message: "The database permissions are invalid for this operation.",
      statusCode: 500,
    });
    expect(result.message).not.toContain("secrets");
  });

  it("distinguishes missing schema and unavailable database errors", () => {
    expect(classifyUnhandledError({ code: "42P01" })).toMatchObject({ code: "MC-DB-0002" });
    expect(classifyUnhandledError({ code: "08006" })).toMatchObject({ code: "MC-DB-0003", statusCode: 503 });
  });

  it("maps Fastify validation failures to a request error", () => {
    expect(classifyUnhandledError({ statusCode: 400, validation: [{}] })).toEqual({
      code: "MC-REQ-0001",
      message: "The request did not match the expected format.",
      statusCode: 400,
    });
  });

  it("preserves Fastify body-limit status while assigning a safe request code", () => {
    expect(classifyUnhandledError({ code: "FST_ERR_CTP_BODY_TOO_LARGE", statusCode: 413 })).toEqual({
      code: "MC-REQ-0001",
      message: "The request did not match the expected format.",
      statusCode: 413,
    });
  });

  it("maps unknown exceptions to a safe system error", () => {
    expect(classifyUnhandledError(new Error("DATABASE_URL=postgresql://user:secret@host/db"))).toEqual({
      code: "MC-SYS-0001",
      message: "An unexpected server error occurred.",
      statusCode: 500,
    });
  });
});

describe("normalizeApiErrorPayload", () => {
  it("canonicalizes a legacy not-found response and keeps the incident id", () => {
    expect(
      normalizeApiErrorPayload(
        { error: "TRACK_NOT_FOUND", message: "No share exists for this ID." },
        404,
        "incident-123",
      ),
    ).toEqual({
      error: "MC-RES-0001",
      errorId: "incident-123",
      message: "No share exists for this ID. (MC-RES-0001)",
    });
  });

  it("assigns a canonical request code while preserving a route-authored safe message", () => {
    expect(
      normalizeApiErrorPayload(
        { error: "INVALID_REQUEST", message: "email is required.", context: { field: "email" } },
        400,
        "incident-456",
      ),
    ).toEqual({
      context: { field: "email" },
      error: "MC-REQ-0001",
      errorId: "incident-456",
      message: "email is required. (MC-REQ-0001)",
    });
  });

  it("uses a human-readable error field as the message when a legacy payload has no message", () => {
    expect(normalizeApiErrorPayload({ error: "No examples available" }, 404, "incident-789")).toEqual({
      error: "MC-RES-0003",
      errorId: "incident-789",
      message: "No examples available (MC-RES-0003)",
    });
  });
});

describe("createApiErrorResponse", () => {
  it("builds a canonical typed response with an incident id", () => {
    expect(
      createApiErrorResponse("TRACK_NOT_FOUND", {
        context: { shortId: "abc" },
        errorId: "incident-builder",
        overrideMessage: "No share exists.",
      }),
    ).toEqual({
      context: { shortId: "abc" },
      error: "MC-RES-0001",
      errorId: "incident-builder",
      message: "No share exists. (MC-RES-0001)",
    });
  });
});

describe("sanitizeErrorForLog", () => {
  it("redacts credentials, bearer tokens, and connection URLs", () => {
    const result = sanitizeErrorForLog(
      new Error("Bearer abc.def.ghi failed for postgresql://user:secret@prod.example/db"),
      false,
    );

    expect(result.message).not.toContain("abc.def.ghi");
    expect(result.message).not.toContain("secret");
    expect(result.message).toContain("[REDACTED]");
    expect(result).not.toHaveProperty("stack");
  });
});

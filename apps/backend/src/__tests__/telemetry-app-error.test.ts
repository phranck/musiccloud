import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn(async () => {});

vi.mock("../db/index.js", () => ({
  getRepository: vi.fn(async () => ({
    insertAppTelemetryEvent: insertMock,
  })),
}));

import { buildApp } from "../server.js";

const ENDPOINT = "/api/v1/telemetry/app-error";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    eventType: "resolve_error",
    eventTime: "2026-04-20T01:23:45Z",
    installId: "abcd-1234-efgh",
    appVersion: "1.2.3",
    buildNumber: "42",
    platform: "ios",
    osVersion: "iOS 18.3",
    deviceModel: "iPhone15,2",
    locale: "de-DE",
    sourceUrl: "https://music.apple.com/xx/album/???",
    service: "apple-music",
    errorKind: "RESOLVE_FAILED",
    httpStatus: 404,
    message: "Could not resolve URL",
    ...overrides,
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-telemetry";
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  insertMock.mockClear();
});

describe(`POST ${ENDPOINT}`, () => {
  it("accepts a valid body with 204 and persists the event", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      payload: validBody(),
    });
    expect(res.statusCode).toBe(204);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const [row] = insertMock.mock.calls[0];
    expect(row.eventType).toBe("resolve_error");
    expect(row.service).toBe("apple-music");
    expect(row.httpStatus).toBe(404);
    expect(row.eventTime).toBeInstanceOf(Date);
  });

  it("rejects a missing required field with 400", async () => {
    const body = validBody();
    delete (body as { installId?: string }).installId;
    const res = await app.inject({ method: "POST", url: ENDPOINT, payload: body });
    expect(res.statusCode).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown eventType with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      payload: validBody({ eventType: "panic" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a payload larger than the 8 KB body limit with 413", async () => {
    const big = "x".repeat(9 * 1024);
    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      payload: validBody({ message: big }),
    });
    expect(res.statusCode).toBe(413);
  });

  it("truncates an oversized message to ≤ 2000 chars before insert", async () => {
    const padded = "y".repeat(2_500);
    const res = await app.inject({
      method: "POST",
      url: ENDPOINT,
      payload: validBody({ message: padded }),
    });
    expect(res.statusCode).toBe(204);
    const [row] = insertMock.mock.calls[0];
    expect(row.message.length).toBe(2_000);
  });
});

import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseReadinessReport } from "../db/database-readiness.js";
import { buildApp } from "../server.js";

const FAILED_REPORT: DatabaseReadinessReport = {
  insufficientPrivileges: [{ privilege: "SELECT", table: "private_catalog" }],
  insufficientSequencePrivileges: [{ privilege: "USAGE", sequence: "private_sequence" }],
  missingMigrationHashes: ["sensitive-migration-hash"],
  missingSequences: ["private_missing_sequence"],
  missingTables: ["private_missing_table"],
  ok: false,
  ownerMismatches: [{ actualOwner: "unexpected_role", expectedOwner: "runtime_role", table: "private_owned_table" }],
};

let app: FastifyInstance | undefined;

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret-database-readiness";
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.restoreAllMocks();
});

describe("GET /health/db", () => {
  it("returns a safe error envelope and logs the detailed report once under the same errorId", async () => {
    const logLines: string[] = [];
    app = await buildApp({
      databaseReadiness: async () => FAILED_REPORT,
      logger: {
        level: "error",
        stream: { write: (line: string) => logLines.push(line) },
      },
    });

    const response = await app.inject({ method: "GET", url: "/health/db" });
    const body = response.json() as Record<string, unknown>;

    expect(response.statusCode).toBe(503);
    expect(body).toEqual({
      error: "MC-API-0001",
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: "Database readiness could not be confirmed. Please try again later. (MC-API-0001)",
    });
    for (const internalValue of [
      "private_catalog",
      "sensitive-migration-hash",
      "private_missing_table",
      "unexpected_role",
      "runtime_role",
      "private_owned_table",
    ]) {
      expect(response.body).not.toContain(internalValue);
    }

    const records = logLines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((record) => record.errorId === body.errorId);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      errorCode: "MC-API-0001",
      operation: "http_request",
      route: "/health/db",
      statusCode: 503,
      diagnostic: {
        operation: "database_readiness",
        outcome: "not_ready",
        report: FAILED_REPORT,
      },
    });
  });

  it("redacts a readiness exception from the correlated diagnostic", async () => {
    const logLines: string[] = [];
    app = await buildApp({
      databaseReadiness: async () => {
        throw new Error("postgresql://operator:secret@database.example/musiccloud is unavailable");
      },
      logger: {
        level: "error",
        stream: { write: (line: string) => logLines.push(line) },
      },
    });

    const response = await app.inject({ method: "GET", url: "/health/db" });
    const body = response.json() as { errorId: string };
    const record = logLines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.errorId === body.errorId);

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("operator");
    expect(response.body).not.toContain("secret");
    expect(JSON.stringify(record)).not.toContain("operator:secret");
    expect(record).toMatchObject({
      diagnostic: {
        cause: { message: expect.stringContaining("[REDACTED_DB_URL]") },
        operation: "database_readiness",
        outcome: "check_failed",
      },
    });
  });
});

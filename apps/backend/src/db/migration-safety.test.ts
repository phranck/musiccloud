import { describe, expect, it, vi } from "vitest";

import { assertSafeMigrationConnection, assertSafeMigrationIdentity } from "./migration-safety.js";

describe("assertSafeMigrationIdentity", () => {
  it("allows the local postgres role for local development", () => {
    expect(() =>
      assertSafeMigrationIdentity({
        connectionHost: "localhost",
        currentDatabase: "musiccloud",
        currentUser: "postgres",
        expectedRemoteRole: undefined,
        isSuperuser: true,
      }),
    ).not.toThrow();
  });

  it("allows the configured non-superuser role on a remote database", () => {
    expect(() =>
      assertSafeMigrationIdentity({
        connectionHost: "postgresql",
        currentDatabase: "db",
        currentUser: "db",
        expectedRemoteRole: "db",
        isSuperuser: false,
      }),
    ).not.toThrow();
  });

  it("rejects a remote database when no expected role is configured", () => {
    expect(() =>
      assertSafeMigrationIdentity({
        connectionHost: "postgresql",
        currentDatabase: "db",
        currentUser: "db",
        expectedRemoteRole: undefined,
        isSuperuser: false,
      }),
    ).toThrow(/DB_MIGRATION_ROLE/);
  });

  it("rejects the postgres role on a remote database", () => {
    expect(() =>
      assertSafeMigrationIdentity({
        connectionHost: "prod.example.internal",
        currentDatabase: "db",
        currentUser: "postgres",
        expectedRemoteRole: "postgres",
        isSuperuser: false,
      }),
    ).toThrow(/postgres.*remote/i);
  });

  it("rejects every remote superuser even when the role name matches", () => {
    expect(() =>
      assertSafeMigrationIdentity({
        connectionHost: "prod.example.internal",
        currentDatabase: "db",
        currentUser: "migration_user",
        expectedRemoteRole: "migration_user",
        isSuperuser: true,
      }),
    ).toThrow(/superuser/i);
  });

  it("rejects a remote role mismatch", () => {
    expect(() =>
      assertSafeMigrationIdentity({
        connectionHost: "prod.example.internal",
        currentDatabase: "db",
        currentUser: "unexpected_user",
        expectedRemoteRole: "db",
        isSuperuser: false,
      }),
    ).toThrow(/expected.*db.*unexpected_user/i);
  });
});

describe("assertSafeMigrationConnection", () => {
  it("probes the connected PostgreSQL role before accepting a remote migration", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ current_database: "db", current_user: "db", is_superuser: false }],
    });

    await expect(
      assertSafeMigrationConnection({ query }, "postgresql://db:secret@postgresql:5432/db", "db"),
    ).resolves.toEqual({
      connectionHost: "postgresql",
      currentDatabase: "db",
      currentUser: "db",
      expectedRemoteRole: "db",
      isSuperuser: false,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("fails closed when PostgreSQL returns no identity row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      assertSafeMigrationConnection({ query }, "postgresql://db:secret@postgresql:5432/db", "db"),
    ).rejects.toThrow(/determine.*identity/i);
  });
});

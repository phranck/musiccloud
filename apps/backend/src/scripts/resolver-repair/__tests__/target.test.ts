import { describe, expect, it } from "vitest";
import {
  assertTargetIdentity,
  RepairFailure,
  type RepairMode,
  type RepairTarget,
  resolveRepairTarget,
} from "../target.js";

const COPY = "musiccloud_repair_20261021000000_abcdef";
const SNAPSHOT = "musiccloud_snapshot_20261020164247_00dbb7";

/** The failure code a resolution ends with, or `ok` with the target kind. */
function outcome(url: string, mode: RepairMode): string {
  try {
    return `ok ${resolveRepairTarget(url, mode).kind}`;
  } catch (error) {
    return error instanceof RepairFailure ? error.code : `unexpected ${String(error)}`;
  }
}

describe("which databases a command may connect to", () => {
  it.each([
    { url: `postgresql://dev:secret@localhost:5433/${COPY}`, mode: "apply", expected: "ok rehearsal-copy" },
    { url: `postgresql://dev:secret@127.0.0.1:5433/${COPY}`, mode: "rollback", expected: "ok rehearsal-copy" },
    { url: `postgresql://dev:secret@macserver.fritz.box:5433/${COPY}`, mode: "apply", expected: "ok rehearsal-copy" },
    {
      url: "postgresql://dev:secret@macserver.fritz.box:5433/musiccloud",
      mode: "apply",
      expected: "REPAIR_TARGET_NOT_A_REPAIR_COPY",
    },
    { url: `postgresql://dev:secret@localhost:5433/${SNAPSHOT}`, mode: "verify", expected: "ok rehearsal-copy" },
    {
      url: `postgresql://dev:secret@localhost:5433/${SNAPSHOT}`,
      mode: "apply",
      expected: "REPAIR_TARGET_NOT_A_REPAIR_COPY",
    },
    {
      url: `postgresql://dev:secret@localhost:5433/${SNAPSHOT}`,
      mode: "rollback",
      expected: "REPAIR_TARGET_NOT_A_REPAIR_COPY",
    },
    {
      url: "postgresql://dev:secret@localhost:5433/musiccloud",
      mode: "verify",
      expected: "REPAIR_TARGET_NOT_A_REPAIR_COPY",
    },
    {
      url: "postgresql://dev:secret@localhost:5433/musiccloud",
      mode: "apply",
      expected: "REPAIR_TARGET_NOT_A_REPAIR_COPY",
    },
    {
      url: "postgresql://db:secret@postgresql.zerops:5432/db?sslmode=disable",
      mode: "apply",
      expected: "ok production",
    },
    { url: "postgresql://db:secret@postgresql:5432/db", mode: "verify", expected: "ok production" },
    { url: "postgresql://db:secret@10.0.224.15:5432/db", mode: "apply", expected: "ok production" },
    { url: "postgresql://postgres:secret@10.0.224.15:5432/db", mode: "verify", expected: "REPAIR_TARGET_NOT_ALLOWED" },
    { url: "postgresql://db:secret@10.0.224.15:5432/postgres", mode: "verify", expected: "REPAIR_TARGET_NOT_ALLOWED" },
    { url: "postgresql://db:secret@db.example.com:5432/db", mode: "verify", expected: "REPAIR_TARGET_NOT_ALLOWED" },
    { url: "postgresql://db:secret@192.168.1.20:5432/db", mode: "verify", expected: "REPAIR_TARGET_NOT_ALLOWED" },
    {
      url: `postgresql://dev:secret@localhost:5433/${COPY}?host=production.invalid`,
      mode: "apply",
      expected: "REPAIR_CONNECTION_OPTIONS",
    },
    {
      url: `postgresql://dev:secret@localhost:5433/${COPY}?sslmode=require`,
      mode: "apply",
      expected: "REPAIR_CONNECTION_OPTIONS",
    },
    {
      url: `postgresql://dev:secret@localhost:5433/${COPY}#fragment`,
      mode: "apply",
      expected: "REPAIR_CONNECTION_OPTIONS",
    },
    { url: `mysql://dev:secret@localhost:3306/${COPY}`, mode: "apply", expected: "REPAIR_TARGET_INVALID" },
    { url: "not a url", mode: "apply", expected: "REPAIR_TARGET_INVALID" },
  ] satisfies { url: string; mode: RepairMode; expected: string }[])("$mode $url ends with $expected", ({
    url,
    mode,
    expected,
  }) => {
    expect(outcome(url, mode)).toBe(expected);
  });

  it("builds connection settings that carry the credentials without any option that could redirect them", () => {
    const target = resolveRepairTarget(`postgresql://dev:p%40ss@[::1]:5433/${COPY}`, "apply");
    expect(target.config).toMatchObject({
      host: "::1",
      port: 5433,
      user: "dev",
      password: "p@ss",
      database: COPY,
      ssl: false,
    });
    expect(Object.keys(target.config)).not.toContain("options");
  });
});

describe("whom the server says it is", () => {
  const production: RepairTarget = { kind: "production", database: "db", role: "db", config: {} };
  const copy: RepairTarget = { kind: "rehearsal-copy", database: COPY, role: "dev", config: {} };

  /** Whether the identity is accepted. */
  function accepts(
    target: RepairTarget,
    identity: { database: string; role: string; superuser: boolean; recovery: boolean },
  ): boolean {
    try {
      assertTargetIdentity(target, identity);
      return true;
    } catch {
      return false;
    }
  }

  it("accepts the application role on production and the development superuser on a copy", () => {
    expect(accepts(production, { database: "db", role: "db", superuser: false, recovery: false })).toBe(true);
    expect(accepts(copy, { database: COPY, role: "dev", superuser: true, recovery: false })).toBe(true);
  });

  it("refuses a superuser on production, a standby, and a database or role other than the one in the URL", () => {
    expect(accepts(production, { database: "db", role: "db", superuser: true, recovery: false })).toBe(false);
    expect(accepts(production, { database: "db", role: "db", superuser: false, recovery: true })).toBe(false);
    expect(accepts(production, { database: "other", role: "db", superuser: false, recovery: false })).toBe(false);
    expect(accepts(copy, { database: COPY, role: "someone", superuser: true, recovery: false })).toBe(false);
  });
});

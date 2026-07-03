import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EmailTemplateWriteData } from "../../admin-repository.js";
import { getEmailTemplateById, insertEmailTemplate, updateEmailTemplate } from "../postgres-content-email.js";

/**
 * Hits a live Postgres pointed at by `DATABASE_URL`. Exercises the
 * present-keys-only branding-override semantics of `insertEmailTemplate` /
 * `updateEmailTemplate` against the real `email_templates` branding columns
 * (MC-079 migration 0052): an ABSENT key leaves the column untouched, a key
 * present as `null` clears the override, a non-null value sets it.
 *
 * All fixtures use a random template name per row so they never collide with
 * seeded data; `afterAll` deletes every row created here.
 */
describe.skipIf(!process.env.DATABASE_URL)("email template branding overrides (integration)", () => {
  let pool: pgModule.Pool;
  const createdIds: number[] = [];

  beforeAll(() => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await pool.query("DELETE FROM email_templates WHERE id = $1", [id]);
    }
    await pool.end();
  });

  function uniqueName(): string {
    return `mc079-it-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function insert(overrides: Pick<EmailTemplateWriteData, "branding"> | Record<string, never> = {}) {
    const row = await insertEmailTemplate(pool, { name: uniqueName(), subject: "S", blocks: [], ...overrides });
    createdIds.push(row.id);
    return row;
  }

  it("defaults every branding override to null on insert when none is given", async () => {
    const row = await insert();
    expect(row.branding).toEqual({
      headerAssetId: null,
      footerAssetId: null,
      footerText: null,
      lightBackgroundAssetId: null,
      darkBackgroundAssetId: null,
      lightGradientTop: null,
      lightGradientBottom: null,
      darkGradientTop: null,
      darkGradientBottom: null,
    });
  });

  it("persists branding overrides given at insert time", async () => {
    const row = await insert({ branding: { footerText: "insert footer", lightGradientTop: "#123456" } });
    expect(row.branding.footerText).toBe("insert footer");
    expect(row.branding.lightGradientTop).toBe("#123456");
    expect(row.branding.footerAssetId).toBeNull();
  });

  it("leaves an absent branding key unchanged on update (present-keys-only)", async () => {
    const row = await insert({ branding: { footerText: "original", lightGradientTop: "#111111" } });
    const updated = await updateEmailTemplate(pool, row.id, { branding: { lightGradientTop: "#222222" } });
    expect(updated?.branding.lightGradientTop).toBe("#222222"); // changed
    expect(updated?.branding.footerText).toBe("original"); // untouched
  });

  it("clears an override when the update sends the key explicitly as null", async () => {
    const row = await insert({ branding: { footerText: "will be cleared" } });
    const updated = await updateEmailTemplate(pool, row.id, { branding: { footerText: null } });
    expect(updated?.branding.footerText).toBeNull();
  });

  it("does not touch branding at all when the update omits `branding` entirely", async () => {
    const row = await insert({ branding: { footerText: "keep me" } });
    const updated = await updateEmailTemplate(pool, row.id, { subject: "new subject" });
    expect(updated?.subject).toBe("new subject");
    expect(updated?.branding.footerText).toBe("keep me");
  });

  it("round-trips a full set of branding override values (and re-reads them)", async () => {
    const row = await insert();
    const branding = {
      headerAssetId: null,
      footerAssetId: null,
      footerText: "full",
      lightBackgroundAssetId: null,
      darkBackgroundAssetId: null,
      lightGradientTop: "#0076d5",
      lightGradientBottom: "#69d1fd",
      darkGradientTop: "#0b1318",
      darkGradientBottom: "#10273b",
    };
    const updated = await updateEmailTemplate(pool, row.id, { branding });
    expect(updated?.branding).toEqual(branding);
    const reread = await getEmailTemplateById(pool, row.id);
    expect(reread?.branding).toEqual(branding);
  });
});

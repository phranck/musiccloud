import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonymizeFormSubmissionsBySubject,
  createFormConfig,
  deleteFormConfig,
  getActiveFormConfigBySlug,
  getFormConfigByName,
  insertFormSubmission,
  listFormConfigs,
  listFormSubmissionsBySubject,
  saveFormConfigPayload,
  setFormConfigActive,
} from "../postgres-forms.js";

/**
 * Hits a live Postgres pointed at by `DATABASE_URL`. Exercises the
 * form-config CRUD (MC-082 migration 0055): unique-name/slug conflict
 * signaling as discriminated results, the active-only slug lookup used by the
 * public submit route, payload upserts, and the submissions insert incl. the
 * GDPR anchor columns and the delete cascade.
 *
 * All fixtures use random names/slugs per row so they never collide with real
 * data; `afterAll` deletes every form created here (submissions cascade).
 */
describe.skipIf(!process.env.DATABASE_URL)("form configs (integration)", () => {
  let pool: pgModule.Pool;
  const createdNames: string[] = [];

  beforeAll(() => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    for (const name of createdNames) {
      await pool.query("DELETE FROM form_configs WHERE name = $1", [name]);
    }
    await pool.end();
  });

  function unique(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function createTracked(name = unique("mc082-form"), slug = unique("mc082-slug")) {
    createdNames.push(name);
    const result = await createFormConfig(pool, { name, slug });
    if (!result.ok) throw new Error(`fixture create failed: ${result.reason}`);
    return result.data;
  }

  it("creates an empty form and reads it back by name", async () => {
    const created = await createTracked();
    expect(created.rows).toEqual([]);
    expect(created.isActive).toBe(true);

    const fetched = await getFormConfigByName(pool, created.name);
    expect(fetched).toEqual(created);
    const listed = await listFormConfigs(pool);
    expect(listed.some((f) => f.id === created.id)).toBe(true);
  });

  it("signals name_taken on a duplicate name", async () => {
    const created = await createTracked();
    const dup = await createFormConfig(pool, { name: created.name, slug: unique("other") });
    expect(dup).toEqual({ ok: false, reason: "name_taken" });
  });

  it("signals slug_taken on a duplicate slug", async () => {
    const created = await createTracked();
    const otherName = unique("mc082-form");
    createdNames.push(otherName);
    const dup = await createFormConfig(pool, { name: otherName, slug: created.slug ?? "" });
    expect(dup).toEqual({ ok: false, reason: "slug_taken" });
  });

  it("saves a payload (rows + submission chain + slug) over an existing form", async () => {
    const created = await createTracked();
    const newSlug = unique("mc082-slug");
    const saved = await saveFormConfigPayload(pool, created.name, {
      slug: newSlug,
      rows: [{ id: "r1", fields: [{ id: "f1", type: "email", label: "Email", required: true }] }],
      submissionConfig: { steps: [{ type: "store" }] },
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.data.slug).toBe(newSlug);
      expect(saved.data.rows).toHaveLength(1);
      expect(saved.data.submissionConfig?.steps).toEqual([{ type: "store" }]);
    }
  });

  it("signals not_found when saving a payload for an unknown name", async () => {
    const saved = await saveFormConfigPayload(pool, unique("mc082-missing"), { rows: [] });
    expect(saved).toEqual({ ok: false, reason: "not_found" });
  });

  it("signals slug_taken when a save would steal another form's slug", async () => {
    const first = await createTracked();
    const second = await createTracked();
    const saved = await saveFormConfigPayload(pool, second.name, { slug: first.slug ?? "", rows: [] });
    expect(saved).toEqual({ ok: false, reason: "slug_taken" });
  });

  it("only resolves ACTIVE forms by slug", async () => {
    const created = await createTracked();
    const slug = created.slug ?? "";
    expect((await getActiveFormConfigBySlug(pool, slug))?.id).toBe(created.id);

    const toggled = await setFormConfigActive(pool, created.name, false);
    expect(toggled?.isActive).toBe(false);
    expect(await getActiveFormConfigBySlug(pool, slug)).toBeNull();
  });

  it("finds submissions by subject (account id OR email, case-insensitive) and anonymizes only the email", async () => {
    const created = await createTracked();
    const byAccount = await insertFormSubmission(pool, {
      formConfigId: created.id,
      data: { message: "via account" },
      developerAccountId: null,
      submitterEmail: "Person@Example.com",
    });
    const unrelated = await insertFormSubmission(pool, {
      formConfigId: created.id,
      data: { message: "someone else" },
      submitterEmail: "other@example.com",
    });

    const found = await listFormSubmissionsBySubject(pool, { email: "person@example.com" });
    expect(found.map((s) => s.id)).toContain(byAccount.id);
    expect(found.map((s) => s.id)).not.toContain(unrelated.id);
    expect(found.find((s) => s.id === byAccount.id)?.data).toEqual({ message: "via account" });

    const result = await anonymizeFormSubmissionsBySubject(pool, { email: "person@example.com" });
    expect(result.anonymized).toBe(1);

    const after = await pool.query("SELECT submitter_email, data FROM form_submissions WHERE id = $1", [byAccount.id]);
    expect(after.rows[0].submitter_email).toBeNull();
    expect(after.rows[0].data).toEqual({ message: "via account" });
    expect(await listFormSubmissionsBySubject(pool, { email: "person@example.com" })).toHaveLength(0);
  });

  it("stores a submission with GDPR anchors and cascades it on form delete", async () => {
    const created = await createTracked();
    const inserted = await insertFormSubmission(pool, {
      formConfigId: created.id,
      data: { message: "hello" },
      submitterEmail: "person@example.com",
    });
    expect(inserted.id).toBeGreaterThan(0);

    const stored = await pool.query("SELECT submitter_email, data FROM form_submissions WHERE id = $1", [inserted.id]);
    expect(stored.rows[0].submitter_email).toBe("person@example.com");
    expect(stored.rows[0].data).toEqual({ message: "hello" });

    expect(await deleteFormConfig(pool, created.name)).toBe(true);
    const afterDelete = await pool.query("SELECT id FROM form_submissions WHERE id = $1", [inserted.id]);
    expect(afterDelete.rows).toHaveLength(0);
    expect(await deleteFormConfig(pool, created.name)).toBe(false);
  });
});

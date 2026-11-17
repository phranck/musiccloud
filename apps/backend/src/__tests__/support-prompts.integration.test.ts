import { ENDPOINTS, SUPPORT_PROMPT_DEFAULTS, type SupportPromptInput } from "@musiccloud/shared";
import Fastify from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabasePool } from "../db/pool.js";
import {
  deleteSupportPrompt,
  getSupportPrompt,
  insertSupportPrompt,
  listPublishedSupportPrompts,
  listSupportPrompts,
  updateSupportPrompt,
} from "../services/support-prompts.js";
import { connectRepositoriesToIntegrationDatabase, integrationDatabaseUrl } from "./integration-database.js";

/** The day every window below is measured against. */
const TODAY = "2001-03-15";

/**
 * Runs the support prompts' SQL, and the public route that reads it, against
 * the Postgres `TEST_DATABASE_URL` names.
 *
 * Every prompt is created here, named with a marker, and removed here by its
 * id. Assertions only ever look at this run's ids, because another suite may
 * have left published prompts of its own.
 */
describe.skipIf(!integrationDatabaseUrl())("support prompts (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const MARKER = `integration-support-prompts-${Date.now()}`;
  const promptIds: string[] = [];
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
  });

  afterAll(async () => {
    await client.query("DELETE FROM support_prompts WHERE id = ANY($1::text[])", [promptIds]);
    await client.end();
    await closeDatabasePool();
  });

  /** A published prompt of the run without a window, changed as a test needs. */
  async function prompt(change: Partial<SupportPromptInput> = {}) {
    const created = await insertSupportPrompt({
      ...SUPPORT_PROMPT_DEFAULTS,
      name: MARKER,
      slot: "share-page",
      published: true,
      ...change,
    });
    promptIds.push(created.id);
    return created;
  }

  /** The ids of this run among the prompts delivered on `day`. */
  async function deliveredOn(day: string): Promise<string[]> {
    const delivered = await listPublishedSupportPrompts(day);
    return delivered.map((entry) => entry.id).filter((id) => promptIds.includes(id));
  }

  it("stores a prompt and reads every field back unchanged", async () => {
    const created = await prompt({ content: "Hello", startsAt: "2001-03-01", endsAt: "2001-03-31", priority: 7 });

    expect(await getSupportPrompt(created.id)).toEqual(created);
    expect((await listSupportPrompts()).map((entry) => entry.id)).toContain(created.id);
    expect(created).toMatchObject({ content: "Hello", startsAt: "2001-03-01", endsAt: "2001-03-31", priority: 7 });
  });

  it("never delivers an unpublished prompt, whatever its window says", async () => {
    const draft = await prompt({ published: false, startsAt: "2001-03-01", endsAt: "2001-03-31" });

    expect(await deliveredOn(TODAY)).not.toContain(draft.id);
  });

  it("never delivers a prompt whose window ended or has not opened", async () => {
    const ended = await prompt({ endsAt: "2001-03-14" });
    const waiting = await prompt({ startsAt: "2001-03-16" });

    const delivered = await deliveredOn(TODAY);
    expect(delivered).not.toContain(ended.id);
    expect(delivered).not.toContain(waiting.id);
  });

  it("delivers a prompt on the first and the last day it names", async () => {
    const starting = await prompt({ startsAt: TODAY });
    const ending = await prompt({ endsAt: TODAY });
    const open = await prompt();

    expect(await deliveredOn(TODAY)).toEqual(expect.arrayContaining([starting.id, ending.id, open.id]));
  });

  it("puts the higher priority first", async () => {
    const low = await prompt({ priority: 1 });
    const high = await prompt({ priority: 900 });

    const delivered = await deliveredOn(TODAY);
    expect(delivered.indexOf(high.id)).toBeLessThan(delivered.indexOf(low.id));
  });

  it("answers the public route with this run's live prompt and without its draft", async () => {
    const live = await prompt({ content: "Live" });
    const draft = await prompt({ published: false, content: "Draft" });
    const expired = await prompt({ endsAt: "2000-01-01", content: "Expired" });

    const app = Fastify({ logger: false });
    const { default: publicSupportPromptRoutes } = await import("../routes/public-support-prompts.js");
    await app.register(publicSupportPromptRoutes);
    try {
      const res = await app.inject({ method: "GET", url: ENDPOINTS.v1.supportPrompts });
      const ids = (res.json().prompts as { id: string }[]).map((entry) => entry.id);

      expect(res.statusCode).toBe(200);
      expect(ids).toContain(live.id);
      expect(ids).not.toContain(draft.id);
      expect(ids).not.toContain(expired.id);
      expect(res.body).not.toContain("Draft");
    } finally {
      await app.close();
    }
  });

  it("keeps the identifier when a prompt is changed", async () => {
    const created = await prompt();

    const updated = await updateSupportPrompt(created.id, { ...created, name: `${MARKER} renamed` });

    expect(updated?.id).toBe(created.id);
    expect(updated?.name).toBe(`${MARKER} renamed`);
  });

  it("removes a prompt and says when there was none", async () => {
    const created = await prompt();

    expect(await deleteSupportPrompt(created.id)).toBe(true);
    expect(await deleteSupportPrompt(created.id)).toBe(false);
    expect(await getSupportPrompt(created.id)).toBeNull();
  });
});

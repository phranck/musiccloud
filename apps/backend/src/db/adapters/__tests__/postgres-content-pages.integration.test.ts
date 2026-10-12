import { randomUUID } from "node:crypto";
import { ContentContext } from "@musiccloud/shared";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseUrl } from "../../../__tests__/integration-database.js";
import {
  createContentPage,
  deleteContentPage,
  getPublishedContentPageByPath,
  listContentPublications,
  replaceContentPublications,
} from "../postgres-content-pages.js";

describe.skipIf(!integrationDatabaseUrl())("contextual content pages (integration)", () => {
  const suffix = randomUUID();
  const primarySlug = `it-context-primary-${suffix}`;
  const collisionSlug = `it-context-collision-${suffix}`;
  const sharedPath = `/it-privacy-${suffix}`;
  let pool: pg.Pool;
  let primaryPageId: string;
  let collisionPageId: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: integrationDatabaseUrl() });
    const primary = await createContentPage(pool, {
      slug: primarySlug,
      title: "Context publication integration page",
      status: "draft",
      pageType: "default",
      createdBy: null,
    });
    const collision = await createContentPage(pool, {
      slug: collisionSlug,
      title: "Context publication collision page",
      status: "draft",
      pageType: "default",
      createdBy: null,
    });
    primaryPageId = primary.id;
    collisionPageId = collision.id;
  });

  afterAll(async () => {
    if (pool) {
      await deleteContentPage(pool, primarySlug);
      await deleteContentPage(pool, collisionSlug);
      await pool.end();
    }
  });

  it("stores the same normalized path in both contexts and rejects a collision inside one context", async () => {
    await replaceContentPublications(pool, primaryPageId, [
      {
        context: ContentContext.Frontend,
        path: sharedPath,
        status: "published",
        templateKey: "frontend-default",
      },
      {
        context: ContentContext.DeveloperPortal,
        path: sharedPath,
        status: "draft",
        templateKey: "developer-default",
      },
    ]);

    await expect(
      replaceContentPublications(pool, collisionPageId, [
        {
          context: ContentContext.Frontend,
          path: sharedPath,
          status: "published",
          templateKey: "frontend-default",
        },
      ]),
    ).rejects.toMatchObject({ code: "23505" });

    expect(await listContentPublications(pool, primaryPageId)).toEqual([
      {
        pageId: primaryPageId,
        context: ContentContext.Frontend,
        path: sharedPath,
        status: "published",
        templateKey: "frontend-default",
      },
      {
        pageId: primaryPageId,
        context: ContentContext.DeveloperPortal,
        path: sharedPath,
        status: "draft",
        templateKey: "developer-default",
      },
    ]);
    expect(await listContentPublications(pool, collisionPageId)).toEqual([]);
    expect(await getPublishedContentPageByPath(pool, ContentContext.Frontend, sharedPath)).toMatchObject({
      id: primaryPageId,
      slug: primarySlug,
    });
    expect(await getPublishedContentPageByPath(pool, ContentContext.DeveloperPortal, sharedPath)).toBeNull();
  });
});

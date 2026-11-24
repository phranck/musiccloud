/**
 * Content publication cutover: the one-time administrative operation that adds
 * the closed Privacy and Terms publication set in one locked transaction, with
 * the input, identity, route and prerequisite checks that guard it.
 *
 * `postgres-content-pages.ts` re-exports `applyContentPublicationCutover`, so
 * importers keep using that module.
 */

import { randomUUID } from "node:crypto";

import type { ContentPublication, SingleContentContext } from "@musiccloud/shared";
import { ContentContext, isPortalOwnedDocsPath, normalizeEditorialPath } from "@musiccloud/shared";
import type { Pool } from "pg";
import {
  ContentPublicationCutoverConflictError,
  type ContentPublicationCutoverInput,
  type ContentPublicationCutoverResult,
  type ContentPublicationRow,
} from "../admin-repository.js";
import {
  canonicalRouteKey,
  fingerprintContentPage,
  isCanonicalTermsBootstrapPage,
  PRIVACY_DEVELOPER_PUBLICATION,
  PRIVACY_FRONTEND_PREREQUISITE,
  publicationContextMask,
  samePublication,
  TERMS_DEVELOPER_PUBLICATION,
  TERMS_FRONTEND_PUBLICATION,
} from "../content-publication-cutover.js";
import { type ContentPublicationSqlRow, rowToContentPublication } from "./postgres-content-pages.js";

/**
 * Adds a closed publication cutover in one transaction without replacing any
 * existing publication row. Broad table locks are intentional for this
 * one-time administrative operation: they prevent Page-identity and route
 * claim phantoms while the complete publication set is revalidated.
 */
export async function applyContentPublicationCutover(
  pool: Pool,
  entries: ContentPublicationCutoverInput[],
): Promise<ContentPublicationCutoverResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE content_pages IN SHARE ROW EXCLUSIVE MODE");
    await client.query("LOCK TABLE content_page_publications IN SHARE ROW EXCLUSIVE MODE");

    assertClosedCutoverInputs(entries);
    assertUniqueCutoverInputs(entries);
    const pageMetadataResult = await client.query<{
      id: string;
      slug: string;
      context_mask: number;
    }>(
      `SELECT id, slug, context_mask
         FROM content_pages
        ORDER BY id
        FOR UPDATE`,
    );
    const expectedPageIds = entries.flatMap((entry) =>
      entry.expectedPage.kind === "existing" ? [entry.expectedPage.pageId] : [],
    );
    const sourceSlugs = entries.map((entry) => entry.sourceSlug);
    const targetPageResult = await client.query<{
      id: string;
      slug: string;
      title: string;
      content: string;
    }>(
      `SELECT id, slug, title, content
         FROM content_pages
        WHERE id = ANY($1::text[])
           OR slug = ANY($2::text[])
        ORDER BY id
        FOR UPDATE`,
      [expectedPageIds, sourceSlugs],
    );
    const resolvedPageIds = new Map<string, string>();
    for (const entry of entries) {
      const rowsBySlug = targetPageResult.rows.filter((row) => row.slug === entry.sourceSlug);
      if (entry.expectedPage.kind === "absent") {
        if (entry.sourceSlug !== "terms" || rowsBySlug.length !== 0) {
          throw cutoverConflict(`Page absence ${entry.sourceSlug}`);
        }
        if (
          !isCanonicalTermsBootstrapPage(entry.expectedPage.create) ||
          fingerprintContentPage(entry.expectedPage.create) !== entry.expectedPage.fingerprint
        ) {
          throw cutoverConflict(`Page create fingerprint ${entry.sourceSlug}`);
        }
      } else {
        const expectedPage = entry.expectedPage;
        const rowsById = targetPageResult.rows.filter((row) => row.id === expectedPage.pageId);
        if (
          rowsById.length !== 1 ||
          rowsBySlug.length !== 1 ||
          rowsById[0]!.slug !== entry.sourceSlug ||
          rowsBySlug[0]!.id !== expectedPage.pageId ||
          fingerprintContentPage(rowsById[0]!) !== expectedPage.fingerprint
        ) {
          throw cutoverConflict(`Page identity or content ${entry.sourceSlug}`);
        }
        resolvedPageIds.set(entry.sourceSlug, expectedPage.pageId);
      }
      for (const publication of entry.publications) {
        assertCanonicalDesiredPublication(entry.sourceSlug, publication);
      }
    }

    const publicationResult = await client.query<ContentPublicationSqlRow>(
      `SELECT page_id, context, path, status, template_key
         FROM content_page_publications
        ORDER BY context, path, page_id
        FOR UPDATE`,
    );
    for (const lockedPage of pageMetadataResult.rows) {
      const lockedPublications = publicationResult.rows.filter((publication) => publication.page_id === lockedPage.id);
      if (lockedPage.context_mask !== publicationContextMask(lockedPublications)) {
        throw cutoverConflict(`context mask ${lockedPage.slug}`);
      }
    }
    const claims = indexLockedPublicationClaims(publicationResult.rows);
    for (const entry of entries) {
      const expectedPageId = entry.expectedPage.kind === "existing" ? entry.expectedPage.pageId : undefined;
      for (const prerequisite of entry.prerequisitePublications) {
        const current = expectedPageId
          ? publicationResult.rows.filter(
              (row) => row.page_id === expectedPageId && row.context === prerequisite.context,
            )
          : [];
        if (current.length !== 1 || !samePublication(rowToContentPublication(current[0]!), prerequisite)) {
          throw cutoverConflict(`prerequisite publication ${entry.sourceSlug}`);
        }
      }
    }
    const pending: Array<{ sourceSlug: string; publication: ContentPublication }> = [];
    for (const entry of entries) {
      const expectedPageId = entry.expectedPage.kind === "existing" ? entry.expectedPage.pageId : undefined;
      for (const desired of entry.publications) {
        const current = expectedPageId
          ? publicationResult.rows.filter((row) => row.page_id === expectedPageId && row.context === desired.context)
          : [];
        const otherRouteOwners = (claims.get(canonicalRouteKey(desired.context, desired.path)) ?? []).filter(
          (claim) => claim.page_id !== expectedPageId,
        );
        if (otherRouteOwners.length > 0) {
          throw cutoverConflict(`route ${desired.path}`);
        }
        if (current.length === 0) {
          pending.push({ sourceSlug: entry.sourceSlug, publication: desired });
          continue;
        }
        if (current.length !== 1 || !samePublication(rowToContentPublication(current[0]!), desired)) {
          throw cutoverConflict(`target publication ${entry.sourceSlug}`);
        }
      }
    }

    const createdPages: ContentPublicationCutoverResult["createdPages"] = [];
    for (const entry of entries) {
      if (entry.expectedPage.kind !== "absent") continue;
      const pageId = randomUUID();
      const create = entry.expectedPage.create;
      await client.query<{ id: string }>(
        `INSERT INTO content_pages
           (id, slug, context_mask, title, content, status, show_title, title_alignment,
            page_type, display_mode, overlay_width, content_card_style)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          pageId,
          entry.sourceSlug,
          create.contextMask,
          create.title,
          create.content,
          create.status,
          create.showTitle,
          create.titleAlignment,
          create.pageType,
          create.displayMode,
          create.overlayWidth,
          create.contentCardStyle,
        ],
      );
      resolvedPageIds.set(entry.sourceSlug, pageId);
      createdPages.push({
        sourceSlug: entry.sourceSlug,
        pageId,
        fingerprint: entry.expectedPage.fingerprint,
      });
    }

    const inserted: ContentPublicationRow[] = [];
    for (const entry of pending) {
      const pageId = resolvedPageIds.get(entry.sourceSlug);
      if (!pageId) throw cutoverConflict(`unresolved Page ${entry.sourceSlug}`);
      const desired = entry.publication;
      const result = await client.query<ContentPublicationSqlRow>(
        `INSERT INTO content_page_publications (page_id, context, path, status, template_key)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING page_id, context, path, status, template_key`,
        [pageId, desired.context, desired.path, desired.status, desired.templateKey],
      );
      if (!createdPages.some((created) => created.pageId === pageId)) {
        await client.query(`UPDATE content_pages SET context_mask = context_mask | $2 WHERE id = $1`, [
          pageId,
          desired.context,
        ]);
      }
      inserted.push(rowToContentPublication(result.rows[0]!));
    }

    await client.query("COMMIT");
    return { createdPages, publications: inserted };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function assertUniqueCutoverInputs(entries: ContentPublicationCutoverInput[]): void {
  const pageIds = new Set<string>();
  const sourceSlugs = new Set<string>();
  const routes = new Set<string>();
  for (const entry of entries) {
    const pageId = entry.expectedPage.kind === "existing" ? entry.expectedPage.pageId : null;
    if ((pageId !== null && pageIds.has(pageId)) || sourceSlugs.has(entry.sourceSlug)) {
      throw cutoverConflict("duplicate input");
    }
    if (pageId !== null) pageIds.add(pageId);
    sourceSlugs.add(entry.sourceSlug);
    const contexts = new Set<SingleContentContext>();
    for (const publication of entry.publications) {
      const route = canonicalRouteKey(publication.context, normalizeEditorialPath(publication.path));
      if (contexts.has(publication.context) || routes.has(route)) throw cutoverConflict("duplicate input");
      contexts.add(publication.context);
      routes.add(route);
    }
  }
}

function assertClosedCutoverInputs(entries: ContentPublicationCutoverInput[]): void {
  const privacyEntries = entries.filter((entry) => entry.sourceSlug === "privacy");
  const termsEntries = entries.filter((entry) => entry.sourceSlug === "terms");
  if (entries.length !== 2 || privacyEntries.length !== 1 || termsEntries.length !== 1) {
    throw cutoverConflict("closed input identities");
  }

  const privacy = privacyEntries[0]!;
  if (
    privacy.expectedPage.kind !== "existing" ||
    !hasExactPublicationSet(privacy.prerequisitePublications, [PRIVACY_FRONTEND_PREREQUISITE]) ||
    !hasExactPublicationSet(privacy.publications, [PRIVACY_DEVELOPER_PUBLICATION])
  ) {
    throw cutoverConflict("closed Privacy contract");
  }

  const terms = termsEntries[0]!;
  if (
    (terms.expectedPage.kind !== "existing" && terms.expectedPage.kind !== "absent") ||
    !hasExactPublicationSet(terms.prerequisitePublications, []) ||
    !hasExactPublicationSet(terms.publications, [TERMS_FRONTEND_PUBLICATION, TERMS_DEVELOPER_PUBLICATION])
  ) {
    throw cutoverConflict("closed Terms contract");
  }
}

function hasExactPublicationSet(actual: unknown, expected: readonly Readonly<ContentPublication>[]): boolean {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const unmatched = [...actual];
  return expected.every((publication) => {
    const index = unmatched.findIndex((candidate) => samePublicationValue(candidate, publication));
    if (index === -1) return false;
    unmatched.splice(index, 1);
    return true;
  });
}

function samePublicationValue(actual: unknown, expected: Readonly<ContentPublication>): boolean {
  return typeof actual === "object" && actual !== null && samePublication(actual as ContentPublication, expected);
}

function assertCanonicalDesiredPublication(sourceSlug: string, publication: ContentPublication): void {
  let normalizedPath: string;
  try {
    normalizedPath = normalizeEditorialPath(publication.path);
  } catch {
    throw cutoverConflict(`invalid desired path for ${sourceSlug}`);
  }
  if (
    normalizedPath !== publication.path ||
    (publication.context === ContentContext.DeveloperPortal && isPortalOwnedDocsPath(normalizedPath))
  ) {
    throw cutoverConflict(`reserved or non-canonical desired path ${normalizedPath}`);
  }
}

function indexLockedPublicationClaims(rows: ContentPublicationSqlRow[]): Map<string, ContentPublicationSqlRow[]> {
  const claims = new Map<string, ContentPublicationSqlRow[]>();
  for (const row of rows) {
    let normalizedPath: string;
    try {
      normalizedPath = normalizeEditorialPath(row.path);
    } catch {
      throw cutoverConflict(`invalid existing path for Page ${row.page_id}`);
    }
    if (row.context === ContentContext.DeveloperPortal && isPortalOwnedDocsPath(normalizedPath)) {
      throw cutoverConflict(`reserved docs claim ${normalizedPath}`);
    }
    const key = canonicalRouteKey(row.context as SingleContentContext, normalizedPath);
    const existing = claims.get(key) ?? [];
    existing.push(row);
    claims.set(key, existing);
  }
  for (const [key, routeClaims] of claims) {
    if (routeClaims.length > 1) throw cutoverConflict(`canonical duplicate ${key}`);
  }
  return claims;
}

function cutoverConflict(_reason: string): ContentPublicationCutoverConflictError {
  return new ContentPublicationCutoverConflictError();
}

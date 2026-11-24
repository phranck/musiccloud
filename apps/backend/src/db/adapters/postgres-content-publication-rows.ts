/**
 * Content publication rows: the raw `content_page_publications` row shape and
 * its mapper to the `ContentPublicationRow` DTO.
 *
 * `postgres-content-pages.ts` and `postgres-content-publication-cutover.ts`
 * both read publication rows, so the shape and the mapper live here, where
 * neither of the two has to import the other.
 */

import type { ContentStatus, SingleContentContext } from "@musiccloud/shared";
import type { ContentPublicationRow } from "../admin-repository.js";

/**
 * Raw `content_page_publications` row as every publication SELECT and
 * RETURNING reads it.
 */
export interface ContentPublicationSqlRow {
  page_id: string;
  context: number;
  path: string;
  status: string;
  template_key: string;
}

/**
 * Maps a publication row to its DTO, narrowing `context` and `status` to their
 * shared types.
 *
 * @param row - The raw `content_page_publications` row.
 * @returns The `ContentPublicationRow` DTO.
 */
export function rowToContentPublication(row: ContentPublicationSqlRow): ContentPublicationRow {
  return {
    pageId: row.page_id,
    context: row.context as SingleContentContext,
    path: row.path,
    status: row.status as ContentStatus,
    templateKey: row.template_key,
  };
}

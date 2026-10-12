import {
  ContentContext,
  type ContentPageSummary,
  isPortalReservedPath,
  type SingleContentContext,
  tryNormalizeEditorialPath,
} from "@musiccloud/shared";

/**
 * Whether the portal builds this path itself, so the dashboard must not offer
 * it for editing.
 *
 * The path is normalized the way the backend normalizes it before it decides,
 * so `docs/api` and `/%64ocs/api` are recognized here exactly as the server
 * will refuse them. A path the server cannot normalize is not reported as
 * reserved, because saving it fails with the server's own reason.
 *
 * @param path - The published path, as it may have been typed.
 * @returns `true` when the page behind it is the portal's own.
 */
export function isSystemOwnedDocsPath(path: string): boolean {
  const normalized = tryNormalizeEditorialPath(path);
  return normalized !== null && isPortalReservedPath(normalized);
}

export function isSystemOwnedPublication(context: SingleContentContext, path: string): boolean {
  return context === ContentContext.DeveloperPortal && isSystemOwnedDocsPath(path);
}

export function isEditableContentPage(page: Pick<ContentPageSummary, "publications">): boolean {
  return !page.publications.some((publication) => isSystemOwnedPublication(publication.context, publication.path));
}

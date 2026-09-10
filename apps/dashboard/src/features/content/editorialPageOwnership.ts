import {
  ContentContext,
  type ContentPageSummary,
  isPortalReservedPath,
  type SingleContentContext,
} from "@musiccloud/shared";

/**
 * Whether the portal builds this path itself, so the dashboard must not offer
 * it for editing.
 *
 * The same question the portal and the backend ask, answered from the same
 * declaration. It used to be answered here separately, which is how `/docs`
 * came to be editorial everywhere except in the dashboard that edits it.
 *
 * @param path - The published path, as it may have been typed.
 * @returns `true` when the page behind it is the portal's own.
 */
export function isSystemOwnedDocsPath(path: string): boolean {
  const pathname =
    path
      .trim()
      .split(/[?#]/u, 1)[0]
      ?.replace(/\/{2,}/gu, "/")
      .replace(/\/$/u, "") || "/";
  return isPortalReservedPath(pathname);
}

export function isSystemOwnedPublication(context: SingleContentContext, path: string): boolean {
  return context === ContentContext.DeveloperPortal && isSystemOwnedDocsPath(path);
}

export function isEditableContentPage(page: Pick<ContentPageSummary, "publications">): boolean {
  return !page.publications.some((publication) => isSystemOwnedPublication(publication.context, publication.path));
}

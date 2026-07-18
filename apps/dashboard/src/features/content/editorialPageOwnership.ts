import { ContentContext, type ContentPageSummary, type SingleContentContext } from "@musiccloud/shared";

export function isSystemOwnedDocsPath(path: string): boolean {
  const pathname =
    path
      .trim()
      .split(/[?#]/u, 1)[0]
      ?.replace(/\/{2,}/gu, "/")
      .replace(/\/$/u, "") || "/";
  return pathname === "/docs" || pathname.startsWith("/docs/");
}

export function isSystemOwnedPublication(context: SingleContentContext, path: string): boolean {
  return context === ContentContext.DeveloperPortal && isSystemOwnedDocsPath(path);
}

export function isEditableContentPage(page: Pick<ContentPageSummary, "publications">): boolean {
  return !page.publications.some((publication) => isSystemOwnedPublication(publication.context, publication.path));
}

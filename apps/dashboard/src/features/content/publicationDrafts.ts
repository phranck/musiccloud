import {
  activeContentContexts,
  ContentContext,
  type ContentContextMask,
  type ContentPublication,
  type SingleContentContext,
} from "@musiccloud/shared";

import { isSystemOwnedPublication } from "@/features/content/editorialPageOwnership";

export const ContentPublicationStatus = {
  Draft: "draft",
  Published: "published",
  Hidden: "hidden",
} as const;

export function createPublicationDrafts(slug: string, contextMask: ContentContextMask): ContentPublication[] {
  return activeContentContexts(contextMask).map((context) => ({
    context,
    path: `/${slug}`,
    status: ContentPublicationStatus.Draft,
    templateKey: context === ContentContext.Frontend ? "frontend-default" : "developer-default",
  }));
}

export interface PublicationPreview {
  context: SingleContentContext;
  label: string;
  url: string;
}

export function buildPublicationPreviews(
  publications: ContentPublication[],
  labels: Record<SingleContentContext, string>,
  baseUrls: Record<SingleContentContext, string>,
): PublicationPreview[] {
  const previews: PublicationPreview[] = [];
  for (const publication of publications) {
    if (isSystemOwnedPublication(publication.context, publication.path)) continue;
    previews.push({
      context: publication.context,
      label: labels[publication.context],
      url: `${baseUrls[publication.context]}${publication.path}`,
    });
  }
  return previews;
}

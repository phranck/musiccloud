import { ContentContext } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";

import { buildPublicationPreviews, createPublicationDrafts } from "@/features/content/publicationDrafts";

describe("contextual publication helpers", () => {
  it("creates one draft for every active context", () => {
    expect(createPublicationDrafts("privacy", ContentContext.Frontend | ContentContext.DeveloperPortal)).toEqual([
      {
        context: ContentContext.Frontend,
        path: "/privacy",
        status: "draft",
        templateKey: "frontend-default",
      },
      {
        context: ContentContext.DeveloperPortal,
        path: "/privacy",
        status: "draft",
        templateKey: "developer-default",
      },
    ]);
  });

  it("never presents the system-owned Docs namespace as a Page preview", () => {
    expect(
      buildPublicationPreviews(
        [
          {
            context: ContentContext.DeveloperPortal,
            path: "/docs/authentication",
            status: "draft",
            templateKey: "developer-default",
          },
        ],
        {
          [ContentContext.Frontend]: "Frontend preview",
          [ContentContext.DeveloperPortal]: "Developer Portal preview",
        },
        {
          [ContentContext.Frontend]: "https://musiccloud.io",
          [ContentContext.DeveloperPortal]: "https://developer.musiccloud.io",
        },
      ),
    ).toEqual([]);
  });
});

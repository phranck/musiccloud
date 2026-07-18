import { ContentContext } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";

import {
  createInitialPublicationsState,
  isPublicationDirty,
  PublicationsActionType,
  PublicationValidationCode,
  publicationDirtySlugs,
  publicationsReducer,
} from "@/features/content/state/slices/publicationsSlice";

const FRONTEND_PUBLICATION = {
  context: ContentContext.Frontend,
  path: "/privacy",
  status: "published" as const,
  templateKey: "frontend-default",
};

function hydratedState() {
  return publicationsReducer(createInitialPublicationsState(), {
    type: PublicationsActionType.Hydrate,
    entries: [
      {
        slug: "privacy",
        pageId: "page-privacy",
        contextMask: ContentContext.Frontend,
        publications: [FRONTEND_PUBLICATION],
      },
    ],
  });
}

describe("publicationsReducer", () => {
  it("hydrates stable identity and contextual publication state", () => {
    const state = hydratedState();

    expect(state.pages.privacy).toMatchObject({
      pageId: "page-privacy",
      initial: {
        contextMask: ContentContext.Frontend,
        publications: [FRONTEND_PUBLICATION],
      },
      current: {
        contextMask: ContentContext.Frontend,
        publications: [FRONTEND_PUBLICATION],
      },
    });
    expect(isPublicationDirty(state, "privacy")).toBe(false);
  });

  it("never hydrates system-owned Docs publications into editor state", () => {
    const state = publicationsReducer(createInitialPublicationsState(), {
      type: PublicationsActionType.Hydrate,
      entries: [
        {
          slug: "docs-authentication",
          pageId: "page-docs-authentication",
          contextMask: ContentContext.DeveloperPortal,
          publications: [
            {
              context: ContentContext.DeveloperPortal,
              path: "/docs/authentication",
              status: "draft",
              templateKey: "developer-default",
            },
          ],
        },
      ],
    });

    expect(state.pages).toEqual({});
    expect(publicationDirtySlugs(state)).toEqual([]);
  });

  it("activates Developer Portal with safe draft defaults", () => {
    const state = publicationsReducer(hydratedState(), {
      type: PublicationsActionType.ToggleContext,
      slug: "privacy",
      context: ContentContext.DeveloperPortal,
      enabled: true,
    });

    expect(state.pages.privacy.current).toEqual({
      contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
      publications: [
        FRONTEND_PUBLICATION,
        {
          context: ContentContext.DeveloperPortal,
          path: "/privacy",
          status: "draft",
          templateKey: "developer-default",
        },
      ],
    });
    expect(isPublicationDirty(state, "privacy")).toBe(true);
  });

  it("tracks path changes and resets them", () => {
    const changed = publicationsReducer(hydratedState(), {
      type: PublicationsActionType.SetField,
      slug: "privacy",
      context: ContentContext.Frontend,
      field: "path",
      value: "/legal/privacy",
    });

    expect(changed.pages.privacy.current.publications[0]?.path).toBe("/legal/privacy");
    expect(isPublicationDirty(changed, "privacy")).toBe(true);

    const reset = publicationsReducer(changed, { type: PublicationsActionType.Reset });
    expect(reset.pages.privacy.current.publications[0]?.path).toBe("/privacy");
    expect(isPublicationDirty(reset, "privacy")).toBe(false);
  });

  it("refuses to disable the final active context", () => {
    const state = publicationsReducer(hydratedState(), {
      type: PublicationsActionType.ToggleContext,
      slug: "privacy",
      context: ContentContext.Frontend,
      enabled: false,
    });

    expect(state.pages.privacy.current.contextMask).toBe(ContentContext.Frontend);
    expect(state.pages.privacy.validationCode).toBe(PublicationValidationCode.LastContext);
  });

  it("refuses context removal while navigation still depends on it", () => {
    const shared = publicationsReducer(hydratedState(), {
      type: PublicationsActionType.ToggleContext,
      slug: "privacy",
      context: ContentContext.DeveloperPortal,
      enabled: true,
    });
    const withDependency = publicationsReducer(shared, {
      type: PublicationsActionType.SetNavigationDependencies,
      slug: "privacy",
      contextMask: ContentContext.DeveloperPortal,
    });
    const state = publicationsReducer(withDependency, {
      type: PublicationsActionType.ToggleContext,
      slug: "privacy",
      context: ContentContext.DeveloperPortal,
      enabled: false,
    });

    expect(state.pages.privacy.current.contextMask).toBe(ContentContext.Frontend | ContentContext.DeveloperPortal);
    expect(state.pages.privacy.validationCode).toBe(PublicationValidationCode.NavigationDependency);
  });

  it("retains navigation dependencies when a save response rehydrates the page", () => {
    const withDependency = publicationsReducer(hydratedState(), {
      type: PublicationsActionType.SetNavigationDependencies,
      slug: "privacy",
      contextMask: ContentContext.Frontend,
    });
    const state = publicationsReducer(withDependency, {
      type: PublicationsActionType.Hydrate,
      entries: [
        {
          slug: "privacy",
          pageId: "page-privacy",
          contextMask: ContentContext.Frontend,
          publications: [FRONTEND_PUBLICATION],
        },
      ],
    });

    expect(state.pages.privacy.navigationContextMask).toBe(ContentContext.Frontend);
  });
});

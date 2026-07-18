import {
  ContentContext,
  type ContentContextMask,
  type ContentPublication,
  type SingleContentContext,
} from "@musiccloud/shared";

import { isSystemOwnedPublication } from "@/features/content/editorialPageOwnership";

export interface PublicationFields {
  contextMask: ContentContextMask;
  publications: ContentPublication[];
}

export const PublicationValidationCode = {
  LastContext: "last-context",
  NavigationDependency: "navigation-dependency",
} as const;

export type PublicationValidationCode = (typeof PublicationValidationCode)[keyof typeof PublicationValidationCode];

export interface PublicationPageState {
  pageId: string;
  initial: PublicationFields;
  current: PublicationFields;
  navigationContextMask: ContentContextMask;
  validationCode: PublicationValidationCode | null;
}

export interface PublicationsState {
  pages: Record<string, PublicationPageState>;
}

export const PublicationsActionType = {
  Hydrate: "hydrate",
  ToggleContext: "toggle-context",
  SetField: "set-field",
  SetNavigationDependencies: "set-navigation-dependencies",
  Reset: "reset",
} as const;

type PublicationField = "path" | "status" | "templateKey";

export type PublicationsAction =
  | {
      type: typeof PublicationsActionType.Hydrate;
      entries: Array<{
        slug: string;
        pageId: string;
        contextMask: ContentContextMask;
        publications: ContentPublication[];
      }>;
    }
  | {
      type: typeof PublicationsActionType.ToggleContext;
      slug: string;
      context: SingleContentContext;
      enabled: boolean;
      defaultPath?: string;
    }
  | {
      type: typeof PublicationsActionType.SetField;
      slug: string;
      context: SingleContentContext;
      field: PublicationField;
      value: ContentPublication[PublicationField];
    }
  | {
      type: typeof PublicationsActionType.SetNavigationDependencies;
      slug: string;
      contextMask: ContentContextMask;
    }
  | { type: typeof PublicationsActionType.Reset };

export function createInitialPublicationsState(): PublicationsState {
  return { pages: {} };
}

function copyFields(fields: PublicationFields): PublicationFields {
  return {
    contextMask: fields.contextMask,
    publications: fields.publications.map((publication) => ({ ...publication })),
  };
}

function defaultPublication(context: SingleContentContext, slug: string, defaultPath?: string): ContentPublication {
  return {
    context,
    path: defaultPath ?? `/${slug}`,
    status: "draft",
    templateKey: context === ContentContext.Frontend ? "frontend-default" : "developer-default",
  };
}

function updatePage(
  state: PublicationsState,
  slug: string,
  updater: (page: PublicationPageState) => PublicationPageState,
): PublicationsState {
  const page = state.pages[slug];
  if (!page) return state;
  return { pages: { ...state.pages, [slug]: updater(page) } };
}

export function publicationsReducer(state: PublicationsState, action: PublicationsAction): PublicationsState {
  switch (action.type) {
    case PublicationsActionType.Hydrate: {
      const pages: PublicationsState["pages"] = {};
      for (const entry of action.entries) {
        if (entry.publications.some((publication) => isSystemOwnedPublication(publication.context, publication.path))) {
          continue;
        }
        const fields = { contextMask: entry.contextMask, publications: entry.publications };
        pages[entry.slug] = {
          pageId: entry.pageId,
          initial: copyFields(fields),
          current: copyFields(fields),
          navigationContextMask: state.pages[entry.slug]?.navigationContextMask ?? 0,
          validationCode: null,
        };
      }
      return { pages };
    }
    case PublicationsActionType.ToggleContext:
      return updatePage(state, action.slug, (page) => {
        const active = (page.current.contextMask & action.context) === action.context;
        if (active === action.enabled) return { ...page, validationCode: null };
        if (!action.enabled) {
          if (page.current.contextMask === action.context) {
            return { ...page, validationCode: PublicationValidationCode.LastContext };
          }
          if ((page.navigationContextMask & action.context) === action.context) {
            return { ...page, validationCode: PublicationValidationCode.NavigationDependency };
          }
          return {
            ...page,
            validationCode: null,
            current: {
              contextMask: page.current.contextMask & ~action.context,
              publications: page.current.publications.filter((publication) => publication.context !== action.context),
            },
          };
        }
        return {
          ...page,
          validationCode: null,
          current: {
            contextMask: page.current.contextMask | action.context,
            publications: [
              ...page.current.publications,
              defaultPublication(action.context, action.slug, action.defaultPath),
            ].sort((left, right) => left.context - right.context),
          },
        };
      });
    case PublicationsActionType.SetField:
      return updatePage(state, action.slug, (page) => ({
        ...page,
        validationCode: null,
        current: {
          ...page.current,
          publications: page.current.publications.map((publication) =>
            publication.context === action.context ? { ...publication, [action.field]: action.value } : publication,
          ),
        },
      }));
    case PublicationsActionType.SetNavigationDependencies:
      return updatePage(state, action.slug, (page) => ({
        ...page,
        navigationContextMask: action.contextMask,
        validationCode: null,
      }));
    case PublicationsActionType.Reset:
      return {
        pages: Object.fromEntries(
          Object.entries(state.pages).map(([slug, page]) => [
            slug,
            { ...page, current: copyFields(page.initial), validationCode: null },
          ]),
        ),
      };
  }
}

export function isPublicationDirty(state: PublicationsState, slug: string): boolean {
  const page = state.pages[slug];
  if (!page) return false;
  return JSON.stringify(page.initial) !== JSON.stringify(page.current);
}

export function publicationDirtySlugs(state: PublicationsState): string[] {
  return Object.keys(state.pages).filter((slug) => isPublicationDirty(state, slug));
}

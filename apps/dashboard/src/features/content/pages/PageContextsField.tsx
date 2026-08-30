import { ContentContext, type ContentPage, type SingleContentContext } from "@musiccloud/shared";

import { dashboardCopy } from "@/copy/dashboard";
import { PageContextControl } from "@/features/content/pages/PageContextControl";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import { PublicationsActionType, PublicationValidationCode } from "@/features/content/state/slices/publicationsSlice";

interface PageContextsFieldProps {
  /** The page whose contexts are being switched. */
  page: ContentPage;
}

/**
 * The two context switches, for the metadata bar at the top of the editor.
 *
 * A context decides whether the page exists in the frontend, in the developer
 * portal, or in both, so it belongs beside the slug and the title settings
 * rather than in a card of its own: the publication cards below answer how the
 * page appears in each context, and these switches answer whether it is there
 * at all.
 *
 * Turning a context off refuses in two cases, and the control says which:
 * a page must keep one context, and a context a navigation entry points at
 * cannot be dropped from under it.
 *
 * @param props - See {@link PageContextsFieldProps}.
 * @returns The two switches, with a validation line under them when a change was refused.
 */
export function PageContextsField({ page }: PageContextsFieldProps) {
  const pageMessages = dashboardCopy.content.pages;
  const editor = usePagesEditor();
  const publicationPage = editor.publications.pages[page.slug];
  const contextMask = publicationPage?.current.contextMask ?? page.contextMask;
  const navigationContextMask = publicationPage?.navigationContextMask ?? 0;
  const validationMessage =
    navigationContextMask !== 0 || publicationPage?.validationCode === PublicationValidationCode.NavigationDependency
      ? pageMessages.publication.navigationDependency
      : publicationPage?.validationCode === PublicationValidationCode.LastContext
        ? pageMessages.contextRequired
        : null;

  return (
    <PageContextControl
      value={contextMask}
      blockedContextMask={navigationContextMask}
      labels={{
        [ContentContext.Frontend]: pageMessages.contexts.frontend,
        [ContentContext.DeveloperPortal]: pageMessages.contexts.developerPortal,
      }}
      validationMessage={validationMessage}
      onChange={(value) => {
        const changedContext = (contextMask ^ value) as SingleContentContext;
        editor.dispatch.publications({
          type: PublicationsActionType.ToggleContext,
          slug: page.slug,
          context: changedContext,
          enabled: (value & changedContext) === changedContext,
        });
      }}
    />
  );
}

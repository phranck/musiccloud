import {
  ContentContext,
  type ContentPage,
  type ContentPublication,
  type SingleContentContext,
} from "@musiccloud/shared";

import { dashboardCopy } from "@/copy/dashboard";
import { PageDisplaySettings } from "@/features/content/pages/PageDisplaySettings";
import { PagePublicationSettings } from "@/features/content/pages/PagePublicationSettings";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import type { MetaFields } from "@/features/content/state/slices/metaSlice";
import { defaultPublication, PublicationsActionType } from "@/features/content/state/slices/publicationsSlice";

/** The two contexts, in the order their cards stand: frontend first. */
const PUBLICATION_CONTEXTS: readonly SingleContentContext[] = [ContentContext.Frontend, ContentContext.DeveloperPortal];

interface PagePublishingEditorProps {
  page: ContentPage;
  meta: MetaFields;
  onMetaChange: <K extends keyof MetaFields>(field: K, value: MetaFields[K]) => void;
}

/**
 * Builds the publication a card shows for a context the page is not in.
 *
 * The card is still there, so it needs something to show. What the page last
 * had for that context is the honest answer, because switching the context back
 * on restores exactly that; where the page never had one, the defaults the
 * editor would create are shown instead.
 *
 * @param page - The page as the server holds it.
 * @param context - The context whose card is being filled.
 * @returns A publication to display, never written back whilst the context is off.
 */
function placeholderPublication(page: ContentPage, context: SingleContentContext): ContentPublication {
  const persisted = page.publications.find((publication) => publication.context === context);
  return persisted ?? defaultPublication(context, page.slug);
}

/**
 * The two publication cards, side by side, one per context.
 *
 * Both are always shown, so the editor reads the same whichever contexts a page
 * is in and turning one on does not rearrange the screen. A card whose context
 * is switched off is disabled rather than hidden, which says the setting exists
 * and where to reach it. The switches themselves stand in the metadata bar at
 * the top, in {@link PageContextsField}.
 *
 * @param props - See {@link PagePublishingEditorProps}.
 * @returns The frontend and developer-portal publication cards.
 */
export function PagePublishingEditor({ page, meta, onMetaChange }: PagePublishingEditorProps) {
  const pageMessages = dashboardCopy.content.pages;
  const editor = usePagesEditor();
  const publicationPage = editor.publications.pages[page.slug];
  const current = publicationPage?.current ?? {
    contextMask: page.contextMask,
    publications: page.publications,
  };

  return (
    <div className="grid gap-3 px-3 pt-3 lg:grid-cols-2">
      {PUBLICATION_CONTEXTS.map((context) => {
        const active = (current.contextMask & context) === context;
        const publication =
          current.publications.find((candidate) => candidate.context === context) ??
          placeholderPublication(page, context);

        return (
          <PagePublicationSettings
            key={context}
            publication={publication}
            disabled={!active}
            markdownValid={page.markdownValidation?.ok ?? true}
            labels={{
              frontendTitle: pageMessages.publication.frontendTitle,
              developerPortalTitle: pageMessages.publication.developerPortalTitle,
              path: pageMessages.publication.path,
              status: pageMessages.publication.status,
              template: pageMessages.publication.template,
              draft: pageMessages.status.draft,
              published: pageMessages.status.published,
              hidden: pageMessages.status.hidden,
              markdownInvalid: pageMessages.publication.markdownInvalid,
              docsReserved: pageMessages.docsReserved,
            }}
            onChange={(patch) => {
              for (const [field, value] of Object.entries(patch)) {
                if (value === undefined) continue;
                editor.dispatch.publications({
                  type: PublicationsActionType.SetField,
                  slug: page.slug,
                  context,
                  field: field as "path" | "status" | "templateKey",
                  value,
                });
              }
            }}
          >
            {context === ContentContext.Frontend && (
              <PageDisplaySettings
                displayMode={meta.displayMode}
                overlayWidth={meta.overlayWidth}
                contentCardStyle={meta.contentCardStyle}
                onChange={(patch) => {
                  if (patch.displayMode !== undefined) onMetaChange("displayMode", patch.displayMode);
                  if (patch.overlayWidth !== undefined) onMetaChange("overlayWidth", patch.overlayWidth);
                  if (patch.contentCardStyle !== undefined) onMetaChange("contentCardStyle", patch.contentCardStyle);
                }}
              />
            )}
          </PagePublicationSettings>
        );
      })}
    </div>
  );
}

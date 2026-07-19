import { ContentContext, type ContentPage, type SingleContentContext } from "@musiccloud/shared";
import { EyeIcon } from "@phosphor-icons/react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { dashboardCopy } from "@/copy/dashboard";
import { PageContextControl } from "@/features/content/pages/PageContextControl";
import { PageDisplaySettings } from "@/features/content/pages/PageDisplaySettings";
import { PagePublicationSettings } from "@/features/content/pages/PagePublicationSettings";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import type { MetaFields } from "@/features/content/state/slices/metaSlice";
import { PublicationsActionType, PublicationValidationCode } from "@/features/content/state/slices/publicationsSlice";

interface PagePublishingEditorProps {
  page: ContentPage;
  meta: MetaFields;
  onMetaChange: <K extends keyof MetaFields>(field: K, value: MetaFields[K]) => void;
}

export function PagePublishingEditor({ page, meta, onMetaChange }: PagePublishingEditorProps) {
  const messages = dashboardCopy;
  const pageMessages = messages.content.pages;
  const editor = usePagesEditor();
  const publicationPage = editor.publications.pages[page.slug];
  const current = publicationPage?.current ?? {
    contextMask: page.contextMask,
    publications: page.publications,
  };
  const navigationContextMask = publicationPage?.navigationContextMask ?? 0;
  const validationMessage =
    navigationContextMask !== 0 || publicationPage?.validationCode === PublicationValidationCode.NavigationDependency
      ? pageMessages.publication.navigationDependency
      : publicationPage?.validationCode === PublicationValidationCode.LastContext
        ? pageMessages.contextRequired
        : null;

  return (
    <div className="grid gap-3 px-3 pt-3 lg:grid-cols-2">
      <DashboardSection>
        <DashboardSection.Header
          icon={<EyeIcon weight="duotone" className="size-4" />}
          title={pageMessages.contexts.label}
        />
        <DashboardSection.Body>
          <PageContextControl
            value={current.contextMask}
            blockedContextMask={navigationContextMask}
            labels={{
              [ContentContext.Frontend]: pageMessages.contexts.frontend,
              [ContentContext.DeveloperPortal]: pageMessages.contexts.developerPortal,
            }}
            validationMessage={validationMessage}
            onChange={(value) => {
              const changedContext = (current.contextMask ^ value) as SingleContentContext;
              editor.dispatch.publications({
                type: PublicationsActionType.ToggleContext,
                slug: page.slug,
                context: changedContext,
                enabled: (value & changedContext) === changedContext,
              });
            }}
          />
        </DashboardSection.Body>
      </DashboardSection>

      {current.publications.map((publication) => (
        <PagePublicationSettings
          key={publication.context}
          publication={publication}
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
                context: publication.context,
                field: field as "path" | "status" | "templateKey",
                value,
              });
            }
          }}
        >
          {publication.context === ContentContext.Frontend && (
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
      ))}
    </div>
  );
}

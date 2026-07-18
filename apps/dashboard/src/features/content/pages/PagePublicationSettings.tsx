import { DashboardInput } from "@musiccloud/dashboard-ui";
import { ContentContext, type ContentPublication, type ContentStatus } from "@musiccloud/shared";
import { BrowserIcon, CodeIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { isSystemOwnedPublication } from "@/features/content/editorialPageOwnership";
import { ContentPublicationStatus } from "@/features/content/publicationDrafts";
import { FormLabel } from "@/shared/ui/FormPrimitives";

export interface PagePublicationSettingsLabels {
  frontendTitle: string;
  developerPortalTitle: string;
  path: string;
  status: string;
  template: string;
  draft: string;
  published: string;
  hidden: string;
  markdownInvalid: string;
  docsReserved: string;
}

const DEFAULT_LABELS: PagePublicationSettingsLabels = {
  frontendTitle: "Frontend publication",
  developerPortalTitle: "Developer Portal publication",
  path: "Path",
  status: "Status",
  template: "Template",
  draft: "Draft",
  published: "Published",
  hidden: "Hidden",
  markdownInvalid: "Fix cross-context Markdown errors before publishing.",
  docsReserved: "The complete /docs namespace is system-owned.",
};

interface PagePublicationSettingsProps {
  publication: ContentPublication;
  markdownValid?: boolean;
  labels?: Partial<PagePublicationSettingsLabels>;
  children?: ReactNode;
  onChange: (patch: Partial<Omit<ContentPublication, "context">>) => void;
}

export function PagePublicationSettings({
  publication,
  markdownValid = true,
  labels: labelOverrides,
  children,
  onChange,
}: PagePublicationSettingsProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const isFrontend = publication.context === ContentContext.Frontend;
  const title = isFrontend ? labels.frontendTitle : labels.developerPortalTitle;
  const statusOptions: DropdownOption<ContentStatus>[] = [
    { value: ContentPublicationStatus.Draft, label: labels.draft },
    ...(markdownValid || publication.status === ContentPublicationStatus.Published
      ? [{ value: ContentPublicationStatus.Published, label: labels.published }]
      : []),
    { value: ContentPublicationStatus.Hidden, label: labels.hidden },
  ];
  const defaultTemplate = isFrontend ? "frontend-default" : "developer-default";
  const templateOptions: DropdownOption<string>[] = Array.from(new Set([publication.templateKey, defaultTemplate])).map(
    (templateKey) => ({ value: templateKey, label: templateKey }),
  );
  const docsReserved = isSystemOwnedPublication(publication.context, publication.path);

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={
          isFrontend ? (
            <BrowserIcon weight="duotone" className="size-4" />
          ) : (
            <CodeIcon weight="duotone" className="size-4" />
          )
        }
        title={title}
      />
      <DashboardSection.Body>
        <div>
          <FormLabel htmlFor={`page-publication-path-${publication.context}`}>{labels.path}</FormLabel>
          <DashboardInput
            id={`page-publication-path-${publication.context}`}
            aria-label={labels.path}
            value={publication.path}
            onChange={(event) => onChange({ path: event.target.value })}
          />
          {docsReserved && (
            <p role="alert" className="mt-1 text-xs text-[var(--ds-danger-text)]">
              {labels.docsReserved}
            </p>
          )}
        </div>
        <Dropdown<ContentStatus>
          aria-label={labels.status}
          label={labels.status}
          value={publication.status}
          options={statusOptions}
          onChange={(status) => onChange({ status })}
        />
        {!markdownValid && (
          <p role="alert" className="text-xs text-[var(--ds-danger-text)]">
            {labels.markdownInvalid}
          </p>
        )}
        <Dropdown
          aria-label={labels.template}
          label={labels.template}
          value={publication.templateKey}
          options={templateOptions}
          onChange={(templateKey) => onChange({ templateKey })}
        />
        {children}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

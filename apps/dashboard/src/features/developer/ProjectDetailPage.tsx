import { DashboardActionButton, DashboardActionId, StatusBadge } from "@musiccloud/dashboard-ui";
import { ApiTokenStatus, DeveloperProjectStatus } from "@musiccloud/shared";
import { Code as CodeIcon, SpinnerGap as SpinnerGapIcon, Stack as StackIcon } from "@phosphor-icons/react";
import { useNavigate, useParams } from "react-router";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { dashboardCopy } from "@/copy/dashboard";
import type { ApiClientResponse, DeveloperProjectResponse } from "@/features/developer/api";
import { ProjectAuditSection } from "@/features/developer/components/ProjectAuditSection";
import { ProjectPlanSection } from "@/features/developer/components/ProjectPlanSection";
import { ProjectUsageSection } from "@/features/developer/components/ProjectUsageSection";
import { useDeveloperProject, useUpdateDeveloperProject } from "@/features/developer/hooks/useDeveloperData";
import { formatEnglishDate } from "@/lib/format";
import { FormLabelText, FormValue } from "@/shared/ui/FormPrimitives";

const messages = dashboardCopy;
const dm = messages.developer;

/**
 * One registration under the project, as a row in the registrations section.
 */
function RegistrationRow({ registration }: { registration: ApiClientResponse }) {
  const activeTokens = registration.tokens.filter((token) => token.status === ApiTokenStatus.Active).length;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--ds-border)] py-3 last:border-0">
      <span className="font-medium text-[var(--ds-text)]">{registration.appName}</span>
      <span className="text-xs text-[var(--ds-text-muted)]">
        {registration.registrationType} · {registration.publicClientId}
      </span>
      <span className="text-xs text-[var(--ds-text-muted)]">
        {dm.clientsTokensLabel}: {activeTokens}
      </span>
      <StatusBadge status={registration.status} />
    </li>
  );
}

/**
 * The plan, the quota and the registrations of one Developer Project.
 *
 * A project owns the subscription that grants its limits and the registrations
 * that share them, so this is where an operator answers why a developer is
 * being throttled. Suspending stops every token under the project without
 * revoking any, which the screen says before the action rather than after it.
 *
 * Its audit trail closes the page, so the same screen that shows a limit shows
 * who set it.
 */
export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useDeveloperProject(id!);
  const updateProject = useUpdateDeveloperProject();

  function handleBack(project?: DeveloperProjectResponse) {
    navigate(project ? `/developer/accounts/${project.developerAccountId}` : "/developer/accounts");
  }

  if (isLoading || !data) {
    return (
      <PageLayout>
        <PageHeader
          title=""
          renderLeading={() => <HeaderBackButton label={dm.projectDetailBackLabel} onClick={() => handleBack()} />}
        />
        <div className="flex items-center justify-center py-12">
          <SpinnerGapIcon className="w-6 h-6 animate-spin text-[var(--ds-text-muted)]" />
        </div>
      </PageLayout>
    );
  }

  const { project, registrations } = data;
  const isSuspended = project.status === DeveloperProjectStatus.Suspended;
  const isDeleted = project.status === DeveloperProjectStatus.Deleted;

  function handleToggleStatus() {
    updateProject.mutate({
      id: id!,
      status: isSuspended ? DeveloperProjectStatus.Active : DeveloperProjectStatus.Suspended,
    });
  }

  return (
    <PageLayout>
      <PageHeader
        title={project.displayName}
        renderLeading={() => <HeaderBackButton label={dm.projectDetailBackLabel} onClick={() => handleBack(project)} />}
      />
      <div className="space-y-4">
        <DashboardSection className="overflow-hidden">
          <DashboardSection.Header
            icon={<StackIcon weight="duotone" className="size-4" />}
            title={dm.projectDetailTitle}
          />
          <DashboardSection.Body>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FormLabelText>{dm.colStatus}</FormLabelText>
                <StatusBadge status={project.status} />
              </div>
              <div>
                <FormLabelText>{dm.colCreated}</FormLabelText>
                <FormValue>{formatEnglishDate(project.createdAt)}</FormValue>
              </div>
            </div>
          </DashboardSection.Body>
          {!isDeleted && (
            <DashboardSection.Footer>
              <DashboardActionButton
                action={DashboardActionId.Reject}
                label={isSuspended ? dm.projectReactivate : dm.projectSuspend}
                onClick={handleToggleStatus}
                disabled={updateProject.isPending}
                type="button"
                className="!bg-amber-500/20 !text-amber-400 !border-amber-500/30 hover:!bg-amber-500/30"
              />
            </DashboardSection.Footer>
          )}
          <div className="px-4 pb-4">
            <p className="text-xs text-[var(--ds-text-muted)]">
              {isDeleted ? dm.projectDeletedHint : dm.projectSuspendHint}
            </p>
          </div>
        </DashboardSection>

        <ProjectPlanSection project={project} subscription={data.subscription} />

        <ProjectUsageSection projectId={project.id} />

        <ProjectAuditSection projectId={project.id} />

        <DashboardSection className="overflow-hidden">
          <DashboardSection.Header
            icon={<CodeIcon weight="duotone" className="size-4" />}
            title={dm.projectRegistrationsTitle}
          />
          <DashboardSection.Body>
            {registrations.length === 0 ? (
              <p className="text-sm text-[var(--ds-text-muted)]">{dm.projectRegistrationsEmpty}</p>
            ) : (
              <ul className="flex flex-col">
                {registrations.map((registration) => (
                  <RegistrationRow key={registration.id} registration={registration} />
                ))}
              </ul>
            )}
          </DashboardSection.Body>
        </DashboardSection>
      </div>
    </PageLayout>
  );
}

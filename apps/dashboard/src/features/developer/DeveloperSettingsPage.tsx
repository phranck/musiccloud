import { DashboardActionButton, DashboardActionId, DashboardInput } from "@musiccloud/dashboard-ui";
import {
  isAssignableMaxProjects,
  MAX_MAX_PROJECTS_PER_ACCOUNT,
  MIN_MAX_PROJECTS_PER_ACCOUNT,
} from "@musiccloud/shared";
import { GearSixIcon, SlidersIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { SwitchGroup } from "@/components/ui/SwitchGroup";
import { dashboardCopy } from "@/copy/dashboard";
import {
  type DeveloperLimits,
  type DeveloperPortalAvailability,
  type DeveloperPortalAvailabilityChange,
  type DeveloperPortalAvailabilityState,
  fetchDeveloperLimits,
  fetchDeveloperPortalAvailability,
  updateDeveloperLimits,
  updateDeveloperPortalAvailability,
} from "@/features/developer/api";
import { CreemSellingModeSection } from "@/features/developer/components/CreemSellingModeSection";
import { PortalInvitationsSection } from "@/features/developer/components/PortalInvitationsSection";
import { formatAdminName, formatEnglishDate } from "@/lib/format";

const PORTAL_AVAILABILITY_QUERY_KEY = ["admin", "developer", "portal-availability"] as const;
const DEVELOPER_LIMITS_QUERY_KEY = ["admin", "developer", "limits"] as const;
const CLOSED_PORTAL: DeveloperPortalAvailabilityState = { public: false, maintenance: false, lastChange: null };

/**
 * Names the state a change put the portal in.
 *
 * Maintenance comes first because the gate shows the maintenance page
 * whatever the public switch says.
 *
 * @param availability - The two switches.
 * @returns The state's label.
 */
function portalStateLabel(availability: DeveloperPortalAvailability): string {
  const dm = dashboardCopy.developer;
  if (availability.maintenance) return dm.portalStateMaintenance;
  return availability.public ? dm.portalStatePublic : dm.portalStateClosed;
}

/**
 * Says since when the portal has been in its current state and who put it there.
 *
 * @param change - The newest recorded change.
 * @returns The sentence for the availability card.
 */
function describeLastChange(change: DeveloperPortalAvailabilityChange): string {
  const dm = dashboardCopy.developer;
  const state = portalStateLabel(change);
  return dm.portalLastChange
    .replaceAll("{state}", state)
    .replaceAll("{when}", formatEnglishDate(change.occurredAt, { dateStyle: "medium", timeStyle: "short" }))
    .replaceAll("{name}", formatAdminName(change.actor) ?? change.actor.username);
}

/**
 * The self-service limits card: what a developer may do without asking.
 *
 * The field starts from what is stored and is only sent when the operator
 * saves, so a half-typed number never becomes the live ceiling. Save stays
 * off for a number the backend would refuse.
 *
 * @returns The limits card.
 */
function SelfServiceLimitsSection() {
  const messages = dashboardCopy;
  const dm = messages.developer;
  const queryClient = useQueryClient();
  const limitsQuery = useQuery({ queryKey: DEVELOPER_LIMITS_QUERY_KEY, queryFn: fetchDeveloperLimits });
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateMutation = useMutation({
    mutationFn: updateDeveloperLimits,
    onSuccess: (next: DeveloperLimits) => {
      queryClient.setQueryData(DEVELOPER_LIMITS_QUERY_KEY, next);
      setDraft(null);
      setSaved(true);
    },
  });

  const stored = limitsQuery.data?.maxProjectsPerAccount;
  const value = draft ?? (stored === undefined ? "" : String(stored));
  const parsed = Number(value);
  const canSave =
    value.trim() !== "" && isAssignableMaxProjects(parsed) && parsed !== stored && !updateMutation.isPending;

  return (
    <DashboardSection>
      <DashboardSection.Header icon={<SlidersIcon weight="duotone" className="size-4" />} title={dm.limitsTitle} />
      <DashboardSection.Body>
        <p className="text-sm text-[var(--ds-text-muted)]">{dm.limitsDescription}</p>
        <div className="flex items-end gap-4">
          <div>
            <label htmlFor="max-projects" className="block text-xs font-medium text-[var(--ds-text-muted)] mb-1">
              {dm.maxProjectsLabel}
            </label>
            <DashboardInput
              id="max-projects"
              type="number"
              min={MIN_MAX_PROJECTS_PER_ACCOUNT}
              max={MAX_MAX_PROJECTS_PER_ACCOUNT}
              value={value}
              onChange={(event) => {
                setDraft(event.target.value);
                setSaved(false);
              }}
            />
          </div>
          <p className="text-sm text-[var(--ds-text-muted)] pb-2">{dm.maxProjectsDescription}</p>
        </div>
        {limitsQuery.isError && <p className="text-sm text-[var(--ds-danger-text)]">{messages.common.saveError}</p>}
        {updateMutation.isError && <p className="text-sm text-[var(--ds-danger-text)]">{messages.common.saveError}</p>}
      </DashboardSection.Body>
      <DashboardSection.Footer>
        <DashboardActionButton
          action={DashboardActionId.Save}
          label={saved ? messages.common.saved : messages.common.save}
          onClick={() => updateMutation.mutate({ maxProjectsPerAccount: parsed })}
          disabled={!canSave}
          type="button"
        />
      </DashboardSection.Footer>
    </DashboardSection>
  );
}

/**
 * Owner-only controls for the public Developer Portal: whether it is open,
 * whom it admits while it is closed, how far self-service reaches, and which
 * Creem environment it sells from.
 */
export function DeveloperSettingsPage() {
  const messages = dashboardCopy;
  const dm = messages.developer;
  const queryClient = useQueryClient();
  const availabilityQuery = useQuery({
    queryKey: PORTAL_AVAILABILITY_QUERY_KEY,
    queryFn: fetchDeveloperPortalAvailability,
  });
  const availability = availabilityQuery.data ?? CLOSED_PORTAL;
  const [confirmingOpen, setConfirmingOpen] = useState(false);

  const updateMutation = useMutation({
    mutationFn: updateDeveloperPortalAvailability,
    onSuccess: (next) => {
      queryClient.setQueryData(PORTAL_AVAILABILITY_QUERY_KEY, next);
    },
  });

  function update(patch: Partial<DeveloperPortalAvailability>) {
    if (updateMutation.isPending) return;
    updateMutation.mutate({ public: availability.public, maintenance: availability.maintenance, ...patch });
  }

  // Opening the portal waits for a second press, because it makes registration
  // reachable for everyone. Closing it acts at once: that is what somebody in a
  // hurry needs, and it reaches nobody.
  function handlePublicChange(publicValue: boolean) {
    if (publicValue) {
      setConfirmingOpen(true);
      return;
    }
    if (confirmingOpen) {
      setConfirmingOpen(false);
      return;
    }
    update({ public: false });
  }

  const disabled = availabilityQuery.isLoading || updateMutation.isPending;
  const errorMessage = updateMutation.error instanceof Error ? updateMutation.error.message : messages.common.saveError;

  return (
    <PageLayout>
      <PageHeader title={dm.settingsTitle} />

      <div className="grid w-full gap-[var(--ds-space-base)]">
        <DashboardSection>
          <DashboardSection.Header
            icon={<GearSixIcon weight="duotone" className="size-4" />}
            title={dm.availabilityTitle}
          />
          <DashboardSection.Body>
            <p className="text-sm text-[var(--ds-text-muted)]">{dm.availabilityDescription}</p>
            <SwitchGroup>
              <SwitchGroup.Item
                id="portal-public"
                checked={confirmingOpen || availability.public}
                description={dm.portalPublicDescription}
                disabled={disabled}
                label={dm.portalPublicLabel}
                onChange={handlePublicChange}
              />
              <SwitchGroup.Item
                id="portal-maintenance"
                checked={availability.maintenance}
                description={dm.maintenanceDescription}
                disabled={disabled}
                label={dm.maintenanceLabel}
                onChange={(maintenance) => update({ maintenance })}
              />
            </SwitchGroup>
            {confirmingOpen && (
              <InlineConfirm
                message={dm.portalOpenWarning}
                confirmAction={DashboardActionId.Approve}
                confirmLabel={dm.portalOpenConfirm}
                onConfirm={() => {
                  setConfirmingOpen(false);
                  update({ public: true });
                }}
                onCancel={() => setConfirmingOpen(false)}
                disabled={updateMutation.isPending}
              />
            )}
            {availability.lastChange && (
              <p className="text-xs text-[var(--ds-text-muted)]">{describeLastChange(availability.lastChange)}</p>
            )}
            <p className="text-xs text-[var(--ds-text-muted)]">{dm.apiReferenceNotice}</p>
            {availabilityQuery.isError && (
              <p className="text-sm text-[var(--ds-danger-text)]">{messages.common.saveError}</p>
            )}
            {updateMutation.isError && <p className="text-sm text-[var(--ds-danger-text)]">{errorMessage}</p>}
          </DashboardSection.Body>
        </DashboardSection>

        <PortalInvitationsSection />

        <SelfServiceLimitsSection />

        <CreemSellingModeSection />
      </div>
    </PageLayout>
  );
}

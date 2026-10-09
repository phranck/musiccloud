import { DashboardActionButton, DashboardActionId, DashboardInput } from "@musiccloud/dashboard-ui";
import { GearSixIcon, SlidersIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { dashboardCopy } from "@/copy/dashboard";
import {
  type DeveloperLimits,
  type DeveloperPortalAvailability,
  fetchDeveloperLimits,
  fetchDeveloperPortalAvailability,
  updateDeveloperLimits,
  updateDeveloperPortalAvailability,
} from "@/features/developer/api";
import { CreemSellingModeSection } from "@/features/developer/components/CreemSellingModeSection";

const PORTAL_AVAILABILITY_QUERY_KEY = ["admin", "developer", "portal-availability"] as const;
const DEVELOPER_LIMITS_QUERY_KEY = ["admin", "developer", "limits"] as const;
const CLOSED_PORTAL: DeveloperPortalAvailability = { public: false, maintenance: false };

interface AvailabilitySettingRowProps {
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

/** A standard Dashboard settings row, with the text content and control as explicit slots. */
function AvailabilitySettingRow({ checked, description, disabled, label, onChange }: AvailabilitySettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-[var(--ds-space-sm)]">
      <div className="flex min-w-0 flex-col gap-[var(--ds-space-xs)]">
        <p className="text-sm font-medium text-[var(--ds-text)]">{label}</p>
        <p className="text-sm text-[var(--ds-text-muted)]">{description}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

/**
 * The self-service limits card: what a developer may do without asking.
 *
 * The field starts from what is stored and is only sent when the operator
 * saves, so a half-typed number never becomes the live ceiling.
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
    value.trim() !== "" && Number.isInteger(parsed) && parsed >= 1 && parsed !== stored && !updateMutation.isPending;

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
              min={1}
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

/** Owner-only controls for the availability state of the public Developer Portal. */
export function DeveloperSettingsPage() {
  const messages = dashboardCopy;
  const dm = messages.developer;
  const queryClient = useQueryClient();
  const availabilityQuery = useQuery({
    queryKey: PORTAL_AVAILABILITY_QUERY_KEY,
    queryFn: fetchDeveloperPortalAvailability,
  });
  const availability = availabilityQuery.data ?? CLOSED_PORTAL;

  const updateMutation = useMutation({
    mutationFn: updateDeveloperPortalAvailability,
    onSuccess: (next) => {
      queryClient.setQueryData(PORTAL_AVAILABILITY_QUERY_KEY, next);
    },
  });

  function update(patch: Partial<DeveloperPortalAvailability>) {
    if (updateMutation.isPending) return;
    updateMutation.mutate({ ...availability, ...patch });
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
            <AvailabilitySettingRow
              checked={availability.public}
              description={dm.portalPublicDescription}
              disabled={disabled}
              label={dm.portalPublicLabel}
              onChange={(publicValue) => update({ public: publicValue })}
            />
            <AvailabilitySettingRow
              checked={availability.maintenance}
              description={dm.maintenanceDescription}
              disabled={disabled}
              label={dm.maintenanceLabel}
              onChange={(maintenance) => update({ maintenance })}
            />
            <p className="text-xs text-[var(--ds-text-muted)]">{dm.apiReferenceNotice}</p>
            {availabilityQuery.isError && (
              <p className="text-sm text-[var(--ds-danger-text)]">{messages.common.saveError}</p>
            )}
            {updateMutation.isError && <p className="text-sm text-[var(--ds-danger-text)]">{errorMessage}</p>}
          </DashboardSection.Body>
        </DashboardSection>

        <SelfServiceLimitsSection />

        <CreemSellingModeSection />
      </div>
    </PageLayout>
  );
}

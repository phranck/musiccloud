import { GearSixIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useI18n } from "@/context/I18nContext";
import {
  type DeveloperPortalAvailability,
  fetchDeveloperPortalAvailability,
  updateDeveloperPortalAvailability,
} from "@/features/developer/api";

const PORTAL_AVAILABILITY_QUERY_KEY = ["admin", "developer", "portal-availability"] as const;
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

/** Owner-only controls for the availability state of the public Developer Portal. */
export function DeveloperSettingsPage() {
  const { messages } = useI18n();
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
      </div>
    </PageLayout>
  );
}

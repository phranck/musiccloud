import { DashboardActionButton, DashboardActionId, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import { CreditCard as CreditCardIcon } from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { dashboardCopy } from "@/copy/dashboard";
import type { CreemModeReadiness } from "@/features/developer/api";
import { CreemMode } from "@/features/developer/domain";
import { useCreemSellingMode, useUpdateCreemSellingMode } from "@/features/developer/hooks/useDeveloperData";

const messages = dashboardCopy;
const dm = messages.developer;

/** The environments in the order the switch offers them. */
const MODE_OPTIONS = [
  { value: CreemMode.Test, label: dm.creemEnvironmentTest },
  { value: CreemMode.Live, label: dm.creemEnvironmentLive },
] as const;

/** The label an operator reads for each environment. */
const MODE_LABEL: Record<CreemMode, string> = {
  [CreemMode.Test]: dm.creemEnvironmentTest,
  [CreemMode.Live]: dm.creemEnvironmentLive,
};

/**
 * Why an environment cannot be sold from, in a sentence, or `null` when it can.
 *
 * A switch that only refuses tells an operator nothing about what to do next,
 * so the reason is shown before it is pressed rather than after.
 *
 * @param readiness - What the server reported about that environment.
 * @returns The reason, or `null` when the environment is ready.
 */
function blockingReason(readiness: CreemModeReadiness | undefined): string | null {
  if (!readiness) return null;
  if (!readiness.hasKey) return dm.creemSellingNoKey.replaceAll("{mode}", MODE_LABEL[readiness.mode]);
  if (readiness.missingProducts.length > 0) {
    return dm.creemSellingMissingProducts
      .replaceAll("{mode}", MODE_LABEL[readiness.mode])
      .replaceAll("{plans}", readiness.missingProducts.join(", "));
  }
  return null;
}

/**
 * The switch that decides whether a purchase moves real money.
 *
 * It is separate from the environment tabs in the tier editor on purpose:
 * those say what an operator is maintaining, this says what a customer pays.
 * Keeping them apart is what lets the live products be built whilst the shop
 * still sells from the sandbox.
 *
 * Moving to Live asks for a second press. Every other control in this
 * dashboard is reversible by pressing it again; a charged card is not.
 *
 * @returns The selling environment card.
 */
export function CreemSellingModeSection() {
  const { data } = useCreemSellingMode();
  const updateSellingMode = useUpdateCreemSellingMode();
  const [confirmingLive, setConfirmingLive] = useState(false);

  const selling = data?.sellingMode ?? CreemMode.Test;
  const liveReason = blockingReason(data?.readiness.find((entry) => entry.mode === CreemMode.Live));
  const canGoLive = data !== undefined && liveReason === null;

  // Moving to the sandbox happens on the press. Moving to live asks first,
  // because it is the one control here whose effect is somebody's money.
  const handleChange = useCallback(
    (next: CreemMode) => {
      if (next === selling) return;
      if (next === CreemMode.Live) {
        setConfirmingLive(true);
        return;
      }
      updateSellingMode.mutate(next);
    },
    [selling, updateSellingMode],
  );

  // The control closes over the selling environment, so it is built once per
  // change rather than on every render of the card around it.
  const environmentSwitch = useMemo(
    () => (
      <SegmentedControl
        value={confirmingLive ? CreemMode.Live : selling}
        onChange={handleChange}
        options={MODE_OPTIONS}
      />
    ),
    [selling, confirmingLive, handleChange],
  );

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<CreditCardIcon weight="duotone" className="size-4" />}
        title={dm.creemSellingTitle}
        addOn={canGoLive ? environmentSwitch : undefined}
      />
      <DashboardSection.Body>
        <p className="text-sm text-[var(--ds-text-muted)]">{dm.creemSellingDescription}</p>

        <p className="text-sm text-[var(--ds-text)]">
          {dm.creemSellingCurrent}: <strong>{MODE_LABEL[selling]}</strong>
        </p>

        {selling === CreemMode.Test && <p className="text-xs text-[var(--ds-text-muted)]">{dm.creemSellingTestNote}</p>}

        {liveReason && <p className="text-xs text-amber-400">{liveReason}</p>}

        {confirmingLive && (
          <div>
            <p className="text-sm text-[var(--ds-danger-text)]">{dm.creemSellingLiveWarning}</p>
            <div className="mt-2 flex justify-end gap-2">
              <DashboardActionButton
                action={DashboardActionId.Cancel}
                icon={false}
                label={messages.common.cancel}
                onClick={() => setConfirmingLive(false)}
                type="button"
                variant={DashboardButtonVariant.Neutral}
              />
              <DashboardActionButton
                action={DashboardActionId.Save}
                label={dm.creemSellingConfirm}
                onClick={() => {
                  updateSellingMode.mutate(CreemMode.Live);
                  setConfirmingLive(false);
                }}
                disabled={updateSellingMode.isPending}
                type="button"
                variant={DashboardButtonVariant.Danger}
              />
            </div>
          </div>
        )}

        {updateSellingMode.isError && (
          <p className="text-sm text-[var(--ds-danger-text)]">
            {updateSellingMode.error instanceof Error ? updateSellingMode.error.message : messages.common.saveError}
          </p>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

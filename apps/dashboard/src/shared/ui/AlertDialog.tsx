import { DashboardActionButton, DashboardActionId, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import {
  Info as InfoIcon,
  SealWarning as SealWarningIcon,
  WarningCircle as WarningCircleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Dialog, dialogHeaderIconClass } from "./Dialog";

const AlertVariant = {
  Info: "info",
  Warning: "warning",
  Error: "error",
} as const;

type AlertVariant = (typeof AlertVariant)[keyof typeof AlertVariant];

const variantIcons: Record<AlertVariant, ReactNode> = {
  [AlertVariant.Info]: <InfoIcon weight="duotone" className={dialogHeaderIconClass} />,
  [AlertVariant.Warning]: (
    <SealWarningIcon weight="duotone" className={`${dialogHeaderIconClass} !text-[var(--ds-warning-text)]`} />
  ),
  [AlertVariant.Error]: (
    <WarningCircleIcon weight="duotone" className={`${dialogHeaderIconClass} !text-[var(--ds-danger-text)]`} />
  ),
};

interface AlertDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  variant?: AlertVariant;
  buttonLabel?: string;
  children: ReactNode;
}

export function AlertDialog({
  open,
  title,
  onClose,
  variant = AlertVariant.Info,
  buttonLabel = "OK",
  children,
}: AlertDialogProps) {
  return (
    <Dialog open={open} title={title} titleIcon={variantIcons[variant]} onClose={onClose}>
      <div className="px-6 py-4 text-sm text-[var(--ds-text)]">{children}</div>
      <Dialog.Footer>
        <DashboardActionButton
          action={DashboardActionId.Approve}
          icon={false}
          label={buttonLabel}
          onClick={onClose}
          variant={DashboardButtonVariant.Primary}
        />
      </Dialog.Footer>
    </Dialog>
  );
}

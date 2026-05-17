import { DashboardActionButton } from "@musiccloud/dashboard-ui";
import { InfoIcon, SealWarningIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Dialog, dialogHeaderIconClass } from "./Dialog";

type AlertVariant = "info" | "warning" | "error";

const variantIcons: Record<AlertVariant, ReactNode> = {
  info: <InfoIcon weight="duotone" className={dialogHeaderIconClass} />,
  warning: <SealWarningIcon weight="duotone" className={`${dialogHeaderIconClass} !text-[var(--ds-warning-text)]`} />,
  error: <WarningCircleIcon weight="duotone" className={`${dialogHeaderIconClass} !text-[var(--ds-danger-text)]`} />,
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
  variant = "info",
  buttonLabel = "OK",
  children,
}: AlertDialogProps) {
  return (
    <Dialog open={open} title={title} titleIcon={variantIcons[variant]} onClose={onClose}>
      <div className="px-6 py-4 text-sm text-[var(--ds-text)]">{children}</div>
      <Dialog.Footer>
        <DashboardActionButton action="approve" icon={false} label={buttonLabel} onClick={onClose} variant="primary" />
      </Dialog.Footer>
    </Dialog>
  );
}

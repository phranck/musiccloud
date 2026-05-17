import type { ReactNode } from "react";

import { OverlayCard } from "./OverlayCard";

interface DialogProps {
  open: boolean;
  title: string;
  titleIcon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: "sm" | "md";
}

interface DialogFooterProps {
  children: ReactNode;
  className?: string;
}

function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div
      className={`bg-[var(--ds-surface-inset)] border-t border-[var(--ds-border)] p-6 ${className ?? "flex justify-end gap-2"}`}
    >
      {children}
    </div>
  );
}

export const dialogHeaderIconClass = "w-6 h-6 shrink-0 text-[var(--ds-text-muted)]";

export function Dialog({ open, title, titleIcon, onClose, children, maxWidth = "sm" }: DialogProps) {
  const size = maxWidth === "md" ? "fixed-md" : "fixed-sm";

  return (
    <OverlayCard open={open} onClose={onClose} size={size} aria-label={title}>
      <div className="bg-[var(--ds-surface-inset)] px-6 py-4 flex items-center gap-3">
        {titleIcon}
        <h3 className="font-bold text-[var(--ds-text)]">{title}</h3>
      </div>
      {children}
    </OverlayCard>
  );
}

Dialog.Footer = DialogFooter;

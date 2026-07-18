import type { ReactNode } from "react";

interface PageContextValidationMessageProps {
  children: ReactNode;
}

export function PageContextValidationMessage({ children }: PageContextValidationMessageProps) {
  return (
    <p role="alert" className="text-xs text-[var(--ds-danger-text)]">
      {children}
    </p>
  );
}

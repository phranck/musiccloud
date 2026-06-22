import type { ReactNode } from "react";

/**
 * Props for {@link CcMetaRow}.
 *
 * @property label - The pre-translated row label (e.g. "License").
 * @property children - The value node (link or text) shown on the right.
 */
export interface CcMetaRowProps {
  label: string;
  children: ReactNode;
}

/**
 * A single label/value row inside the CC metadata well.
 *
 * Keeps the label muted and right-aligns the value so the licence and
 * attribution rows read as a compact definition list without hardcoding any
 * structural spacing outside the token cascade.
 *
 * @param label - The pre-translated row label (e.g. "License").
 * @param children - The value node (link or text).
 */
export function CcMetaRow({ label, children }: CcMetaRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="min-w-0 truncate text-right text-sm">{children}</span>
    </div>
  );
}

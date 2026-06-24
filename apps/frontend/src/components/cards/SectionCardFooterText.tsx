import type { ReactNode } from "react";
import { sectionCardFooterTextClassName } from "@/components/cards/sectionCardChromeStyles";

interface SectionCardFooterTextProps {
  /** The credit text to render. */
  children: ReactNode;
}

/**
 * Muted, centered credit text for a {@link import("./SectionCardShell").SectionCardShell}
 * footer slot. Wraps the shared footer-text styling so credit-style footers
 * (artist profile, events) stay consistent, while the footer slot itself stays
 * generic and can hold any content — e.g. a pager.
 */
export function SectionCardFooterText({ children }: SectionCardFooterTextProps) {
  return <p className={sectionCardFooterTextClassName}>{children}</p>;
}

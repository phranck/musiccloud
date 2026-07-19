import type { PageTitleAlignment as PageTitleAlignmentValue } from "@musiccloud/shared";

import { dashboardCopy } from "@/copy/dashboard";

interface Props {
  value: PageTitleAlignmentValue;
  onChange: (value: PageTitleAlignmentValue) => void;
  className?: string;
}

/**
 * Inline dropdown next to the "Titel anzeigen" checkbox in the content
 * editor metadata bar. Drives `content_pages.title_alignment`.
 */
export function PageTitleAlignment({ value, onChange, className }: Props) {
  const messages = dashboardCopy;
  const common = messages.common;
  return (
    <div className={`flex items-center gap-2${className ? ` ${className}` : ""}`}>
      <span className="font-medium">{common.alignment}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PageTitleAlignmentValue)}
        className="text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded px-1.5 py-0.5 text-[var(--ds-text)] focus:outline-none cursor-pointer"
      >
        <option value="left">{common.alignLeft}</option>
        <option value="center">{common.alignCenter}</option>
        <option value="right">{common.alignRight}</option>
      </select>
    </div>
  );
}

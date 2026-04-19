import type { PageTitleAlignment as PageTitleAlignmentValue } from "@musiccloud/shared";

import { useI18n } from "@/context/I18nContext";

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
  const { messages } = useI18n();
  const text = messages.content.editor;
  return (
    <div className={`flex items-center gap-2${className ? ` ${className}` : ""}`}>
      <span className="font-medium">{text.titleAlignmentLabel}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PageTitleAlignmentValue)}
        className="text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded px-1.5 py-0.5 text-[var(--ds-text)] focus:outline-none cursor-pointer"
      >
        <option value="left">{text.titleAlignmentLeft}</option>
        <option value="center">{text.titleAlignmentCenter}</option>
        <option value="right">{text.titleAlignmentRight}</option>
      </select>
    </div>
  );
}

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type FormField, FormFieldType } from "@musiccloud/shared";
import { SealWarningIcon, XCircleIcon } from "@phosphor-icons/react";

import { useI18n } from "@/context/I18nContext";

interface BuilderFieldProps {
  field: FormField;
  rowId: string;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

/** Two-to-three-letter badge per field type shown on the card's right edge. */
const TYPE_ABBR: Record<string, string> = {
  text: "Txt",
  email: "Em",
  textarea: "Ta",
  select: "Sel",
  "multi-select": "MSl",
  checkbox: "Cb",
  richtext: "Md",
  button: "Btn",
  password: "Pw",
  headline: "H",
  separator: "—",
  paragraph: "Abs",
};

/** Badge per `inputType` for `text` fields (the rendered `<input type>`). */
const INPUT_TYPE_ABBR: Record<string, string> = {
  text: "Txt",
  email: "Em",
  password: "Pw",
  url: "Url",
  tel: "Tel",
  date: "Dat",
  number: "Nr",
};

/**
 * Sortable field card displayed inside a builder row: label (or a muted
 * no-label hint), a required marker, a type badge, and a hover-only delete
 * button in the top-right corner. Clicking or pressing Enter/Space selects
 * the field for the config panel.
 */
export function BuilderField({ field, rowId, isSelected, onSelect, onDelete }: BuilderFieldProps) {
  const { messages } = useI18n();
  const ft = messages.formBuilder.fieldTypes;

  const sortableId = `field:${rowId}:${field.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: { fieldId: field.id, rowId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const typeLabels: Record<string, string> = {
    text: ft.text,
    email: ft.email,
    textarea: ft.textarea,
    select: ft.select,
    "multi-select": ft.multiSelect,
    checkbox: ft.checkbox,
    richtext: ft.richtext,
    button: ft.button,
    password: ft.password,
    headline: ft.headline,
    separator: ft.separator,
    paragraph: ft.paragraph,
  };

  const fieldAbbr =
    field.type === FormFieldType.Text
      ? (INPUT_TYPE_ABBR[field.inputType ?? "text"] ?? "Txt")
      : (TYPE_ABBR[field.type] ?? field.type.slice(0, 3));

  const isWide = (field.span ?? 12) > 2;

  return (
    // Wrapper div so the hover-only delete button is a SIBLING of the main
    // button — a nested <button> inside a <button> would be invalid HTML.
    <div ref={setNodeRef} style={style} className="group/field relative h-full w-full">
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={onSelect}
        className={`flex h-full w-full items-center px-3 py-2.5 rounded-control border text-sm cursor-pointer text-left ${
          isWide ? "justify-start gap-2" : "justify-center"
        } ${
          isSelected
            ? "border-[var(--color-primary)] bg-[var(--ds-nav-active-bg)]"
            : "border-[var(--ds-border)] bg-[var(--ds-input-bg)] hover:border-[var(--color-primary)]"
        }`}
      >
        {isWide ? (
          <>
            <span className="flex-1 min-w-0 truncate font-medium text-[var(--ds-text)]">
              {field.label || <span className="opacity-50 italic">{messages.formBuilder.noLabel}</span>}
              {field.required && field.type !== FormFieldType.RichText && (
                <SealWarningIcon
                  weight="duotone"
                  className="inline-block ml-1 size-3 text-[var(--ds-danger-text)] align-middle"
                />
              )}
              {field.type === FormFieldType.RichText && field.content && (
                <span className="ml-2 text-xs font-normal opacity-40 truncate">
                  {field.content.slice(0, 40).replace(/[#*_`\n]/g, " ")}…
                </span>
              )}
            </span>
            <span
              title={typeLabels[field.type] ?? field.type}
              className="shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-[var(--ds-border-subtle)] text-[var(--ds-text)]/60"
            >
              {fieldAbbr}
            </span>
          </>
        ) : (
          /* Narrow layout (1–2/12 columns): only the centered badge fits. */
          <span
            title={typeLabels[field.type] ?? field.type}
            className="px-1.5 py-0.5 rounded text-xs font-medium bg-[var(--ds-border-subtle)] text-[var(--ds-text)]/60"
          >
            {fieldAbbr}
          </span>
        )}
      </button>

      <button
        type="button"
        aria-label={messages.formBuilder.removeField}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute -top-3 -right-3 flex size-6 items-center justify-center rounded-full bg-[var(--ds-surface)] text-[var(--ds-text-subtle)] opacity-0 hover:text-[var(--ds-danger-text)] group-hover/field:opacity-100"
      >
        <XCircleIcon weight="fill" className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

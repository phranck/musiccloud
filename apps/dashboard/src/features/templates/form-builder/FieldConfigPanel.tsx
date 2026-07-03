import { DashboardInput, DashboardSegmentedControl, DashboardTextarea } from "@musiccloud/dashboard-ui";
import {
  type ButtonActionType,
  type FormField,
  FormFieldType,
  type InputType,
  type RichTextVariant,
} from "@musiccloud/shared";
import { lazy, Suspense } from "react";

import { useI18n } from "@/context/I18nContext";
import { Checkbox } from "@/shared/ui/Checkbox";
import { FormLabelText, formInputClass } from "@/shared/ui/FormPrimitives";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

interface FieldConfigPanelProps {
  field: FormField;
  onChange: (updated: FormField) => void;
  /** Every field in the form (id + label), for the button action's source-field picker. */
  allFields: { id: string; label: string }[];
}

/**
 * Configuration panel for the currently selected form field (ported from
 * lmaa.space). Which controls render depends on the field type: display-only
 * types expose only their content/appearance, input types add name,
 * placeholder, required, span and validation.
 *
 * Deliberate deviations from the lmaa original: the input-type picker and the
 * button-action source picker are native selects (musiccloud's form-control
 * convention) instead of icon dropdowns/comboboxes, the option-button groups
 * use `DashboardSegmentedControl`, and the `buttonIcon`/`buttonDisplay`
 * controls are NOT ported yet — they need a curated icon library that only
 * pays off together with the public form renderer (follow-up plan).
 */
export function FieldConfigPanel({ field, onChange, allFields }: FieldConfigPanelProps) {
  const { messages } = useI18n();
  const m = messages.formBuilder.panel;
  const isRichText = field.type === FormFieldType.RichText;
  const isButton = field.type === FormFieldType.Button;
  const isHeadline = field.type === FormFieldType.Headline;
  const isSeparator = field.type === FormFieldType.Separator;
  const isParagraph = field.type === FormFieldType.Paragraph;
  const isTextInput =
    field.type === FormFieldType.Text || field.type === FormFieldType.Email || field.type === FormFieldType.Password;
  const effectiveInputType: InputType =
    field.inputType ??
    (field.type === FormFieldType.Email ? "email" : field.type === FormFieldType.Password ? "password" : "text");

  const inputTypeOptions: { value: InputType; label: string }[] = [
    { value: "text", label: m.inputTypeText },
    { value: "email", label: m.inputTypeEmail },
    { value: "password", label: m.inputTypePassword },
    { value: "url", label: m.inputTypeUrl },
    { value: "tel", label: m.inputTypeTel },
    { value: "date", label: m.inputTypeDate },
    { value: "number", label: m.inputTypeNumber },
  ];
  const hasOptions = field.type === FormFieldType.Select || field.type === FormFieldType.MultiSelect;
  const hasValidationMinMax = isTextInput && effectiveInputType !== "date" && effectiveInputType !== "number";
  const hasMaxChars = field.type === FormFieldType.Textarea;
  const hasSubtext = isTextInput || field.type === FormFieldType.Textarea || field.type === FormFieldType.MultiSelect;
  const hasRows = field.type === FormFieldType.Textarea || isRichText;
  const hasPlaceholder =
    field.type !== FormFieldType.Checkbox && !isRichText && !isButton && !isHeadline && !isSeparator && !isParagraph;
  const isDisplayOnly = isRichText || isButton || isHeadline || isSeparator || isParagraph;

  /**
   * Updates a single property on the current field and notifies the parent.
   *
   * @param key - The {@link FormField} property to update.
   * @param value - The new value for the given property.
   */
  function set<K extends keyof FormField>(key: K, value: FormField[K]) {
    onChange({ ...field, [key]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      {isSeparator && <p className="text-xs text-[var(--ds-text-subtle)] italic">{m.separatorNoSettings}</p>}

      {isParagraph && (
        <label htmlFor="field-config-paragraph-content" className="flex flex-col gap-1">
          <FormLabelText>{m.content}</FormLabelText>
          <DashboardTextarea
            id="field-config-paragraph-content"
            rows={4}
            value={field.content ?? ""}
            onChange={(e) => set("content", e.target.value || undefined)}
            className="resize-none"
          />
        </label>
      )}

      {!isSeparator && !isParagraph && (
        <label htmlFor="field-config-label" className="flex flex-col gap-1">
          <FormLabelText>{m.label}</FormLabelText>
          <DashboardInput id="field-config-label" value={field.label} onChange={(e) => set("label", e.target.value)} />
        </label>
      )}

      {isTextInput && (
        <label htmlFor="field-config-input-type" className="flex flex-col gap-1">
          <FormLabelText>{m.inputType}</FormLabelText>
          <select
            id="field-config-input-type"
            value={effectiveInputType}
            onChange={(e) => onChange({ ...field, type: FormFieldType.Text, inputType: e.target.value as InputType })}
            className={formInputClass}
          >
            {inputTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isHeadline && (
        <div className="flex flex-col gap-1">
          <FormLabelText>{m.headlineLevel}</FormLabelText>
          <DashboardSegmentedControl
            aria-label={m.headlineLevel}
            value={field.headlineLevel ?? "h2"}
            onValueChange={(value) => set("headlineLevel", value as FormField["headlineLevel"])}
            options={[
              { value: "h1", label: m.headlineLevelH1 },
              { value: "h2", label: m.headlineLevelH2 },
              { value: "h3", label: m.headlineLevelH3 },
            ]}
          />
        </div>
      )}

      {!isDisplayOnly && (
        <label htmlFor="field-config-name" className="flex flex-col gap-1">
          <FormLabelText>{m.fieldName}</FormLabelText>
          <DashboardInput
            id="field-config-name"
            value={field.name ?? ""}
            onChange={(e) => set("name", e.target.value || undefined)}
            placeholder={field.id}
            className="font-mono"
          />
        </label>
      )}

      {isRichText && <RichTextFieldConfig field={field} onChange={onChange} m={m} />}

      {hasPlaceholder && (
        <label htmlFor="field-config-placeholder" className="flex flex-col gap-1">
          <FormLabelText>{m.placeholder}</FormLabelText>
          <DashboardInput
            id="field-config-placeholder"
            value={field.placeholder ?? ""}
            onChange={(e) => set("placeholder", e.target.value || undefined)}
          />
        </label>
      )}

      {hasMaxChars && (
        <label htmlFor="field-config-max-chars" className="flex flex-col gap-1">
          <FormLabelText>{m.maxChars}</FormLabelText>
          <DashboardInput
            id="field-config-max-chars"
            type="number"
            min={1}
            value={field.validation?.max ?? ""}
            onChange={(e) => {
              const val = e.target.value !== "" ? Number(e.target.value) : undefined;
              set("validation", { ...field.validation, max: val });
            }}
            placeholder="–"
          />
        </label>
      )}

      {hasSubtext && (
        <label htmlFor="field-config-subtext" className="flex flex-col gap-1">
          <FormLabelText>{m.subtext}</FormLabelText>
          <DashboardInput
            id="field-config-subtext"
            value={field.subtext ?? ""}
            onChange={(e) => set("subtext", e.target.value || undefined)}
          />
        </label>
      )}

      {!isDisplayOnly && (
        <Checkbox checked={field.required} label={m.required} onChange={(checked) => set("required", checked)} />
      )}

      {field.type === FormFieldType.Textarea && (
        <Checkbox
          checked={field.allowMarkdown ?? false}
          label={m.allowMarkdown}
          onChange={(checked) => set("allowMarkdown", checked || undefined)}
        />
      )}

      {!isRichText && !isButton && !isSeparator && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <FormLabelText>{m.span}</FormLabelText>
            <span className="text-xs tabular-nums text-[var(--ds-text-subtle)]">{field.span ?? 12}/12</span>
          </div>
          <div className="grid grid-cols-12 gap-0.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} ${m.spanAriaOf} 12`}
                onClick={() => set("span", n)}
                className={`h-4 rounded-sm ${
                  n <= (field.span ?? 12)
                    ? "bg-[var(--color-primary)]"
                    : "bg-[var(--ds-border)] hover:bg-[var(--ds-text-subtle)]"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {hasOptions && (
        <label htmlFor="field-config-options" className="flex flex-col gap-1">
          <FormLabelText>{m.options}</FormLabelText>
          <DashboardTextarea
            id="field-config-options"
            rows={4}
            value={(field.options ?? []).join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n").filter((l) => l.trim() !== "");
              set("options", lines.length > 0 ? lines : undefined);
            }}
            placeholder={m.optionsHint}
            className="resize-none"
          />
          <span className="text-xs text-[var(--ds-text-subtle)]">{m.optionsHint}</span>
        </label>
      )}

      {hasRows && (
        <label htmlFor="field-config-rows" className="flex flex-col gap-1">
          <FormLabelText>{m.rows}</FormLabelText>
          <DashboardInput
            id="field-config-rows"
            type="number"
            min={1}
            max={30}
            value={field.rows ?? ""}
            onChange={(e) => {
              const val = e.target.value !== "" ? Number(e.target.value) : undefined;
              set("rows", val);
            }}
            placeholder={isRichText ? "8" : "4"}
          />
        </label>
      )}

      {isButton && <ButtonFieldConfig field={field} onChange={onChange} allFields={allFields} m={m} />}

      {hasValidationMinMax && (
        <div className="flex flex-col gap-2">
          <FormLabelText>{m.validation}</FormLabelText>
          <div className="flex gap-2">
            <label htmlFor="field-config-validation-min" className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="text-xs text-[var(--ds-text-subtle)]">{m.validationMin}</span>
              <DashboardInput
                id="field-config-validation-min"
                type="number"
                value={field.validation?.min ?? ""}
                onChange={(e) => {
                  const val = e.target.value !== "" ? Number(e.target.value) : undefined;
                  set("validation", { ...field.validation, min: val });
                }}
              />
            </label>
            <label htmlFor="field-config-validation-max" className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="text-xs text-[var(--ds-text-subtle)]">{m.validationMax}</span>
              <DashboardInput
                id="field-config-validation-max"
                type="number"
                value={field.validation?.max ?? ""}
                onChange={(e) => {
                  const val = e.target.value !== "" ? Number(e.target.value) : undefined;
                  set("validation", { ...field.validation, max: val });
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type PanelMessages = ReturnType<typeof useI18n>["messages"]["formBuilder"]["panel"];

interface RichTextFieldConfigProps {
  field: FormField;
  onChange: (updated: FormField) => void;
  m: PanelMessages;
}

/** Richtext block config: the Markdown content editor plus the colour-variant tiles (with live surface preview). */
function RichTextFieldConfig({ field, onChange, m }: RichTextFieldConfigProps) {
  function set<K extends keyof FormField>(key: K, value: FormField[K]) {
    onChange({ ...field, [key]: value });
  }

  const variants: { value: RichTextVariant; label: string; base: string; active: string; inactive: string }[] = [
    {
      value: "default",
      label: m.variantDefault,
      base: "bg-[var(--ds-surface)] text-[var(--ds-text)]",
      active: "border-2 border-[var(--ds-text-muted)]",
      inactive: "border border-[var(--ds-border)]",
    },
    {
      value: "info",
      label: m.variantInfo,
      base: "bg-blue-950/50 text-blue-300",
      active: "border-2 border-blue-500",
      inactive: "border border-blue-800",
    },
    {
      value: "warning",
      label: m.variantWarning,
      base: "bg-amber-950/50 text-amber-300",
      active: "border-2 border-amber-500",
      inactive: "border border-amber-800",
    },
    {
      value: "hint",
      label: m.variantHint,
      base: "bg-green-950/50 text-green-300",
      active: "border-2 border-green-500",
      inactive: "border border-green-800",
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-1">
        <FormLabelText>{m.content}</FormLabelText>
        <Suspense
          fallback={
            <div className="h-24 rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] animate-pulse" />
          }
        >
          <MarkdownEditor
            value={field.content ?? ""}
            onChange={(val) => set("content", val || undefined)}
            rows={field.rows}
          />
        </Suspense>
      </div>

      <div className="flex flex-col gap-1">
        <FormLabelText>{m.variant}</FormLabelText>
        <div className="grid grid-cols-2 gap-1.5">
          {variants.map(({ value, label, base, active, inactive }) => (
            <button
              key={value}
              type="button"
              onClick={() => set("variant", value)}
              className={`h-8 rounded-control text-xs font-medium ${base} ${
                (field.variant ?? "default") === value ? active : inactive
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

interface ButtonFieldConfigProps {
  field: FormField;
  onChange: (updated: FormField) => void;
  allFields: { id: string; label: string }[];
  m: PanelMessages;
}

/**
 * Button field config: HTML type, width and alignment as segmented controls,
 * plus the optional click action with its source-field picker (only for
 * `buttonType === "button"` — submit/reset buttons act on the form itself).
 */
function ButtonFieldConfig({ field, onChange, allFields, m }: ButtonFieldConfigProps) {
  function set<K extends keyof FormField>(key: K, value: FormField[K]) {
    onChange({ ...field, [key]: value });
  }

  const actionValue = field.buttonAction?.type ?? "";

  return (
    <>
      <div className="flex flex-col gap-1">
        <FormLabelText>{m.buttonType}</FormLabelText>
        <DashboardSegmentedControl
          aria-label={m.buttonType}
          value={field.buttonType ?? "button"}
          onValueChange={(value) => set("buttonType", value as FormField["buttonType"])}
          options={[
            { value: "button", label: m.buttonTypeButton },
            { value: "submit", label: m.buttonTypeSubmit },
            { value: "reset", label: m.buttonTypeReset },
          ]}
        />
      </div>

      <div className="flex flex-col gap-1">
        <FormLabelText>{m.buttonWidth}</FormLabelText>
        <DashboardSegmentedControl
          aria-label={m.buttonWidth}
          value={field.buttonWidth ?? "automatic"}
          onValueChange={(value) => set("buttonWidth", value as FormField["buttonWidth"])}
          options={[
            { value: "automatic", label: m.buttonWidthAutomatic },
            { value: "full", label: m.buttonWidthFull },
          ]}
        />
      </div>

      <div className="flex flex-col gap-1">
        <FormLabelText>{m.buttonAlign}</FormLabelText>
        <DashboardSegmentedControl
          aria-label={m.buttonAlign}
          value={field.buttonAlign ?? "left"}
          onValueChange={(value) => set("buttonAlign", value as FormField["buttonAlign"])}
          options={[
            { value: "left", label: m.buttonAlignLeft },
            { value: "center", label: m.buttonAlignCenter },
            { value: "right", label: m.buttonAlignRight },
          ]}
        />
      </div>

      {(field.buttonType ?? "button") === "button" && (
        <div className="flex flex-col gap-1">
          <FormLabelText>{m.buttonAction}</FormLabelText>
          <select
            aria-label={m.buttonAction}
            value={actionValue}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "") {
                set("buttonAction", undefined);
              } else {
                set("buttonAction", {
                  type: value as ButtonActionType,
                  sourceFieldId: field.buttonAction?.sourceFieldId ?? "",
                });
              }
            }}
            className={formInputClass}
          >
            <option value="">{m.buttonActionNone}</option>
            <option value="open-url">{m.buttonActionOpenUrl}</option>
            <option value="copy-clipboard">{m.buttonActionCopyClipboard}</option>
            <option value="clear-field">{m.buttonActionClearField}</option>
          </select>
          {field.buttonAction && (
            <div className="mt-1 flex flex-col gap-1">
              <span className="text-xs text-[var(--ds-text-subtle)]">{m.buttonActionSourceField}</span>
              <select
                aria-label={m.buttonActionSourceField}
                value={field.buttonAction.sourceFieldId}
                onChange={(e) => {
                  if (field.buttonAction) {
                    set("buttonAction", { ...field.buttonAction, sourceFieldId: e.target.value });
                  }
                }}
                className={formInputClass}
              >
                <option value="">---</option>
                {allFields.map((fieldOption) => (
                  <option key={fieldOption.id} value={fieldOption.id}>
                    {fieldOption.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </>
  );
}

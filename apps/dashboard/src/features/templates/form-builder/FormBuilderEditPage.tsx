import { closestCenter, DndContext, type DragEndEvent, DragOverlay, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
  DashboardInput,
  SaveActionButton,
} from "@musiccloud/dashboard-ui";
import type { FieldType, FormField, FormRow, SubmissionConfig } from "@musiccloud/shared";
import { GearIcon, HandTapIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useReducer, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { FlowConnector } from "@/components/ui/FlowConnector";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useI18n } from "@/context/I18nContext";
import { BuilderCanvas } from "@/features/templates/form-builder/BuilderCanvas";
import { FieldConfigPanel } from "@/features/templates/form-builder/FieldConfigPanel";
import { FieldPalette, FieldTypeIcon } from "@/features/templates/form-builder/FieldPalette";
import { fieldTypeLabel } from "@/features/templates/form-builder/fieldTypeLabels";
import { SubmissionConfigPanel } from "@/features/templates/form-builder/SubmissionConfigPanel";
import { exportFormConfigSingle } from "@/features/templates/hooks/formConfigExport";
import { useFormConfig, useSaveFormConfig, useSetFormConfigActive } from "@/features/templates/hooks/useFormConfig";
import { useDashboardSortableSensors } from "@/lib/useDashboardSortableSensors";

/**
 * Returns the default human-readable label for a given field type.
 *
 * @param type - The field type.
 * @param fieldTypes - Localized fieldType labels from i18n messages.
 * @returns The display label used when a new field is created.
 */
function defaultFieldLabel(type: FieldType, fieldTypes: Record<string, string>): string {
  return fieldTypeLabel(type, fieldTypes);
}

/**
 * Calculates the remaining free column span in a 12-column grid row.
 *
 * @param row - The row to inspect.
 * @returns Number of free columns (0–12).
 */
function rowFreeSpan(row: FormRow): number {
  const used = row.fields.reduce((sum, f) => sum + (f.span ?? 12), 0);
  return Math.max(0, 12 - used);
}

/**
 * Creates a new {@link FormField} with a random UUID and sensible defaults.
 *
 * @param type - The field type to create.
 * @param fieldTypes - Localized fieldType labels from i18n messages.
 * @param span - Column span in the 12-column grid. Defaults to 12 (full width).
 * @returns A ready-to-use FormField instance.
 */
function makeNewField(type: FieldType, fieldTypes: Record<string, string>, span = 12): FormField {
  return {
    id: crypto.randomUUID(),
    type,
    label: defaultFieldLabel(type, fieldTypes),
    required: false,
    span,
  };
}

/**
 * Wraps a single field in a new {@link FormRow} with a random UUID.
 *
 * @param field - The initial field to place in the row.
 * @returns A new FormRow containing the given field.
 */
function makeNewRow(field: FormField): FormRow {
  return { id: crypto.randomUUID(), fields: [field] };
}

const HttpStatus = {
  Conflict: 409,
} as const;

/** Value namespace for the save-status discriminant shown in the header. */
const SaveStatus = {
  Idle: "idle",
  Saved: "saved",
  Error: "error",
  SlugConflict: "slug_conflict",
} as const;

type SaveStatusValue = (typeof SaveStatus)[keyof typeof SaveStatus];

type BuilderActiveDrag = {
  id: string;
  field?: FormField;
  row?: FormRow;
  paletteType?: FieldType;
} | null;

interface FormBuilderFormState {
  rows: FormRow[];
  slug: string;
  submissionConfig: SubmissionConfig | undefined;
  isDirty: boolean;
}

interface BuilderUIState {
  selectedFieldId: string | null;
  saveStatus: SaveStatusValue;
  showExportWarning: boolean;
  activeDrag: BuilderActiveDrag;
}

/** Field types the button-action source picker must not offer (they carry no submitted value). */
const FIELD_CONFIG_EXCLUDED_TYPES = new Set<FieldType>(["button", "richtext", "headline", "separator", "paragraph"]);

/** Field types the submission panel's recipient/reply-to pickers must not offer. */
const SUBMISSION_CONFIG_EXCLUDED_TYPES = new Set<FieldType>(["button", "headline", "separator", "paragraph"]);

/**
 * Collects the pickable fields (id + label) for the config panels.
 *
 * @param rows - The form's rows.
 * @param excludedTypes - Field types to skip.
 * @param excludedFieldId - Optionally the currently edited field itself.
 * @param useNameAsId - When `true`, the option id is the field's submission
 *   key (`name ?? id`) — the shape the submission pipeline resolves. The
 *   button-action picker uses raw ids instead (the public renderer resolves
 *   those against the live DOM).
 */
function getFieldOptions(
  rows: FormRow[],
  excludedTypes: ReadonlySet<FieldType>,
  excludedFieldId?: string,
  useNameAsId = false,
) {
  const options: Array<{ id: string; label: string }> = [];

  for (const row of rows) {
    for (const field of row.fields) {
      if (field.id === excludedFieldId || excludedTypes.has(field.type)) continue;
      options.push({
        id: useNameAsId ? field.name || field.id : field.id,
        label: field.label || field.name || field.id,
      });
    }
  }

  return options;
}

/** Removes one field; a row left empty disappears entirely. */
function removeFieldFromRows(rows: FormRow[], rowId: string, fieldId: string) {
  const nextRows: FormRow[] = [];

  for (const row of rows) {
    if (row.id !== rowId) {
      nextRows.push(row);
      continue;
    }

    const fields = row.fields.filter((field) => field.id !== fieldId);
    if (fields.length > 0) nextRows.push({ ...row, fields });
  }

  return nextRows;
}

/**
 * Form-builder edit page (ported from lmaa.space) — loads a form by name from
 * the route param. Drag from the palette onto the canvas (into a row's free
 * span or as a new row), reorder rows vertically and fields horizontally,
 * configure the selected field in the right-hand panel, edit slug + active
 * state, configure the submission chain, save via PUT, export as JSON.
 *
 * Deviation from lmaa: no text-tokens help window — the label-token
 * replacement it documents lives in lmaa's public form renderer, which
 * musiccloud does not have (yet).
 */
export function FormBuilderEditPage() {
  const { name } = useParams<{ name: string }>();
  const formName = name ?? "";
  const navigate = useNavigate();

  const { messages } = useI18n();
  const m = messages.formBuilder;

  const { data: config, isLoading } = useFormConfig(formName);
  const saveMutation = useSaveFormConfig();
  const setActive = useSetFormConfigActive();

  const [formState, setFormState] = useState<FormBuilderFormState>({
    rows: [],
    slug: "",
    submissionConfig: undefined,
    isDirty: false,
  });
  const [uiState, dispatchUI] = useReducer(
    (prev: BuilderUIState, action: Partial<BuilderUIState>): BuilderUIState => ({ ...prev, ...action }),
    { selectedFieldId: null, saveStatus: SaveStatus.Idle, showExportWarning: false, activeDrag: null },
  );
  const { selectedFieldId, saveStatus, showExportWarning, activeDrag } = uiState;

  const { rows, slug, submissionConfig, isDirty } = formState;

  // Stable setters (producer boundary): SubmissionConfigPanel memoizes its
  // header add-ons behind `onChange`, so these must not be rebuilt per render.
  const setRows = useCallback((updater: FormRow[] | ((prev: FormRow[]) => FormRow[])) => {
    setFormState((prev) => ({
      ...prev,
      rows: typeof updater === "function" ? updater(prev.rows) : updater,
      isDirty: true,
    }));
  }, []);

  const setSlug = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, slug: value, isDirty: true }));
  }, []);

  const setSubmissionConfig = useCallback((value: SubmissionConfig | undefined) => {
    setFormState((prev) => ({ ...prev, submissionConfig: value, isDirty: true }));
  }, []);

  // Sync server state into local rows, slug and submissionConfig once loaded.
  useEffect(() => {
    if (config !== undefined) {
      setFormState({
        rows: config.rows ?? [],
        slug: config.slug ?? formName,
        submissionConfig: config.submissionConfig,
        isDirty: false,
      });
    }
  }, [config, formName]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dispatchUI({ selectedFieldId: null });
        (document.activeElement as HTMLElement)?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selectedField =
    selectedFieldId !== null ? (rows.flatMap((r) => r.fields).find((f) => f.id === selectedFieldId) ?? null) : null;

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);

    if (id.startsWith("palette:")) {
      dispatchUI({ activeDrag: { id, paletteType: id.replace("palette:", "") as FieldType } });
      return;
    }

    if (id.startsWith("field:")) {
      const [, rowId, fieldId] = id.split(":");
      const row = rows.find((r) => r.id === rowId);
      const field = row?.fields.find((f) => f.id === fieldId);
      dispatchUI({ activeDrag: { id, field } });
      return;
    }

    const row = rows.find((r) => r.id === id);
    dispatchUI({ activeDrag: { id, row } });
  }

  function handleDragEnd(event: DragEndEvent) {
    dispatchUI({ activeDrag: null });
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);

    if (activeId.startsWith("palette:")) {
      const type = activeId.replace("palette:", "") as FieldType;
      const overId = String(over.id);

      // Resolve drop target: row ID directly, free-span droppable, or neighbouring field.
      const targetRowId = overId.startsWith("field:")
        ? overId.split(":")[1]
        : overId.startsWith("free:")
          ? overId.split(":")[1]
          : overId;
      const targetRow = rows.find((r) => r.id === targetRowId);
      if (targetRow) {
        const free = rowFreeSpan(targetRow);
        if (free > 0) {
          const newField = makeNewField(type, m.fieldTypes, free);
          setRows((prev) => prev.map((r) => (r.id === targetRow.id ? { ...r, fields: [...r.fields, newField] } : r)));
          dispatchUI({ selectedFieldId: newField.id });
          return;
        }
      }

      const newField = makeNewField(type, m.fieldTypes);
      setRows((prev) => [...prev, makeNewRow(newField)]);
      dispatchUI({ selectedFieldId: newField.id });
      return;
    }

    const overId = String(over.id);
    if (!activeId.startsWith("field:") && !overId.startsWith("field:")) {
      const oldIndex = rows.findIndex((r) => r.id === activeId);
      const newIndex = rows.findIndex((r) => r.id === overId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setRows((prev) => arrayMove(prev, oldIndex, newIndex));
      }
      return;
    }

    if (activeId.startsWith("field:") && overId.startsWith("field:")) {
      const [, activeRowId, activeFieldId] = activeId.split(":");
      const [, overRowId, overFieldId] = overId.split(":");

      if (activeRowId === overRowId) {
        setRows((prev) =>
          prev.map((row) => {
            if (row.id !== activeRowId) return row;
            const oldIdx = row.fields.findIndex((f) => f.id === activeFieldId);
            const newIdx = row.fields.findIndex((f) => f.id === overFieldId);
            if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return row;
            return { ...row, fields: arrayMove(row.fields, oldIdx, newIdx) };
          }),
        );
      }
    }
  }

  function handleSelectField(fieldId: string) {
    dispatchUI({ selectedFieldId: selectedFieldId === fieldId ? null : fieldId });
  }

  function handleDeleteField(rowId: string, fieldId: string) {
    if (selectedFieldId === fieldId) dispatchUI({ selectedFieldId: null });
    setRows((prev) => removeFieldFromRows(prev, rowId, fieldId));
  }

  function handleFieldChange(updated: FormField) {
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        fields: row.fields.map((f) => (f.id === updated.id ? updated : f)),
      })),
    );
  }

  function handleSave() {
    dispatchUI({ saveStatus: SaveStatus.Idle });
    saveMutation.mutate(
      { name: formName, payload: { rows, slug: slug || undefined, submissionConfig } },
      {
        onSuccess: () => {
          dispatchUI({ saveStatus: SaveStatus.Saved });
          setFormState((prev) => ({ ...prev, isDirty: false }));
          setTimeout(() => dispatchUI({ saveStatus: SaveStatus.Idle }), 3000);
        },
        onError: (err: unknown) => {
          const status = err && typeof err === "object" && "status" in err ? (err as { status: number }).status : 0;
          dispatchUI({ saveStatus: status === HttpStatus.Conflict ? SaveStatus.SlugConflict : SaveStatus.Error });
        },
      },
    );
  }

  function handleExport() {
    if (!config) return;
    if (isDirty) {
      dispatchUI({ showExportWarning: true });
      setTimeout(() => dispatchUI({ showExportWarning: false }), 3000);
      return;
    }
    exportFormConfigSingle(config.name, slug, rows, submissionConfig);
  }

  if (isLoading) {
    return <BuilderLoadingPage title={m.title} backLabel={m.listTitle} onBack={() => navigate("/forms")} />;
  }

  return (
    <div>
      <PageHeader
        title={`${m.title}: ${formName}`}
        renderLeading={() => <HeaderBackButton label={m.listTitle} onClick={() => navigate("/forms")} />}
      >
        <BuilderHeaderActions
          showExportWarning={showExportWarning}
          saveStatus={saveStatus}
          isSaving={saveMutation.isPending}
          hasConfig={!!config}
          onExport={handleExport}
          onSave={handleSave}
          m={m}
          savingLabel={messages.common.saving}
        />
      </PageHeader>

      <BuilderSlugBar
        slug={slug}
        isActive={config?.isActive}
        isSavingActive={setActive.isPending}
        onSlugChange={setSlug}
        onActiveChange={(checked) => setActive.mutate({ name: formName, active: checked })}
        m={m}
      />

      <BuilderWorkspace
        rows={rows}
        selectedField={selectedField}
        selectedFieldId={selectedFieldId}
        activeDrag={activeDrag}
        fieldTypes={m.fieldTypes}
        preferencesTitle={m.preferencesTitle}
        noFieldSelectedTitle={m.noFieldSelected}
        noFieldSelectedHint={m.noFieldSelectedHint}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => dispatchUI({ activeDrag: null })}
        onSelectField={handleSelectField}
        onDeleteField={handleDeleteField}
        onFieldChange={handleFieldChange}
      />

      <FlowConnector />

      <SubmissionConfigPanel
        config={submissionConfig}
        onChange={setSubmissionConfig}
        fields={getFieldOptions(rows, SUBMISSION_CONFIG_EXCLUDED_TYPES, undefined, true)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton with the page chrome already in place. */
function BuilderLoadingPage({ title, backLabel, onBack }: { title: string; backLabel: string; onBack: () => void }) {
  return (
    <div>
      <PageHeader title={title} renderLeading={() => <HeaderBackButton label={backLabel} onClick={onBack} />} />
      <div className="flex items-center justify-center py-24">
        <div className="size-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    </div>
  );
}

interface BuilderSlugBarProps {
  slug: string;
  isActive: boolean | undefined;
  isSavingActive: boolean;
  onSlugChange: (value: string) => void;
  onActiveChange: (checked: boolean) => void;
  m: ReturnType<typeof useI18n>["messages"]["formBuilder"];
}

/** Meta bar under the header: public slug input plus the active toggle. */
function BuilderSlugBar({ slug, isActive, isSavingActive, onSlugChange, onActiveChange, m }: BuilderSlugBarProps) {
  return (
    <div className="flex items-center gap-3 pb-3">
      <label htmlFor="form-slug" className="shrink-0 text-sm text-[var(--ds-text-muted)]">
        {m.slugLabel}:
      </label>
      <div className="flex items-center gap-1">
        <span className="font-mono text-sm text-[var(--ds-text-muted)]">/</span>
        <div className="w-48">
          <DashboardInput
            id="form-slug"
            type="text"
            value={slug}
            onChange={(event) => onSlugChange(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder={m.slugPlaceholder}
            className="font-mono"
          />
        </div>
      </div>
      {isActive !== undefined && (
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="form-active-toggle" className="text-sm text-[var(--ds-text-muted)]">
            {m.status.active}
          </label>
          <ToggleSwitch
            id="form-active-toggle"
            checked={isActive}
            onChange={onActiveChange}
            disabled={isSavingActive}
            aria-label={m.status.active}
          />
        </div>
      )}
    </div>
  );
}

interface BuilderWorkspaceProps {
  rows: FormRow[];
  selectedField: FormField | null;
  selectedFieldId: string | null;
  activeDrag: BuilderActiveDrag;
  fieldTypes: Record<string, string>;
  preferencesTitle: string;
  noFieldSelectedTitle: string;
  noFieldSelectedHint: string;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
  onSelectField: (fieldId: string) => void;
  onDeleteField: (rowId: string, fieldId: string) => void;
  onFieldChange: (field: FormField) => void;
}

/** The three-column drag workspace: palette | canvas | field config panel, all inside one DndContext. */
function BuilderWorkspace({
  rows,
  selectedField,
  selectedFieldId,
  activeDrag,
  fieldTypes,
  preferencesTitle,
  noFieldSelectedTitle,
  noFieldSelectedHint,
  onDragStart,
  onDragEnd,
  onDragCancel,
  onSelectField,
  onDeleteField,
  onFieldChange,
}: BuilderWorkspaceProps) {
  const sensors = useDashboardSortableSensors({ activationDistance: 6 });

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            <FieldPalette />
          </div>

          <div className="min-w-0 flex-1">
            <BuilderCanvas
              rows={rows}
              selectedFieldId={selectedFieldId}
              onSelectField={onSelectField}
              onDeleteField={onDeleteField}
            />
          </div>

          <div className="w-72 shrink-0">
            <DashboardSection>
              <DashboardSection.Header
                icon={
                  selectedField !== null ? (
                    <FieldTypeIcon type={selectedField.type} />
                  ) : (
                    <GearIcon weight="duotone" className="size-4" />
                  )
                }
                title={selectedField !== null ? fieldTypeLabel(selectedField.type, fieldTypes) : preferencesTitle}
              />
              {selectedField !== null ? (
                <DashboardSection.Body>
                  <FieldConfigPanel
                    field={selectedField}
                    onChange={onFieldChange}
                    allFields={getFieldOptions(rows, FIELD_CONFIG_EXCLUDED_TYPES, selectedField.id)}
                  />
                </DashboardSection.Body>
              ) : (
                <ContentUnavailableView
                  className="h-64"
                  icon={<HandTapIcon weight="duotone" aria-hidden />}
                  title={noFieldSelectedTitle}
                  subtitle={noFieldSelectedHint}
                />
              )}
            </DashboardSection>
          </div>
        </div>

        <DragOverlay>
          <BuilderDragOverlayContent activeDrag={activeDrag} fieldTypes={fieldTypes} />
        </DragOverlay>
      </DndContext>
    </div>
  );
}

interface BuilderHeaderActionsProps {
  showExportWarning: boolean;
  saveStatus: BuilderUIState["saveStatus"];
  isSaving: boolean;
  hasConfig: boolean;
  onExport: () => void;
  onSave: () => void;
  m: ReturnType<typeof useI18n>["messages"]["formBuilder"];
  savingLabel: string;
}

/** Header action row: export (with unsaved warning), save status text, save button. */
function BuilderHeaderActions({
  showExportWarning,
  saveStatus,
  isSaving,
  hasConfig,
  onExport,
  onSave,
  m,
  savingLabel,
}: BuilderHeaderActionsProps) {
  return (
    <div className="flex items-center gap-3">
      {showExportWarning && <span className="text-sm font-medium text-amber-500">{m.exportUnsavedWarning}</span>}
      <DashboardActionButton
        action={DashboardActionId.Export}
        disabled={!hasConfig}
        label={m.exportForm}
        onClick={onExport}
        size="action"
        type="button"
        variant={DashboardButtonVariant.Neutral}
      />
      {saveStatus === "saved" && <span className="text-sm font-medium text-green-400">{m.saved}</span>}
      {saveStatus === "error" && (
        <span className="text-sm font-medium text-[var(--ds-danger-text)]">{m.saveError}</span>
      )}
      {saveStatus === "slug_conflict" && (
        <span className="text-sm font-medium text-[var(--ds-danger-text)]">{m.slugConflict}</span>
      )}
      <SaveActionButton
        type="button"
        onClick={onSave}
        disabled={isSaving}
        busyLabel={savingLabel}
        label={m.save}
        status={isSaving ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
      />
    </div>
  );
}

/** Drag-overlay preview for the three drag kinds: existing field, whole row, palette tile. */
function BuilderDragOverlayContent({
  activeDrag,
  fieldTypes,
}: {
  activeDrag: BuilderActiveDrag;
  fieldTypes: Record<string, string>;
}) {
  if (!activeDrag) return null;

  if (activeDrag.field) {
    return (
      <div className="flex cursor-grabbing items-center gap-2 rounded-control border border-[var(--color-primary)] bg-[var(--ds-nav-active-bg)] px-3 py-2.5 text-sm shadow-xl">
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--ds-text)]">{activeDrag.field.label}</span>
        <span className="shrink-0 rounded bg-[var(--ds-border-subtle)] px-1.5 py-0.5 text-xs font-medium text-[var(--ds-text)]/60">
          {activeDrag.field.type.slice(0, 3)}
        </span>
      </div>
    );
  }

  if (activeDrag.row) {
    return (
      <div className="flex cursor-grabbing items-center gap-2 rounded-control border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm shadow-xl">
        {activeDrag.row.fields.map((f) => (
          <span
            key={f.id}
            className="max-w-32 truncate rounded bg-[var(--ds-border-subtle)] px-2 py-0.5 text-xs text-[var(--ds-text)]"
          >
            {f.label}
          </span>
        ))}
      </div>
    );
  }

  if (activeDrag.paletteType) {
    return (
      <div className="cursor-grabbing rounded-control border border-[var(--color-primary)] bg-[var(--ds-nav-active-bg)] px-3 py-2 text-sm font-medium text-[var(--ds-text)] shadow-xl">
        {defaultFieldLabel(activeDrag.paletteType, fieldTypes)}
      </div>
    );
  }

  return null;
}

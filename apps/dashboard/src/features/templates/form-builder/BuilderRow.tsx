import { useDndContext, useDroppable } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DashboardButtonVariant, DashboardIconButton } from "@musiccloud/dashboard-ui";
import type { FormField, FormRow } from "@musiccloud/shared";
import { ListIcon } from "@phosphor-icons/react";

import { useI18n } from "@/context/I18nContext";
import { BuilderField } from "@/features/templates/form-builder/BuilderField";

interface BuilderRowProps {
  row: FormRow;
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onDeleteField: (rowId: string, fieldId: string) => void;
}

/**
 * Horizontal row container for one or more builder fields, laid out on a
 * 12-column grid via each field's `span`. The row itself is vertically
 * sortable (drag handle on the left); any remaining span renders as a
 * dashed drop placeholder that accepts palette tiles and fields dragged
 * over from other rows.
 */
export function BuilderRow({ row, selectedFieldId, onSelectField, onDeleteField }: BuilderRowProps) {
  const { messages } = useI18n();
  const sortableIds = row.fields.map((f: FormField) => `field:${row.id}:${f.id}`);
  const usedSpan = row.fields.reduce((sum, f) => sum + (f.span ?? 12), 0);
  const freeSpan = Math.max(0, 12 - usedSpan);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  // Dedicated droppable for the free-span placeholder.
  const freeDropId = `free:${row.id}`;
  const { setNodeRef: setFreeRef } = useDroppable({ id: freeDropId, disabled: freeSpan === 0 });

  // Detect when a draggable item is hovering over this row's free span:
  // palette tiles always highlight; fields only when they come from another
  // row (reordering within the row keeps the horizontal sortable behavior).
  const { active, over } = useDndContext();
  const activeId = active?.id.toString() ?? "";
  const overId = over?.id.toString() ?? "";
  const overRowId = overId.startsWith("field:")
    ? overId.split(":")[1]
    : overId.startsWith("free:")
      ? overId.split(":")[1]
      : overId;
  const activeSourceRowId = activeId.startsWith("field:") ? activeId.split(":")[1] : null;
  const isDropOver =
    overRowId === row.id &&
    freeSpan > 0 &&
    (activeId.startsWith("palette:") || (activeId.startsWith("field:") && activeSourceRowId !== row.id));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex items-stretch gap-2 p-3 rounded-control border border-[var(--ds-border)] bg-[var(--ds-form-control-bg)]"
    >
      <DashboardIconButton
        type="button"
        {...attributes}
        {...listeners}
        className="touch-none cursor-grab self-center active:cursor-grabbing"
        title={messages.formBuilder.moveRow}
        aria-label={messages.formBuilder.moveRow}
        variant={DashboardButtonVariant.Ghost}
      >
        <ListIcon weight="bold" className="size-4" />
      </DashboardIconButton>

      <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
        <div className="grid grid-cols-12 gap-2 flex-1">
          {row.fields.map((field: FormField) => (
            <div key={field.id} style={{ gridColumn: `span ${field.span ?? 12}` }}>
              <BuilderField
                field={field}
                rowId={row.id}
                isSelected={selectedFieldId === field.id}
                onSelect={() => onSelectField(field.id)}
                onDelete={() => onDeleteField(row.id, field.id)}
              />
            </div>
          ))}

          {freeSpan > 0 && (
            <div
              ref={setFreeRef}
              style={{ gridColumn: `span ${freeSpan}` }}
              className={`h-full min-h-[var(--ds-control-h-field-large)] rounded-control border-2 border-dashed flex items-center justify-center text-xs ${
                isDropOver
                  ? "border-[var(--color-primary)] bg-[var(--ds-nav-active-bg)] text-[var(--color-primary)]"
                  : "border-[var(--ds-border)] text-[var(--ds-text-subtle)]"
              }`}
            >
              {freeSpan}/12
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

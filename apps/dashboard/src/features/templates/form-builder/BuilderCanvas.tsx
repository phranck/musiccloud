import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { FormRow } from "@musiccloud/shared";
import { SquaresFourIcon } from "@phosphor-icons/react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { useI18n } from "@/context/I18nContext";
import { BuilderRow } from "@/features/templates/form-builder/BuilderRow";

interface BuilderCanvasProps {
  rows: FormRow[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onDeleteField: (rowId: string, fieldId: string) => void;
}

/**
 * Main droppable canvas displaying the ordered, vertically sortable list of
 * form rows. The whole dashed area is a dnd-kit droppable (`id: "canvas"`)
 * so palette tiles dropped on empty space append a new row; the empty state
 * invites the first drop.
 */
export function BuilderCanvas({ rows, selectedFieldId, onSelectField, onDeleteField }: BuilderCanvasProps) {
  const { messages } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });

  const rowIds = rows.map((r: FormRow) => r.id);

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<SquaresFourIcon weight="duotone" className="size-4" />}
        title={messages.formBuilder.canvasTitle}
      />
      <div
        ref={setNodeRef}
        className={`min-h-64 border-2 border-dashed rounded-b-xl ${
          isOver
            ? "border-[var(--color-primary)] bg-[var(--ds-nav-active-bg)]"
            : "border-[var(--ds-border)] bg-transparent"
        }`}
      >
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-64 p-8">
            <p className="text-sm text-[var(--ds-text-subtle)] text-center">{messages.formBuilder.empty}</p>
          </div>
        ) : (
          <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            <div className="p-3 flex flex-col gap-2">
              {rows.map((row: FormRow) => (
                <BuilderRow
                  key={row.id}
                  row={row}
                  selectedFieldId={selectedFieldId}
                  onSelectField={onSelectField}
                  onDeleteField={onDeleteField}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </DashboardSection>
  );
}

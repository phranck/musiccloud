import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DashboardButtonVariant, DashboardIconButton } from "@musiccloud/dashboard-ui";
import { ListIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export interface NavigationPlacementListItemProps {
  children: ReactNode;
  dragLabel: string;
  id: number;
  label: string;
}

/** Sortable row owned by one concrete navigation placement projection. */
export function NavigationPlacementListItem({ children, dragLabel, id, label }: NavigationPlacementListItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      aria-label={label}
      className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-[var(--ds-space-sm)] rounded-control border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-space-sm)]"
      style={{
        opacity: isDragging ? 0.5 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <DashboardIconButton
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`${dragLabel}: ${label}`}
        className="touch-none cursor-grab active:cursor-grabbing"
        title={dragLabel}
        variant={DashboardButtonVariant.Ghost}
      >
        <ListIcon weight="bold" className="size-4" />
      </DashboardIconButton>
      {children}
    </li>
  );
}

export interface NavigationPlacementListProps {
  children: ReactNode;
  emptyLabel: string;
  itemIds: number[];
  onMove: (activeId: number, overId: number) => void;
  title: string;
}

/**
 * Owns drag-and-drop ordering for one concrete context and area projection.
 * Children must be matching `NavigationPlacementListItem` instances whose IDs
 * occur in `itemIds`.
 */
export function NavigationPlacementList({
  children,
  emptyLabel,
  itemIds,
  onMove,
  title,
}: NavigationPlacementListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || typeof active.id !== "number" || typeof over.id !== "number") return;
    onMove(active.id, over.id);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <ol aria-label={title} className="flex flex-col gap-[var(--ds-space-xs)]">
          {itemIds.length === 0 && (
            <li className="rounded-control border border-dashed border-[var(--ds-border)] py-[var(--ds-space-sm)] text-center text-xs text-[var(--ds-text-muted)]">
              {emptyLabel}
            </li>
          )}
          {children}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
  DashboardIconButton,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { type EmailBlock, EmailBlockType, type EmailBlockTypeValue } from "@musiccloud/shared";
import {
  CursorClickIcon,
  ImageIcon,
  ListIcon,
  MinusIcon,
  type Icon as PhosphorIcon,
  TextTIcon,
  TrayArrowUpIcon,
} from "@phosphor-icons/react";
import { type ChangeEvent, lazy, Suspense, useRef, useState } from "react";
import { useI18n } from "@/context/I18nContext";
import { createDefaultBlock } from "@/features/templates/email-templates/blockDefaults";
import { useUploadEmailAsset } from "@/features/templates/hooks/useEmailAssets";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

/** Icon shown on each block type's "+ Block" add-button. */
const BLOCK_TYPE_ICON: Record<EmailBlockTypeValue, PhosphorIcon> = {
  [EmailBlockType.Text]: TextTIcon,
  [EmailBlockType.Button]: CursorClickIcon,
  [EmailBlockType.Image]: ImageIcon,
  [EmailBlockType.Divider]: MinusIcon,
  [EmailBlockType.Spacer]: MinusIcon,
};

/** Ordered list of block types offered by the "+ Block" row. */
const ADDABLE_BLOCK_TYPES: EmailBlockTypeValue[] = [
  EmailBlockType.Text,
  EmailBlockType.Button,
  EmailBlockType.Image,
  EmailBlockType.Divider,
  EmailBlockType.Spacer,
];

export interface BlockEditorProps {
  /** The template body's ordered blocks. The editor is fully controlled — it owns no block state itself. */
  blocks: EmailBlock[];
  /** Called with the full next `blocks` array on every add/remove/reorder/field edit. */
  onChange: (blocks: EmailBlock[]) => void;
}

/**
 * Drag-and-sortable editor for a template's `blocks` array. Renders one
 * inline form per block (its shape depends on `block.type`: Markdown editor
 * for text, two inputs for a button, an asset upload + alt-text for an
 * image, nothing for a divider, a numeric height for a spacer), a drag
 * handle for reordering (dnd-kit, mirroring the `NavManagerPage.tsx`
 * sortable-list pattern), a per-card remove button, and a row of "+ Block"
 * buttons — one per {@link EmailBlockType} — to append a new block.
 *
 * The component is fully controlled: it holds no block state of its own,
 * only calling `onChange` with the next full array. The caller
 * (`EmailTemplateEditPage`) owns `blocks` as part of its form state.
 */
export function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Blocks carry no id of their own (they're plain data, not DB rows). dnd-kit's
  // sortable `id` (used by SortableContext/handleDragEnd to compute the new
  // order) is fine as the current array index — it only needs to be unique
  // among the currently-rendered items, which index satisfies, and it's
  // recomputed together with `blocks` on every change. React's reconciliation
  // `key`, however, must survive a mid-list removal without misattributing a
  // card's internal DOM state to the wrong block, so it's tracked separately
  // via a monotonic per-card counter that only changes on add/remove, never
  // on reorder or field edits.
  const nextCardKeyRef = useRef(0);
  const [cardKeys, setCardKeys] = useState<number[]>(() => blocks.map(() => nextCardKeyRef.current++));

  function updateBlockAt(index: number, next: EmailBlock) {
    onChange(blocks.map((b, i) => (i === index ? next : b)));
  }

  function removeBlockAt(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
    setCardKeys((prev) => prev.filter((_, i) => i !== index));
  }

  function addBlock(type: EmailBlockTypeValue) {
    onChange([...blocks, createDefaultBlock(type)]);
    setCardKeys((prev) => [...prev, nextCardKeyRef.current++]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = Number(active.id);
    const newIndex = Number(over.id);
    onChange(arrayMove(blocks, oldIndex, newIndex));
    setCardKeys((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  const blockTypeLabel: Record<EmailBlockTypeValue, string> = {
    [EmailBlockType.Text]: m.blockTypeText,
    [EmailBlockType.Button]: m.blockTypeButton,
    [EmailBlockType.Image]: m.blockTypeImage,
    [EmailBlockType.Divider]: m.blockTypeDivider,
    [EmailBlockType.Spacer]: m.blockTypeSpacer,
  };

  const sortableIds = blocks.map((_, index) => index);

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {blocks.map((block, index) => (
              <SortableBlockCard
                key={cardKeys[index] ?? index}
                id={index}
                block={block}
                label={blockTypeLabel[block.type]}
                removeLabel={messages.common.remove}
                onChange={(next) => updateBlockAt(index, next)}
                onRemove={() => removeBlockAt(index)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex flex-wrap gap-1.5">
        {ADDABLE_BLOCK_TYPES.map((type) => {
          const Icon = BLOCK_TYPE_ICON[type];
          return (
            <DashboardActionButton
              key={type}
              action={DashboardActionId.Create}
              icon={<Icon weight="duotone" className="size-3.5" />}
              label={blockTypeLabel[type]}
              onClick={() => addBlock(type)}
              size="action"
              type="button"
              variant={DashboardButtonVariant.Neutral}
            />
          );
        })}
      </div>
    </div>
  );
}

interface SortableBlockCardProps {
  id: number;
  block: EmailBlock;
  label: string;
  removeLabel: string;
  onChange: (block: EmailBlock) => void;
  onRemove: () => void;
}

/** One draggable block card: drag handle, type-specific form, remove button. */
function SortableBlockCard({ id, block, label, removeLabel, onChange, onRemove }: SortableBlockCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 rounded-control border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3"
    >
      <DashboardIconButton
        type="button"
        {...attributes}
        {...listeners}
        className="mt-1 touch-none cursor-grab active:cursor-grabbing"
        title={label}
        aria-label={label}
        variant={DashboardButtonVariant.Ghost}
      >
        <ListIcon weight="bold" className="size-4" />
      </DashboardIconButton>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">{label}</div>
        <BlockForm block={block} onChange={onChange} />
      </div>

      <DashboardActionButton
        action={DashboardActionId.Remove}
        iconOnly
        label={removeLabel}
        onClick={onRemove}
        size="action"
        title={removeLabel}
        type="button"
      />
    </div>
  );
}

interface BlockFormProps {
  block: EmailBlock;
  onChange: (block: EmailBlock) => void;
}

/** Renders the type-specific inline form for a single block. */
function BlockForm({ block, onChange }: BlockFormProps) {
  switch (block.type) {
    case EmailBlockType.Text:
      return <TextBlockForm block={block} onChange={onChange} />;
    case EmailBlockType.Button:
      return <ButtonBlockForm block={block} onChange={onChange} />;
    case EmailBlockType.Image:
      return <ImageBlockForm block={block} onChange={onChange} />;
    case EmailBlockType.Divider:
      return <DividerBlockForm />;
    case EmailBlockType.Spacer:
      return <SpacerBlockForm block={block} onChange={onChange} />;
  }
}

const MARKDOWN_EDITOR_FALLBACK_HEIGHT = "h-24";

function TextBlockForm({
  block,
  onChange,
}: {
  block: Extract<EmailBlock, { type: typeof EmailBlockType.Text }>;
  onChange: (block: EmailBlock) => void;
}) {
  const { messages } = useI18n();
  return (
    <Suspense
      fallback={
        <div
          className={`${MARKDOWN_EDITOR_FALLBACK_HEIGHT} animate-pulse rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)]`}
        />
      }
    >
      <MarkdownEditor
        value={block.markdown}
        onChange={(markdown) => onChange({ ...block, markdown })}
        rows={5}
        resizable
        placeholder={messages.emailTemplates.bodyText}
      />
    </Suspense>
  );
}

function ButtonBlockForm({
  block,
  onChange,
}: {
  block: Extract<EmailBlock, { type: typeof EmailBlockType.Button }>;
  onChange: (block: EmailBlock) => void;
}) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <DashboardInput
        type="text"
        value={block.label}
        onChange={(e) => onChange({ ...block, label: e.target.value })}
        label={m.buttonLabel}
        placeholder={m.buttonLabel}
      />
      <DashboardInput
        type="text"
        value={block.url}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
        label={m.buttonUrl}
        placeholder="https://… or {{variable}}"
        className="font-mono"
      />
    </div>
  );
}

function ImageBlockForm({
  block,
  onChange,
}: {
  block: Extract<EmailBlock, { type: typeof EmailBlockType.Image }>;
  onChange: (block: EmailBlock) => void;
}) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  const uploadMutation = useUploadEmailAsset();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    uploadMutation.mutate(file, {
      onSuccess: (result) => onChange({ ...block, assetId: result.id }),
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {block.assetId && (
          <img
            src={`/api/admin/email-assets/${block.assetId}`}
            alt={block.altText}
            className="h-12 w-20 rounded border border-[var(--ds-border)] object-cover"
          />
        )}
        <DashboardActionButton
          action={DashboardActionId.Import}
          busyLabel={m.imageUpload}
          icon={<TrayArrowUpIcon weight="duotone" className="size-3.5" />}
          label={m.imageUpload}
          onClick={() => fileInputRef.current?.click()}
          status={uploadMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <input
          ref={fileInputRef}
          aria-label={m.imageUpload}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {uploadMutation.isError && (
        <p className="text-xs text-red-500">
          {uploadMutation.error instanceof Error ? uploadMutation.error.message : m.imageUploadError}
        </p>
      )}
      <DashboardInput
        type="text"
        value={block.altText}
        onChange={(e) => onChange({ ...block, altText: e.target.value })}
        label={m.imageAltText}
      />
    </div>
  );
}

function DividerBlockForm() {
  return <hr className="border-t border-dashed border-[var(--ds-border)]" />;
}

function SpacerBlockForm({
  block,
  onChange,
}: {
  block: Extract<EmailBlock, { type: typeof EmailBlockType.Spacer }>;
  onChange: (block: EmailBlock) => void;
}) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  return (
    <DashboardInput
      type="number"
      min={0}
      value={block.heightPx}
      onChange={(e) => onChange({ ...block, heightPx: Number(e.target.value) || 0 })}
      label={m.spacerHeight}
      className="w-32"
    />
  );
}

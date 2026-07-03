import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { FieldType } from "@musiccloud/shared";
import {
  CaretCircleDownIcon,
  CheckSquareIcon,
  CubeIcon,
  CursorClickIcon,
  EnvelopeSimpleIcon,
  ListChecksIcon,
  LockSimpleIcon,
  MarkdownLogoIcon,
  MinusIcon,
  type Icon as PhosphorIcon,
  TextAlignJustifyIcon,
  TextAlignLeftIcon,
  TextHIcon,
  TextTIcon,
} from "@phosphor-icons/react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { useI18n } from "@/context/I18nContext";

/**
 * Phosphor icon per form field type (ported from lmaa.space, whose hand-drawn
 * inline SVGs are replaced by the project's mandatory Phosphor set). Shared by
 * the palette tiles and the edit page's drag overlay.
 */
const FIELD_TYPE_ICON: Record<FieldType, PhosphorIcon> = {
  text: TextTIcon,
  email: EnvelopeSimpleIcon,
  textarea: TextAlignLeftIcon,
  select: CaretCircleDownIcon,
  "multi-select": ListChecksIcon,
  checkbox: CheckSquareIcon,
  richtext: MarkdownLogoIcon,
  button: CursorClickIcon,
  password: LockSimpleIcon,
  headline: TextHIcon,
  separator: MinusIcon,
  paragraph: TextAlignJustifyIcon,
};

/**
 * Renders the Phosphor icon that visually represents a form field type.
 *
 * @param props - Component props.
 * @param props.type - The field type whose icon should be rendered.
 */
export function FieldTypeIcon({ type }: { type: FieldType }) {
  const Icon = FIELD_TYPE_ICON[type];
  return <Icon weight="duotone" className="size-4" aria-hidden="true" />;
}

interface PaletteTileProps {
  /** dnd-kit drag id suffix — a {@link FieldType} for every current tile. */
  paletteId: string;
  /** Field type used for the tile's icon. */
  iconType: FieldType;
  /** Human-readable label shown inside the tile. */
  label: string;
}

/**
 * Draggable palette tile for a single field type. Registers itself with
 * dnd-kit under the id `"palette:<paletteId>"` so the edit page can identify
 * palette drops in its `handleDragEnd`.
 */
function PaletteTile({ paletteId, iconType, label }: PaletteTileProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette:${paletteId}`,
    data: { paletteId },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex items-center gap-2 px-3 py-2.5 rounded-control border border-[var(--ds-border)] bg-[var(--ds-form-control-bg)] text-sm text-[var(--ds-text)] cursor-grab active:cursor-grabbing hover:border-[var(--color-primary)] hover:bg-[var(--ds-nav-hover-bg)] select-none"
    >
      <span className="shrink-0 opacity-60 text-[var(--ds-text)]">
        <FieldTypeIcon type={iconType} />
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

/**
 * Sidebar palette listing all draggable field-type tiles, alphabetised by
 * their localised label. (lmaa's extra "special data source" group is not
 * ported — musiccloud's contract has no `optionsSource`.)
 */
export function FieldPalette() {
  const { messages } = useI18n();
  const ft = messages.formBuilder.fieldTypes;

  const tiles: PaletteTileProps[] = [
    { paletteId: "select", iconType: "select", label: ft.select },
    { paletteId: "button", iconType: "button", label: ft.button },
    { paletteId: "checkbox", iconType: "checkbox", label: ft.checkbox },
    { paletteId: "text", iconType: "text", label: ft.text },
    { paletteId: "richtext", iconType: "richtext", label: ft.richtext },
    { paletteId: "multi-select", iconType: "multi-select", label: ft.multiSelect },
    { paletteId: "paragraph", iconType: "paragraph", label: ft.paragraph },
    { paletteId: "textarea", iconType: "textarea", label: ft.textarea },
    { paletteId: "separator", iconType: "separator", label: ft.separator },
    { paletteId: "headline", iconType: "headline", label: ft.headline },
  ];
  tiles.sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="flex flex-col gap-3 min-w-44">
      <DashboardSection>
        <DashboardSection.Header
          icon={<CubeIcon weight="duotone" className="size-4" />}
          title={messages.formBuilder.paletteTitle}
        />
        <DashboardSection.Body className="!gap-2">
          {tiles.map((tile) => (
            <PaletteTile key={tile.paletteId} {...tile} />
          ))}
        </DashboardSection.Body>
      </DashboardSection>
    </div>
  );
}

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
import type { NavId } from "@musiccloud/shared";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@musiccloud/shared";
import {
  CaretDownIcon,
  CaretUpIcon,
  DownloadIcon,
  FileDashedIcon,
  FileMdIcon,
  ListIcon,
  PlusCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Fragment, useEffect, useReducer, useRef, useState } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/context/I18nContext";
import { groupPagesByHierarchy } from "@/features/content/hierarchy";
import { useContentPages } from "@/features/content/hooks/useAdminContent";
import { useAdminNav, useSaveNav } from "@/features/content/hooks/useAdminNav";
import { useFormConfigs } from "@/features/templates/hooks/useFormConfig";

const NAV_TEXT = {
  de: {
    pageTitle: "Navigationen",
    headerNav: "Header-Navigation",
    footerNav: "Footer-Navigation",
    staticRoutes: [
      { label: "Startseite", url: "/" },
      { label: "Shop vorschlagen", url: "/suggestion" },
      { label: "Suche", url: "/search" },
    ],
    dragTitle: "Verschieben",
    labelOverrideTitle: "Label-Override (leer = Standard)",
    openNewTab: "Öffnet in neuem Tab",
    openSameTab: "Öffnet im selben Tab",
    remove: "Entfernen",
    save: "Speichern",
    saving: "Speichert…",
    load: "Lade…",
    noEntries: "Keine Einträge",
    typePage: "Seite",
    typeUrl: "URL",
    choosePage: "Seite wählen…",
    choosePageOrForm: "Seite oder Formular wählen…",
    add: "Hinzufügen",
    urlPlaceholder: "https://… oder /pfad",
    labelPlaceholder: "Label",
    newTab: "Neuer Tab",
    sameTab: "Selber Tab",
    errorSaving: "Fehler beim Speichern",
    forms: "Formulare",
  },
  en: {
    pageTitle: "Navigations",
    headerNav: "Header navigation",
    footerNav: "Footer navigation",
    staticRoutes: [
      { label: "Home", url: "/" },
      { label: "Suggest shop", url: "/suggestion" },
      { label: "Search", url: "/search" },
    ],
    dragTitle: "Drag",
    labelOverrideTitle: "Label override (empty = default)",
    openNewTab: "Opens in new tab",
    openSameTab: "Opens in same tab",
    remove: "Remove",
    save: "Save",
    saving: "Saving…",
    load: "Loading…",
    noEntries: "No entries",
    typePage: "Page",
    typeUrl: "URL",
    choosePage: "Select page…",
    choosePageOrForm: "Select page or form…",
    add: "Add",
    urlPlaceholder: "https://… or /path",
    labelPlaceholder: "Label",
    newTab: "New tab",
    sameTab: "Same tab",
    errorSaving: "Error while saving",
    forms: "Forms",
  },
} as const;

type NavText = (typeof NAV_TEXT)[keyof typeof NAV_TEXT];

interface NavItemState {
  id: number;
  pageSlug: string | null;
  pageTitle: string | null;
  url: string | null;
  target: "_self" | "_blank";
  label: string;
  translations: Partial<Record<Locale, string>>;
}

const NON_DEFAULT_LOCALES = LOCALES.filter((l): l is Locale => l !== DEFAULT_LOCALE);
const LOCALE_FLAG: Record<string, string> = { de: "🇩🇪" };

function SortableNavItem({
  item,
  expanded,
  onRemove,
  onLabelChange,
  onTranslationChange,
  onToggleExpanded,
  text,
}: {
  item: NavItemState;
  expanded: boolean;
  onRemove: (id: number) => void;
  onLabelChange: (id: number, label: string) => void;
  onTranslationChange: (id: number, locale: Locale, value: string) => void;
  onToggleExpanded: (id: number) => void;
  text: NavText;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const displayUrl = item.url ?? (item.pageSlug ? `/${item.pageSlug}` : "");

  const translationPlaceholder = item.pageSlug
    ? `Uses linked page title: ${item.pageTitle ?? item.pageSlug}`
    : item.label || "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-3 p-3 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-control"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] touch-none"
        title={text.dragTitle}
      >
        <ListIcon weight="duotone" className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--ds-text)] truncate">{item.pageTitle ?? item.url}</div>
        <div className="text-xs text-[var(--ds-text-muted)] font-mono">{displayUrl}</div>
      </div>

      <input
        type="text"
        value={item.label}
        onChange={(e) => onLabelChange(item.id, e.target.value)}
        placeholder={item.pageTitle ?? item.url ?? ""}
        className="w-32 px-2 py-1 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        title={text.labelOverrideTitle}
      />

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="p-1 text-[var(--ds-text-muted)] hover:text-red-500"
        title={text.remove}
      >
        <XCircleIcon weight="duotone" className="w-3.5 h-3.5" />
      </button>

      {/* Translations expandable */}
      <div className="w-full">
        <button
          type="button"
          onClick={() => onToggleExpanded(item.id)}
          className="flex items-center gap-1 text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] select-none"
        >
          {expanded ? <CaretUpIcon className="w-3 h-3" /> : <CaretDownIcon className="w-3 h-3" />}
          <span className="uppercase tracking-wide font-medium">Translations</span>
        </button>
        {expanded && (
          <div className="mt-2 flex flex-col gap-1.5">
            {NON_DEFAULT_LOCALES.map((locale) => (
              <div key={locale} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[10px] font-semibold uppercase text-[var(--ds-text-subtle)] tracking-widest">
                  {LOCALE_FLAG[locale] ?? ""} {locale.toUpperCase()}
                </span>
                <input
                  type="text"
                  value={item.translations[locale] ?? ""}
                  placeholder={translationPlaceholder}
                  onChange={(e) => onTranslationChange(item.id, locale, e.target.value)}
                  className="flex-1 h-7 px-2 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] placeholder:text-[var(--ds-text-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NavColumn({ navId, label }: { navId: NavId; label: string }) {
  const { locale } = useI18n();
  const text = NAV_TEXT[locale];
  const staticRoutes = text.staticRoutes;
  const { data: serverItems = [], isLoading } = useAdminNav(navId);
  const { data: allPages = [] } = useContentPages();
  const { data: allForms = [] } = useFormConfigs();
  const saveNav = useSaveNav(navId);

  interface NavColumnState {
    items: NavItemState[];
    dirty: boolean;
    saveError: string | null;
    addType: "page" | "url" | "form";
    addPageSlug: string;
    addUrl: string;
    addLabel: string;
    addTarget: "_self" | "_blank";
  }

  const [state, dispatch] = useReducer(
    (prev: NavColumnState, action: Partial<NavColumnState>): NavColumnState => ({ ...prev, ...action }),
    {
      items: [],
      dirty: false,
      saveError: null,
      addType: "page",
      addPageSlug: "",
      addUrl: "",
      addLabel: "",
      addTarget: "_self",
    },
  );
  const { items, dirty, saveError, addType, addPageSlug, addUrl, addLabel, addTarget } = state;

  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const setItems = (updater: NavItemState[] | ((prev: NavItemState[]) => NavItemState[])) => {
    dispatch({ items: typeof updater === "function" ? updater(items) : updater });
  };

  useEffect(() => {
    dispatch({
      items: serverItems.map((si) => ({
        id: si.id,
        pageSlug: si.pageSlug ?? null,
        pageTitle: si.pageTitle ?? null,
        url: si.url ?? null,
        target: (si.target as "_self" | "_blank") ?? "_self",
        label: si.label ?? "",
        translations: si.translations ?? {},
      })),
      dirty: false,
    });
  }, [serverItems]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    dispatch({ dirty: true });
  }

  function handleRemove(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    dispatch({ dirty: true });
  }

  function handleLabelChange(id: number, label: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, label } : i)));
    dispatch({ dirty: true });
  }

  function handleTranslationChange(id: number, locale: Locale, value: string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i.translations };
        if (value.trim().length === 0) {
          delete next[locale];
        } else {
          next[locale] = value;
        }
        return { ...i, translations: next };
      }),
    );
    dispatch({ dirty: true });
  }

  function handleToggleExpanded(id: number) {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleAddPage() {
    if (!addPageSlug) return;
    // Check if it's a form slug (prefixed with "form:")
    if (addPageSlug.startsWith("form:")) {
      const formSlug = addPageSlug.slice(5);
      const form = allForms.find((f) => f.slug === formSlug);
      if (!form?.slug) return;
      const url = `/${form.slug}`;
      if (items.some((i) => i.url === url)) return;
      setItems((prev) => [
        ...prev,
        {
          id: Date.now(),
          pageSlug: null,
          pageTitle: form.name,
          url,
          target: "_self",
          label: "",
          translations: {},
        },
      ]);
      dispatch({ addPageSlug: "" });
      dispatch({ dirty: true });
      return;
    }
    const page = allPages.find((p) => p.slug === addPageSlug);
    if (!page) return;
    if (items.some((i) => i.pageSlug === addPageSlug)) return;
    setItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        pageSlug: page.slug,
        pageTitle: page.title,
        url: null,
        target: "_self",
        label: "",
        translations: {},
      },
    ]);
    dispatch({ addPageSlug: "" });
    dispatch({ dirty: true });
  }

  function handleAddUrl() {
    const trimmed = addUrl.trim();
    if (!trimmed) return;

    // Check for static route shortcut
    const staticRoute = staticRoutes.find((r) => r.url === trimmed);
    const derivedLabel = addLabel.trim() || staticRoute?.label || "";

    setItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        pageSlug: null,
        pageTitle: derivedLabel || trimmed,
        url: trimmed,
        target: addTarget,
        label: derivedLabel,
        translations: {},
      },
    ]);
    dispatch({ addUrl: "", addLabel: "", addTarget: "_self", dirty: true });
  }

  function handleAddStatic(route: { label: string; url: string }) {
    if (items.some((i) => i.url === route.url)) return;
    setItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        pageSlug: null,
        pageTitle: route.label,
        url: route.url,
        target: "_self",
        label: "",
        translations: {},
      },
    ]);
    dispatch({ dirty: true });
  }

  async function handleSave() {
    dispatch({ saveError: null });
    try {
      await saveNav.mutateAsync(
        items.map((i) => {
          const base = {
            pageSlug: i.pageSlug ?? undefined,
            url: i.url ?? undefined,
            label: i.label || null,
            target: i.target,
          };
          const tx = Object.entries(i.translations).filter(([, v]) => typeof v === "string" && v.trim().length > 0);
          return tx.length > 0 ? { ...base, translations: Object.fromEntries(tx) } : base;
        }),
      );
      dispatch({ dirty: false });
    } catch (err) {
      dispatch({ saveError: err instanceof Error ? err.message : text.errorSaving });
    }
  }

  const usedUrls = new Set(items.filter((i) => i.url).map((i) => i.url));
  const availableStatics = staticRoutes.filter((r) => !usedUrls.has(r.url));
  const availableForms = allForms.filter((f) => f.slug && !usedUrls.has(`/${f.slug}`));
  // Group all pages by segmented hierarchy so the dropdown mirrors the
  // sidebar/pages-overview structure. Every page stays selectable; the user
  // owns the decision whether to re-add a page that's already in the nav.
  const pagesGrouped = (() => {
    const { segmentedBlocks, orphanDefaults } = groupPagesByHierarchy(allPages);
    const orphans = orphanDefaults.map((p) => ({ slug: p.slug, title: p.title }));
    const blocks = segmentedBlocks.map(({ parent, children }) => ({
      parent: { slug: parent.slug, title: parent.title },
      children: children.map((c) => ({ slug: c.slug, title: c.title })),
    }));
    return { orphans, blocks };
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--ds-text)]">{label}</h3>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saveNav.isPending}
          className="flex items-center gap-1.5 h-7 px-3 text-xs border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] disabled:opacity-50"
        >
          <DownloadIcon weight="duotone" className="w-3 h-3" />
          {saveNav.isPending ? text.saving : text.save}
        </button>
      </div>

      {saveError && <p className="text-xs text-red-500">{saveError}</p>}

      {isLoading ? (
        <div className="text-xs text-[var(--ds-text-muted)]">{text.load}</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.length === 0 && (
                <div className="text-xs text-[var(--ds-text-muted)] py-4 text-center border border-dashed border-[var(--ds-border)] rounded-control">
                  {text.noEntries}
                </div>
              )}
              {items.map((item) => (
                <SortableNavItem
                  key={item.id}
                  item={item}
                  expanded={!!expandedRows[item.id]}
                  onRemove={handleRemove}
                  onLabelChange={handleLabelChange}
                  onTranslationChange={handleTranslationChange}
                  onToggleExpanded={handleToggleExpanded}
                  text={text}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <NavColumnAddSection
        addType={addType}
        addPageSlug={addPageSlug}
        addUrl={addUrl}
        addLabel={addLabel}
        pagesGrouped={pagesGrouped}
        availableForms={availableForms}
        availableStatics={availableStatics}
        text={text}
        onTypeChange={(type) => dispatch({ addType: type })}
        onPageSlugChange={(slug) => dispatch({ addPageSlug: slug })}
        onUrlChange={(url) => dispatch({ addUrl: url })}
        onLabelChange={(label) => dispatch({ addLabel: label })}
        onAddPage={handleAddPage}
        onAddUrl={handleAddUrl}
        onAddStatic={handleAddStatic}
      />
    </div>
  );
}

interface PagesGrouped {
  orphans: { slug: string; title: string }[];
  blocks: {
    parent: { slug: string; title: string };
    children: { slug: string; title: string }[];
  }[];
}

interface NavColumnAddSectionProps {
  addType: "page" | "url" | "form";
  addPageSlug: string;
  addUrl: string;
  addLabel: string;
  pagesGrouped: PagesGrouped;
  availableForms: { name: string; slug: string | null }[];
  availableStatics: { label: string; url: string }[];
  text: NavText;
  onTypeChange: (type: "page" | "url" | "form") => void;
  onPageSlugChange: (slug: string) => void;
  onUrlChange: (url: string) => void;
  onLabelChange: (label: string) => void;
  onAddPage: () => void;
  onAddUrl: () => void;
  onAddStatic: (route: { label: string; url: string }) => void;
}

function NavColumnAddSection({
  addType,
  addPageSlug,
  addUrl,
  addLabel,
  pagesGrouped,
  availableForms,
  availableStatics,
  text,
  onTypeChange,
  onPageSlugChange,
  onUrlChange,
  onLabelChange,
  onAddPage,
  onAddUrl,
  onAddStatic,
}: NavColumnAddSectionProps) {
  return (
    <div className="border-t border-[var(--ds-border)] pt-3 space-y-3">
      {/* Type toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onTypeChange("page")}
          className={`px-3 py-1 text-xs rounded-control border ${
            addType === "page"
              ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)] border-[var(--ds-nav-active-border)]"
              : "text-[var(--ds-text-muted)] border-[var(--ds-border)] hover:text-[var(--ds-text)]"
          }`}
        >
          {text.typePage}
        </button>
        <button
          type="button"
          onClick={() => onTypeChange("url")}
          className={`px-3 py-1 text-xs rounded-control border ${
            addType === "url"
              ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)] border-[var(--ds-nav-active-border)]"
              : "text-[var(--ds-text-muted)] border-[var(--ds-border)] hover:text-[var(--ds-text)]"
          }`}
        >
          {text.typeUrl}
        </button>
      </div>

      {addType === "page" ? (
        <div className="flex items-center gap-2">
          <HierarchicalPagePicker
            value={addPageSlug}
            onChange={onPageSlugChange}
            pagesGrouped={pagesGrouped}
            forms={availableForms}
            placeholder={text.choosePageOrForm}
            formsLabel={text.forms}
          />
          <button
            type="button"
            onClick={onAddPage}
            disabled={!addPageSlug}
            className="p-1.5 text-[var(--color-primary)] hover:opacity-80 disabled:opacity-40 transition-opacity"
            title={text.add}
          >
            <PlusCircleIcon weight="duotone" className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Static route shortcuts */}
          {availableStatics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availableStatics.map((r) => (
                <button
                  key={r.url}
                  type="button"
                  onClick={() => onAddStatic(r)}
                  className="px-2 py-1 text-xs bg-[var(--ds-surface-hover)] hover:bg-[var(--ds-nav-hover-bg)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] rounded border border-[var(--ds-border)] font-mono"
                >
                  {r.url}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={addUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder={text.urlPlaceholder}
              className="flex-1 px-2 py-1.5 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded-control text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] font-mono"
            />
            <input
              type="text"
              value={addLabel}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder={text.labelPlaceholder}
              className="w-24 px-2 py-1.5 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded-control text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <button
              type="button"
              onClick={onAddUrl}
              disabled={!addUrl.trim()}
              className="p-1.5 text-[var(--color-primary)] hover:opacity-80 disabled:opacity-40 transition-opacity"
              title={text.add}
            >
              <PlusCircleIcon weight="duotone" className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface HierarchicalPagePickerProps {
  value: string;
  onChange: (value: string) => void;
  pagesGrouped: PagesGrouped;
  forms: { name: string; slug: string | null }[];
  placeholder: string;
  formsLabel: string;
}

// Custom dropdown that visually indents segmented children via real CSS
// padding (native <select> ignores leading whitespace and has no built-in
// way to mark hierarchy). Every item is selectable.
function HierarchicalPagePicker({
  value,
  onChange,
  pagesGrouped,
  forms,
  placeholder,
  formsLabel,
}: HierarchicalPagePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function escHandler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [open]);

  const selectedLabel = (() => {
    if (!value) return placeholder;
    if (value.startsWith("form:")) {
      const slug = value.slice("form:".length);
      const f = forms.find((ff) => ff.slug === slug);
      return f?.slug ? `${f.name} (/${f.slug})` : placeholder;
    }
    for (const p of pagesGrouped.orphans) {
      if (p.slug === value) return `${p.title} (/${p.slug})`;
    }
    for (const b of pagesGrouped.blocks) {
      if (b.parent.slug === value) return `${b.parent.title} (/${b.parent.slug})`;
      for (const c of b.children) {
        if (c.slug === value) return `${c.title} (/${c.slug})`;
      }
    }
    return placeholder;
  })();

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  function PageRow({
    slug,
    title,
    depth,
    pageType,
  }: {
    slug: string;
    title: string;
    depth: 0 | 1;
    pageType: "segmented" | "default";
  }) {
    const Icon = pageType === "segmented" ? FileDashedIcon : FileMdIcon;
    return (
      <button
        type="button"
        onClick={() => pick(slug)}
        className={`w-full text-left text-xs py-1.5 flex items-center gap-2 hover:bg-[var(--ds-nav-hover-bg)] ${
          value === slug ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)]" : "text-[var(--ds-text)]"
        }`}
        style={{ paddingLeft: 8 + depth * 20, paddingRight: 8 }}
      >
        <Icon weight="duotone" className="w-4 h-4 shrink-0 text-[var(--ds-text-muted)]" />
        <span className="truncate">
          {title} <span className="text-[var(--ds-text-muted)] font-mono">/{slug}</span>
        </span>
      </button>
    );
  }

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded-control px-2 py-1.5 text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      >
        <span className={value ? "text-[var(--ds-text)]" : "text-[var(--ds-text-muted)]"}>{selectedLabel}</span>
        <CaretDownIcon weight="duotone" className="w-3 h-3 shrink-0 text-[var(--ds-text-muted)]" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-[var(--ds-bg-elevated,var(--ds-surface))] border border-[var(--ds-border)] rounded-control shadow-lg max-h-80 overflow-auto py-1">
          {pagesGrouped.orphans.map((p) => (
            <PageRow key={p.slug} slug={p.slug} title={p.title} depth={0} pageType="default" />
          ))}
          {pagesGrouped.blocks.map((b) => (
            <Fragment key={b.parent.slug}>
              <PageRow slug={b.parent.slug} title={b.parent.title} depth={0} pageType="segmented" />
              {b.children.map((c) => (
                <PageRow key={c.slug} slug={c.slug} title={c.title} depth={1} pageType="default" />
              ))}
            </Fragment>
          ))}
          {forms.length > 0 && (
            <>
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--ds-text-muted)] border-t border-[var(--ds-border)] mt-1">
                {formsLabel}
              </div>
              {forms.map(
                (f) =>
                  f.slug && (
                    <button
                      key={f.slug}
                      type="button"
                      onClick={() => pick(`form:${f.slug}`)}
                      className={`w-full text-left text-xs py-1.5 px-2 hover:bg-[var(--ds-nav-hover-bg)] ${
                        value === `form:${f.slug}`
                          ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)]"
                          : "text-[var(--ds-text)]"
                      }`}
                    >
                      {f.name} <span className="text-[var(--ds-text-muted)] font-mono">/{f.slug}</span>
                    </button>
                  ),
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Navigation management page for header/footer link sets.
 *
 * @returns Nav manager route component.
 */
export function NavManagerPage() {
  const { locale } = useI18n();
  const text = NAV_TEXT[locale];

  return (
    <>
      <PageHeader title={text.pageTitle} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-control p-5">
          <NavColumn navId="header" label={text.headerNav} />
        </div>
        <div className="bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-control p-5">
          <NavColumn navId="footer" label={text.footerNav} />
        </div>
      </div>
    </>
  );
}

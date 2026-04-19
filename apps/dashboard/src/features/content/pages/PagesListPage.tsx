import {
  CheckCircleIcon,
  CircleIcon,
  EyeSlashIcon,
  FileDashedIcon,
  FileIcon,
  FileMdIcon,
  PencilLineIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useReducer } from "react";
import { useNavigate } from "react-router";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { Dialog, dialogBtnDestructive, dialogBtnSecondary, dialogHeaderIconClass } from "@/components/ui/Dialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import type { ColumnDef } from "@/components/ui/Table";
import { DataTable } from "@/components/ui/Table";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { useI18n } from "@/context/I18nContext";
import {
  type ContentPageSummary,
  useContentPages,
  useDeleteContentPage,
} from "@/features/content/hooks/useAdminContent";
import { CreatePageDialog } from "@/features/content/pages/CreatePageDialog";

type ContentPage = ContentPageSummary;

interface HierarchicalPage extends ContentPage {
  depth: 0 | 1;
}

function buildHierarchy(pages: ContentPage[]): HierarchicalPage[] {
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const segmentedParents = pages.filter((p) => p.pageType === "segmented");
  const claimed = new Set<string>();
  const out: HierarchicalPage[] = [];
  for (const parent of segmentedParents) {
    out.push({ ...parent, depth: 0 });
    const children = (parent.segments ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((seg) => bySlug.get(seg.targetSlug))
      .filter((p): p is ContentPage => p !== undefined && !claimed.has(p.slug));
    for (const child of children) {
      claimed.add(child.slug);
      out.push({ ...child, depth: 1 });
    }
  }
  for (const page of pages) {
    if (page.pageType === "default" && !claimed.has(page.slug)) {
      out.push({ ...page, depth: 0 });
    }
  }
  return out;
}

function StatusBadge({ status }: { status: string }) {
  const { messages } = useI18n();
  const s = messages.content.pages.status;
  if (status === "published") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <CheckCircleIcon weight="duotone" className="w-3.5 h-3.5" />
        {s.published}
      </span>
    );
  }
  if (status === "hidden") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--ds-text-muted)]">
        <EyeSlashIcon weight="duotone" className="w-3.5 h-3.5" />
        {s.hidden}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
      <CircleIcon weight="duotone" className="w-3.5 h-3.5" />
      {s.draft}
    </span>
  );
}

function formatDate(isoDate: string | null, locale: string): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale === "de" ? "de-DE" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface PagesListState {
  showCreate: boolean;
  deleteTarget: { slug: string; title: string } | null;
}

const initialState: PagesListState = {
  showCreate: false,
  deleteTarget: null,
};

export function PagesListPage() {
  const { locale, messages } = useI18n();
  const text = messages.content.pages;
  const common = messages.common;
  const { data: pages = [], isLoading } = useContentPages();
  const deletePage = useDeleteContentPage();
  const navigate = useNavigate();

  const [state, dispatch] = useReducer(
    (prev: PagesListState, action: Partial<PagesListState>): PagesListState => ({ ...prev, ...action }),
    initialState,
  );
  const { showCreate, deleteTarget } = state;

  const handleDeleteRequest = useCallback((pageSlug: string, pageTitle: string) => {
    dispatch({ deleteTarget: { slug: pageSlug, title: pageTitle } });
  }, []);

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deletePage.mutate(deleteTarget.slug, {
      onSuccess: () => dispatch({ deleteTarget: null }),
    });
  }

  const hierarchicalPages = useMemo(() => buildHierarchy(pages), [pages]);

  const columns = useMemo<ColumnDef<HierarchicalPage>[]>(
    () => [
      {
        id: "title",
        header: text.table.title,
        cell: (page) => {
          const Icon = page.pageType === "segmented" ? FileDashedIcon : FileMdIcon;
          return (
            <div className="flex items-center gap-2" style={{ paddingLeft: page.depth * 24 }}>
              <Icon weight="duotone" className="w-4 h-4 shrink-0 text-[var(--ds-text-muted)]" />
              <button
                type="button"
                onClick={() => navigate(`/pages/${page.slug}`)}
                className="font-medium text-[var(--ds-text)] hover:underline text-left truncate"
              >
                {page.title}
              </button>
            </div>
          );
        },
      },
      {
        id: "slug",
        header: text.table.slug,
        cell: (page) => <span className="font-mono text-xs text-[var(--ds-text-muted)]">/{page.slug}</span>,
      },
      {
        id: "type",
        header: text.table.type,
        cell: (page) => (
          <span className="text-xs text-[var(--ds-text-muted)]">
            {page.pageType === "segmented" ? text.pageTypeSegmented : text.pageTypeDefault}
          </span>
        ),
      },
      {
        id: "status",
        header: text.table.status,
        cell: (page) => <StatusBadge status={page.status} />,
      },
      {
        id: "createdBy",
        header: text.table.createdBy,
        cell: (page) => <span className="text-xs text-[var(--ds-text-muted)]">{page.createdByUsername ?? "—"}</span>,
      },
      {
        id: "updatedAt",
        header: text.table.updatedAt,
        sortKey: (page) => page.updatedAt ?? "",
        cell: (page) => (
          <span className="text-xs text-[var(--ds-text-muted)]">{formatDate(page.updatedAt, locale)}</span>
        ),
      },
      {
        id: "actions",
        className: "w-48",
        cell: (page) => (
          <div className="flex gap-2 justify-end">
            <TableActionButton
              onClick={() => navigate(`/pages/${page.slug}`)}
              icon={<PencilLineIcon weight="duotone" className="w-3.5 h-3.5" />}
              label={common.edit}
            />
            <TableActionButton
              variant="danger"
              onClick={() => handleDeleteRequest(page.slug, page.title)}
              disabled={deletePage.isPending}
              icon={<TrashIcon weight="duotone" className="w-3.5 h-3.5" />}
              label={common.delete}
            />
          </div>
        ),
      },
    ],
    [text, common, locale, navigate, deletePage.isPending, handleDeleteRequest],
  );

  return (
    <PageLayout>
      <PageHeader title={text.title}>
        {!showCreate && (
          <button
            type="button"
            onClick={() => dispatch({ showCreate: true })}
            className="flex items-center gap-2 py-1.5 px-4 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)]"
          >
            <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
            {text.newPage}
          </button>
        )}
      </PageHeader>

      <PageBody>
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-[var(--ds-text-muted)] text-sm">
            {text.loadPages}
          </div>
        )}

        {!isLoading && pages.length === 0 && (
          <ContentUnavailableView
            className="flex-1 min-h-0"
            icon={<FileIcon weight="duotone" aria-hidden />}
            title={text.emptyPages}
            subtitle={text.emptyPagesHint}
          />
        )}

        {!isLoading && pages.length > 0 && (
          <div className="-mx-3 -mt-3">
            <DataTable columns={columns} data={hierarchicalPages} getRowKey={(page) => page.slug} stickyHeader />
          </div>
        )}
      </PageBody>

      <CreatePageDialog
        open={showCreate}
        onClose={() => dispatch({ showCreate: false })}
        onCreated={(page) => navigate(`/pages/${page.slug}`)}
      />

      <Dialog
        open={deleteTarget !== null}
        title={text.deletePageTitle}
        titleIcon={<TrashIcon weight="duotone" className={dialogHeaderIconClass} />}
        onClose={() => dispatch({ deleteTarget: null })}
      >
        <div className="p-6 text-sm text-[var(--ds-text)]">
          {text.confirmDeletePrefix} „<span className="font-bold">{deleteTarget?.title}</span>“{" "}
          {text.confirmDeleteSuffix}
        </div>
        <Dialog.Footer>
          <button
            type="button"
            className={dialogBtnSecondary}
            onClick={() => dispatch({ deleteTarget: null })}
            disabled={deletePage.isPending}
          >
            {common.cancel}
          </button>
          <button
            type="button"
            className={dialogBtnDestructive}
            onClick={handleDeleteConfirm}
            disabled={deletePage.isPending}
          >
            {deletePage.isPending ? "…" : common.delete}
          </button>
        </Dialog.Footer>
      </Dialog>
    </PageLayout>
  );
}

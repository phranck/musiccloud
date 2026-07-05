import {
  CheckCircle as CheckCircleIcon,
  PencilSimple as PencilSimpleIcon,
  PlusCircle as PlusCircleIcon,
  Stack as StackIcon,
  Trash as TrashIcon,
  XCircle as XCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useReducer } from "react";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dialog } from "@/components/ui/Dialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { useI18n } from "@/context/I18nContext";
import type { TierResponse } from "@/features/developer/api";
import { useCreateTier, useDeleteTier, useTiers, useUpdateTier } from "@/features/developer/hooks/useDeveloperData";

interface TierFormData {
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired: boolean;
  price: string;
  sortOrder: number;
}

const EMPTY_FORM: TierFormData = {
  name: "",
  requestsPerMinute: 60,
  requestsPerDay: 10000,
  attributionRequired: false,
  price: "",
  sortOrder: 0,
};

function TierForm({
  data,
  onChange,
  errors,
}: {
  data: TierFormData;
  onChange: (patch: Partial<TierFormData>) => void;
  errors: Partial<Record<keyof TierFormData, string>>;
}) {
  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--ds-text)]">Name</span>
        <input
          type="text"
          className="rounded-input bg-[var(--ds-surface)] border border-[var(--ds-border)] px-3 py-2 text-sm text-[var(--ds-text)]"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Pro"
        />
        {errors.name && <span className="text-xs text-red-400">{errors.name}</span>}
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-[var(--ds-text)]">Requests / minute</span>
          <input
            type="number"
            className="rounded-input bg-[var(--ds-surface)] border border-[var(--ds-border)] px-3 py-2 text-sm text-[var(--ds-text)]"
            value={data.requestsPerMinute}
            onChange={(e) => onChange({ requestsPerMinute: Number(e.target.value) })}
            min={1}
          />
          {errors.requestsPerMinute && <span className="text-xs text-red-400">{errors.requestsPerMinute}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-[var(--ds-text)]">Requests / day</span>
          <input
            type="number"
            className="rounded-input bg-[var(--ds-surface)] border border-[var(--ds-border)] px-3 py-2 text-sm text-[var(--ds-text)]"
            value={data.requestsPerDay}
            onChange={(e) => onChange({ requestsPerDay: Number(e.target.value) })}
            min={1}
          />
          {errors.requestsPerDay && <span className="text-xs text-red-400">{errors.requestsPerDay}</span>}
        </label>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={data.attributionRequired}
          onChange={(e) => onChange({ attributionRequired: e.target.checked })}
          className="rounded"
        />
        <span className="text-sm font-medium text-[var(--ds-text)]">Attribution required</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--ds-text)]">Price</span>
        <input
          type="text"
          className="rounded-input bg-[var(--ds-surface)] border border-[var(--ds-border)] px-3 py-2 text-sm text-[var(--ds-text)]"
          value={data.price}
          onChange={(e) => onChange({ price: e.target.value })}
          placeholder='e.g. "€ 9,90/Monat"'
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--ds-text)]">Sort order</span>
        <input
          type="number"
          className="rounded-input bg-[var(--ds-surface)] border border-[var(--ds-border)] px-3 py-2 text-sm text-[var(--ds-text)]"
          value={data.sortOrder}
          onChange={(e) => onChange({ sortOrder: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

function toSubmitBody(data: TierFormData) {
  return {
    name: data.name,
    requestsPerMinute: data.requestsPerMinute,
    requestsPerDay: data.requestsPerDay,
    attributionRequired: data.attributionRequired,
    price: data.price || null,
    sortOrder: data.sortOrder,
  };
}

function validateForm(data: TierFormData): Partial<Record<keyof TierFormData, string>> {
  const errs: Partial<Record<keyof TierFormData, string>> = {};
  if (!data.name.trim()) errs.name = "Name is required";
  if (data.requestsPerMinute < 1) errs.requestsPerMinute = "Must be > 0";
  if (data.requestsPerDay < 1) errs.requestsPerDay = "Must be > 0";
  return errs;
}

interface TierEditorState {
  dialogOpen: boolean;
  editingTier: TierResponse | null;
  form: TierFormData;
  errors: Partial<Record<keyof TierFormData, string>>;
  deleteConfirm: string | null;
}

const TierEditorActionType = {
  OpenCreate: "OPEN_CREATE",
  OpenEdit: "OPEN_EDIT",
  CloseDialog: "CLOSE_DIALOG",
  SetForm: "SET_FORM",
  SetErrors: "SET_ERRORS",
  ConfirmDelete: "CONFIRM_DELETE",
  CancelDelete: "CANCEL_DELETE",
} as const;

type TierEditorAction =
  | { type: typeof TierEditorActionType.OpenCreate }
  | { type: typeof TierEditorActionType.OpenEdit; tier: TierResponse }
  | { type: typeof TierEditorActionType.CloseDialog }
  | { type: typeof TierEditorActionType.SetForm; patch: Partial<TierFormData> }
  | { type: typeof TierEditorActionType.SetErrors; errors: Partial<Record<keyof TierFormData, string>> }
  | { type: typeof TierEditorActionType.ConfirmDelete; id: string }
  | { type: typeof TierEditorActionType.CancelDelete };

function tierEditorReducer(state: TierEditorState, action: TierEditorAction): TierEditorState {
  switch (action.type) {
    case TierEditorActionType.OpenCreate:
      return { ...state, dialogOpen: true, editingTier: null, form: EMPTY_FORM, errors: {} };
    case TierEditorActionType.OpenEdit:
      return {
        ...state,
        dialogOpen: true,
        editingTier: action.tier,
        form: {
          name: action.tier.name,
          requestsPerMinute: action.tier.requestsPerMinute,
          requestsPerDay: action.tier.requestsPerDay,
          attributionRequired: action.tier.attributionRequired,
          price: action.tier.price ?? "",
          sortOrder: action.tier.sortOrder,
        },
        errors: {},
      };
    case TierEditorActionType.CloseDialog:
      return { ...state, dialogOpen: false };
    case TierEditorActionType.SetForm:
      return { ...state, form: { ...state.form, ...action.patch } };
    case TierEditorActionType.SetErrors:
      return { ...state, errors: action.errors };
    case TierEditorActionType.ConfirmDelete:
      return { ...state, deleteConfirm: action.id };
    case TierEditorActionType.CancelDelete:
      return { ...state, deleteConfirm: null };
  }
}

export function TierEditorPage() {
  const { messages } = useI18n();
  const dm = messages.developer;
  const cm = messages.common;
  const { data: tiers, isLoading } = useTiers();
  const createTier = useCreateTier();
  const updateTier = useUpdateTier();
  const deleteTier = useDeleteTier();
  const [state, dispatch] = useReducer(tierEditorReducer, {
    dialogOpen: false,
    editingTier: null,
    form: EMPTY_FORM,
    errors: {},
    deleteConfirm: null,
  });

  const openCreate = useCallback(() => dispatch({ type: TierEditorActionType.OpenCreate }), []);

  const openEdit = useCallback((tier: TierResponse) => dispatch({ type: TierEditorActionType.OpenEdit, tier }), []);

  function handleSave() {
    const errs = validateForm(state.form);
    if (Object.keys(errs).length > 0) {
      dispatch({ type: TierEditorActionType.SetErrors, errors: errs });
      return;
    }
    if (state.editingTier) {
      updateTier.mutate({ id: state.editingTier.id, ...toSubmitBody(state.form) });
    } else {
      createTier.mutate(toSubmitBody(state.form));
    }
    dispatch({ type: TierEditorActionType.CloseDialog });
  }

  function handleDelete(id: string) {
    deleteTier.mutate(id);
    dispatch({ type: TierEditorActionType.CancelDelete });
  }

  const columns = useMemo<ColumnDef<TierResponse>[]>(
    () => [
      {
        id: "name",
        header: dm.colName,
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.name.toLowerCase(),
        cell: (a) => <span className="font-medium">{a.name}</span>,
      },
      {
        id: "traffic",
        header: dm.colTraffic,
        headerClassName: "whitespace-nowrap",
        className: "w-40",
        sortKey: (a) => a.requestsPerMinute,
        cell: (a) => (
          <span className="text-[var(--ds-text-muted)]">
            {a.requestsPerMinute}/min &middot; {a.requestsPerDay}/day
          </span>
        ),
      },
      {
        id: "attribution",
        header: dm.colAttribution,
        className: "w-28",
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => (a.attributionRequired ? 1 : 0),
        cell: (a) =>
          a.attributionRequired ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
              <CheckCircleIcon weight="duotone" className="size-3" />
              Required
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--ds-text-muted)]">
              <XCircleIcon weight="duotone" className="size-3" />
              No
            </span>
          ),
      },
      {
        id: "price",
        header: dm.colPrice,
        className: "w-32",
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.price ?? "",
        cell: (a) => <span className="text-[var(--ds-text-muted)]">{a.price ?? "—"}</span>,
      },
      {
        id: "sortOrder",
        header: dm.colSortOrder,
        className: "w-20",
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.sortOrder,
        cell: (a) => <span className="text-[var(--ds-text-muted)]">{a.sortOrder}</span>,
      },
      {
        id: "actions",
        className: "w-32",
        cell: (a) => (
          <div className="flex justify-end gap-1">
            <TableActionButton
              onClick={() => openEdit(a)}
              icon={<PencilSimpleIcon weight="duotone" className="size-3" />}
              label={cm.edit}
            />
            <TableActionButton
              onClick={() => dispatch({ type: TierEditorActionType.ConfirmDelete, id: a.id })}
              icon={<TrashIcon weight="duotone" className="size-3" />}
              label={cm.delete}
            />
          </div>
        ),
      },
    ],
    [dm, cm, openEdit],
  );

  const tierList = tiers ?? [];

  return (
    <PageLayout>
      <PageHeader title={dm.tiersTitle}>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-button bg-[var(--ds-accent)] text-[var(--ds-on-accent)] px-4 py-2 text-sm font-medium"
          onClick={openCreate}
        >
          <PlusCircleIcon weight="duotone" className="size-4" />
          {dm.tierCreate}
        </button>
      </PageHeader>

      {isLoading && (
        <DashboardSection className="overflow-hidden flex-1 min-h-0 flex flex-col">
          <DashboardSection.Header icon={<StackIcon weight="duotone" className="size-4" />} title={dm.tiersTitle} />
          <DashboardSection.Body flush>
            <div className="space-y-px">
              {Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((key) => (
                <div
                  key={key}
                  className="h-14 bg-[var(--ds-surface)] animate-pulse border-b border-[var(--ds-border-subtle)]"
                />
              ))}
            </div>
          </DashboardSection.Body>
        </DashboardSection>
      )}

      {!isLoading && tierList.length === 0 && (
        <ContentUnavailableView
          icon={<StackIcon weight="duotone" aria-hidden />}
          title={dm.noTiers}
          subtitle={dm.noTiersHint}
          className="flex-1 min-h-0"
        />
      )}

      {!isLoading && tierList.length > 0 && (
        <DashboardSection className="overflow-hidden flex-1 min-h-0 flex flex-col">
          <DashboardSection.Header icon={<StackIcon weight="duotone" className="size-4" />} title={dm.tiersTitle} />
          <DashboardSection.Body flush>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DataTable
                columns={columns}
                data={tierList}
                getRowKey={(t) => t.id}
                stickyHeader
                defaultSort={{ id: "sortOrder", dir: "asc" }}
              />
            </div>
          </DashboardSection.Body>
        </DashboardSection>
      )}

      <Dialog
        open={state.dialogOpen}
        onClose={() => dispatch({ type: TierEditorActionType.CloseDialog })}
        title={state.editingTier ? dm.tierEdit : dm.tierCreate}
        titleIcon={<StackIcon weight="duotone" className="w-6 h-6 text-[var(--ds-text-muted)]" />}
        maxWidth="sm"
      >
        <TierForm
          data={state.form}
          onChange={(p) => dispatch({ type: TierEditorActionType.SetForm, patch: p })}
          errors={state.errors}
        />
        <Dialog.Footer>
          <button
            type="button"
            className="rounded-button border border-[var(--ds-border)] px-4 py-2 text-sm text-[var(--ds-text-muted)]"
            onClick={() => dispatch({ type: TierEditorActionType.CloseDialog })}
          >
            {cm.cancel}
          </button>
          <button
            type="button"
            className="rounded-button bg-[var(--ds-accent)] text-[var(--ds-on-accent)] px-4 py-2 text-sm font-medium"
            onClick={handleSave}
          >
            {state.editingTier ? cm.save : cm.create}
          </button>
        </Dialog.Footer>
      </Dialog>

      <Dialog
        open={state.deleteConfirm !== null}
        onClose={() => dispatch({ type: TierEditorActionType.CancelDelete })}
        title={dm.tierDeleteTitle}
        titleIcon={<TrashIcon weight="duotone" className="w-6 h-6 text-red-400" />}
        maxWidth="sm"
      >
        <div className="px-6 py-4 text-sm text-[var(--ds-text-muted)]">{dm.tierDeleteConfirm}</div>
        <Dialog.Footer>
          <button
            type="button"
            className="rounded-button border border-[var(--ds-border)] px-4 py-2 text-sm text-[var(--ds-text-muted)]"
            onClick={() => dispatch({ type: TierEditorActionType.CancelDelete })}
          >
            {cm.cancel}
          </button>
          <button
            type="button"
            className="rounded-button bg-red-500 text-white px-4 py-2 text-sm font-medium"
            onClick={() => state.deleteConfirm && handleDelete(state.deleteConfirm)}
          >
            {cm.delete}
          </button>
        </Dialog.Footer>
      </Dialog>
    </PageLayout>
  );
}

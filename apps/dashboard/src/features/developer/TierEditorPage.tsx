import { DashboardActionButton, DashboardActionId, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import {
  CheckCircle as CheckCircleIcon,
  PencilSimple as PencilSimpleIcon,
  PlusCircle as PlusCircleIcon,
  Stack as StackIcon,
  Trash as TrashIcon,
  XCircle as XCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useReducer } from "react";
import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dialog, dialogHeaderIconClass } from "@/components/ui/Dialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { useI18n } from "@/context/I18nContext";
import type { TierResponse } from "@/features/developer/api";
import { useCreateTier, useDeleteTier, useTiers, useUpdateTier } from "@/features/developer/hooks/useDeveloperData";
import { FormLabel, FormLabelText, formInputClass, formTextareaClass } from "@/shared/ui/FormPrimitives";

// -----------------------------------------------------------------------------
// Tier form data & validation
// -----------------------------------------------------------------------------

interface TierFormData {
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired: boolean;
  price: string;
  color: string;
  description: string;
  sortOrder: number;
}

const EMPTY_FORM: TierFormData = {
  name: "",
  requestsPerMinute: 60,
  requestsPerDay: 10000,
  attributionRequired: false,
  price: "",
  color: "#64748b",
  description: "",
  sortOrder: 0,
};

function toSubmitBody(data: TierFormData) {
  return {
    name: data.name,
    requestsPerMinute: data.requestsPerMinute,
    requestsPerDay: data.requestsPerDay,
    attributionRequired: data.attributionRequired,
    price: data.price || null,
    color: data.color,
    description: data.description,
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

// -----------------------------------------------------------------------------
// Reducer
// -----------------------------------------------------------------------------

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
          color: action.tier.color,
          description: action.tier.description,
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

// -----------------------------------------------------------------------------
// Tier form dialog (create / edit)
// -----------------------------------------------------------------------------

interface TierFormDialogProps {
  open: boolean;
  editingTier: TierResponse | null;
  form: TierFormData;
  errors: Partial<Record<keyof TierFormData, string>>;
  dm: ReturnType<typeof useI18n>["messages"]["developer"];
  cm: ReturnType<typeof useI18n>["messages"]["common"];
  onClose: () => void;
  onFormChange: (patch: Partial<TierFormData>) => void;
  onSave: () => void;
}

/**
 * Modal form for creating or editing a single API tier.
 *
 * Renders inputs for name, a free-text description, per-minute / per-day request
 * limits, an attribution-required toggle, an optional display price and a sort order.
 * The dialog is presentational: validation errors are passed in via `errors`
 * and all state changes are surfaced through the `onFormChange` / `onSave`
 * callbacks.
 *
 * @param open - Whether the dialog is visible.
 * @param editingTier - The tier being edited, or `null` for create mode (drives title and submit label).
 * @param form - Current form values.
 * @param errors - Per-field validation messages to display.
 * @param dm - Developer section of the localized dashboard messages.
 * @param cm - Common (shared) localized dashboard messages.
 * @param onClose - Invoked when the dialog is dismissed.
 * @param onFormChange - Invoked with a partial patch whenever a field changes.
 * @param onSave - Invoked when the user confirms create/save.
 */
function TierFormDialog({
  open,
  editingTier,
  form,
  errors,
  dm,
  cm,
  onClose,
  onFormChange,
  onSave,
}: TierFormDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editingTier ? dm.tierEdit : dm.tierCreate}
      titleIcon={<StackIcon weight="duotone" className={dialogHeaderIconClass} />}
      maxWidth="sm"
    >
      <div className="p-6 space-y-3">
        <div>
          <FormLabel htmlFor="tier-name">{dm.colName}</FormLabel>
          <input
            id="tier-name"
            aria-label={dm.colName}
            type="text"
            className={formInputClass}
            value={form.name}
            onChange={(e) => onFormChange({ name: e.target.value })}
            placeholder="e.g. Pro"
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>

        <div>
          <FormLabel htmlFor="tier-description">{dm.colDescription}</FormLabel>
          <textarea
            id="tier-description"
            aria-label={dm.colDescription}
            className={formTextareaClass}
            value={form.description}
            onChange={(e) => onFormChange({ description: e.target.value })}
            maxLength={500}
            placeholder="e.g. For hobby projects and evaluation."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FormLabel htmlFor="tier-rpm">{dm.detailRateLimitMinute}</FormLabel>
            <input
              id="tier-rpm"
              aria-label={dm.detailRateLimitMinute}
              type="number"
              className={formInputClass}
              value={form.requestsPerMinute}
              onChange={(e) => onFormChange({ requestsPerMinute: Number(e.target.value) })}
              min={1}
            />
            {errors.requestsPerMinute && <p className="text-xs text-red-400 mt-1">{errors.requestsPerMinute}</p>}
          </div>
          <div>
            <FormLabel htmlFor="tier-rpd">{dm.detailRateLimitDay}</FormLabel>
            <input
              id="tier-rpd"
              aria-label={dm.detailRateLimitDay}
              type="number"
              className={formInputClass}
              value={form.requestsPerDay}
              onChange={(e) => onFormChange({ requestsPerDay: Number(e.target.value) })}
              min={1}
            />
            {errors.requestsPerDay && <p className="text-xs text-red-400 mt-1">{errors.requestsPerDay}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            id="tier-attribution"
            aria-label={dm.colAttribution}
            type="checkbox"
            className="rounded"
            checked={form.attributionRequired}
            onChange={(e) => onFormChange({ attributionRequired: e.target.checked })}
          />
          <FormLabelText>{dm.colAttribution}</FormLabelText>
        </div>

        <div>
          <FormLabel htmlFor="tier-price">{dm.colPrice}</FormLabel>
          <input
            id="tier-price"
            aria-label={dm.colPrice}
            type="text"
            className={formInputClass}
            value={form.price}
            onChange={(e) => onFormChange({ price: e.target.value })}
            placeholder='e.g. "€ 9,90/Monat"'
          />
        </div>

        <div>
          <FormLabel htmlFor="tier-color">{dm.colColor}</FormLabel>
          <div className="flex items-center gap-2">
            <input
              id="tier-color"
              aria-label={dm.colColor}
              type="color"
              className="size-9 shrink-0 overflow-hidden rounded-full border border-[var(--ds-border)] bg-[var(--ds-bg)] p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
              value={form.color}
              onChange={(e) => onFormChange({ color: e.target.value })}
            />
            <span className="font-mono text-sm text-[var(--ds-text-muted)]">{form.color}</span>
          </div>
        </div>

        <div>
          <FormLabel htmlFor="tier-sort">{dm.colSortOrder}</FormLabel>
          <input
            id="tier-sort"
            aria-label={dm.colSortOrder}
            type="number"
            className={formInputClass}
            value={form.sortOrder}
            onChange={(e) => onFormChange({ sortOrder: Number(e.target.value) })}
          />
        </div>
      </div>
      <Dialog.Footer>
        <DashboardActionButton
          action={DashboardActionId.Cancel}
          icon={false}
          label={cm.cancel}
          onClick={onClose}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Save}
          label={editingTier ? cm.save : cm.create}
          onClick={onSave}
          type="button"
        />
      </Dialog.Footer>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Delete confirmation dialog
// -----------------------------------------------------------------------------

/**
 * Confirmation dialog shown before deleting a tier.
 *
 * @param open - Whether the dialog is visible.
 * @param dm - Developer section of the localized dashboard messages.
 * @param cm - Common (shared) localized dashboard messages.
 * @param onClose - Invoked when the deletion is cancelled.
 * @param onDelete - Invoked when the user confirms deletion.
 */
function TierDeleteConfirmDialog({
  open,
  dm,
  cm,
  onClose,
  onDelete,
}: {
  open: boolean;
  dm: ReturnType<typeof useI18n>["messages"]["developer"];
  cm: ReturnType<typeof useI18n>["messages"]["common"];
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={dm.tierDeleteTitle}
      titleIcon={<TrashIcon weight="duotone" className={dialogHeaderIconClass} />}
      maxWidth="sm"
    >
      <div className="p-6 text-sm text-[var(--ds-text-muted)]">{dm.tierDeleteConfirm}</div>
      <Dialog.Footer>
        <DashboardActionButton
          action={DashboardActionId.Cancel}
          icon={false}
          label={cm.cancel}
          onClick={onClose}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Delete}
          label={cm.delete}
          onClick={onDelete}
          type="button"
          variant={DashboardButtonVariant.Danger}
        />
      </Dialog.Footer>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Table columns
// -----------------------------------------------------------------------------

/**
 * Builds the memoized column definitions for the tiers table.
 *
 * Columns: name, combined per-minute/per-day traffic, attribution requirement
 * badge, display price, sort order, and an edit/delete action pair.
 *
 * @param dm - Developer section of the localized dashboard messages.
 * @param cm - Common (shared) localized dashboard messages.
 * @param onEdit - Invoked with the tier when its edit action is triggered.
 * @param onDelete - Invoked with the tier id when its delete action is triggered.
 * @returns Stable column definitions, re-created only when a dependency changes.
 */
function useTierColumns(
  dm: ReturnType<typeof useI18n>["messages"]["developer"],
  cm: ReturnType<typeof useI18n>["messages"]["common"],
  onEdit: (tier: TierResponse) => void,
  onDelete: (id: string) => void,
): ColumnDef<TierResponse>[] {
  return useMemo<ColumnDef<TierResponse>[]>(
    () => [
      {
        id: "name",
        header: dm.colName,
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.name.toLowerCase(),
        cell: (a) => (
          <span className="inline-flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-full border border-[var(--ds-border)]"
              style={{ backgroundColor: a.color }}
              aria-hidden
            />
            <span className="font-medium">{a.name}</span>
          </span>
        ),
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
              onClick={() => onEdit(a)}
              icon={<PencilSimpleIcon weight="duotone" className="size-3" />}
              label={cm.edit}
            />
            <TableActionButton
              onClick={() => onDelete(a.id)}
              variant={DashboardButtonVariant.Danger}
              icon={<TrashIcon weight="duotone" className="size-3" />}
              label={cm.delete}
            />
          </div>
        ),
      },
    ],
    [dm, cm, onEdit, onDelete],
  );
}

// -----------------------------------------------------------------------------
// TierEditorPage
// -----------------------------------------------------------------------------

/**
 * Admin page for managing API rate-limit tiers.
 *
 * Lists all tiers in a sortable table and provides create, edit and delete
 * flows via modal dialogs. While the tiers query is loading the page shows a
 * neutral {@link ContentLoadingView}; once settled it renders either the empty
 * state ({@link ContentUnavailableView}) or the populated table.
 */
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
  const confirmDelete = useCallback((id: string) => dispatch({ type: TierEditorActionType.ConfirmDelete, id }), []);

  const columns = useTierColumns(dm, cm, openEdit, confirmDelete);

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

  function handleDelete() {
    if (state.deleteConfirm) {
      deleteTier.mutate(state.deleteConfirm);
      dispatch({ type: TierEditorActionType.CancelDelete });
    }
  }

  const tierList = tiers ?? [];

  return (
    <PageLayout>
      <PageHeader title={dm.tiersTitle}>
        <DashboardActionButton
          action={DashboardActionId.Create}
          icon={<PlusCircleIcon weight="duotone" />}
          label={dm.tierCreate}
          onClick={openCreate}
        />
      </PageHeader>

      {isLoading && <ContentLoadingView className="flex-1 min-h-0" />}

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

      <TierFormDialog
        open={state.dialogOpen}
        editingTier={state.editingTier}
        form={state.form}
        errors={state.errors}
        dm={dm}
        cm={cm}
        onClose={() => dispatch({ type: TierEditorActionType.CloseDialog })}
        onFormChange={(patch) => dispatch({ type: TierEditorActionType.SetForm, patch })}
        onSave={handleSave}
      />

      <TierDeleteConfirmDialog
        open={state.deleteConfirm !== null}
        dm={dm}
        cm={cm}
        onClose={() => dispatch({ type: TierEditorActionType.CancelDelete })}
        onDelete={handleDelete}
      />
    </PageLayout>
  );
}

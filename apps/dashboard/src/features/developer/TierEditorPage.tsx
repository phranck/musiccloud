import {
  type ColumnDef,
  DashboardActionButton,
  DashboardActionId,
  DashboardButtonVariant,
  DataTable,
  DataTableScroll,
} from "@musiccloud/dashboard-ui";
import {
  CheckCircle as CheckCircleIcon,
  PencilSimple as PencilSimpleIcon,
  PlusCircle as PlusCircleIcon,
  Stack as StackIcon,
  Trash as TrashIcon,
  XCircle as XCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useReducer } from "react";
import { useNavigate } from "react-router";
import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dialog, dialogHeaderIconClass } from "@/components/ui/Dialog";
import { LabeledSwitch } from "@/components/ui/LabeledSwitch";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import type { TierResponse } from "@/features/developer/api";
import { TierFeatureBulletsEditor } from "@/features/developer/components/TierFeatureBulletsEditor";
import { TierIconGlyph, TierIconPicker } from "@/features/developer/components/TierIconPicker";
import { type FormFeatureBullet, toFormFeatures } from "@/features/developer/featureBullets";
import { useCreateTier, useDeleteTier, useTiers, useUpdateTier } from "@/features/developer/hooks/useDeveloperData";
import { FormLabel, formInputClass, formTextareaClass } from "@/shared/ui/FormPrimitives";

// -----------------------------------------------------------------------------
// Tier form data & validation
// -----------------------------------------------------------------------------

/**
 * Form-local representation of a single feature label with a stable `id`
 * used as the React list key and for reordering. The `id` is never sent to
 * the backend; it is assigned when populating the form from server data or
 * when the user adds a new row.
 */
interface TierFormData {
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired: boolean;
  price: string;
  priceYearly: string;
  color: string;
  icon: string | null;
  buttonLabel: string;
  description: string;
  enabled: boolean;
  disableReason: string;
  recommended: boolean;
  sortOrder: number;
  /** Ordered feature bullets for the public pricing card. At most 12 entries. */
  features: FormFeatureBullet[];
}

const EMPTY_FORM: TierFormData = {
  name: "",
  requestsPerMinute: 60,
  requestsPerDay: 10000,
  attributionRequired: false,
  price: "",
  priceYearly: "",
  color: "#64748b",
  icon: null,
  buttonLabel: "",
  description: "",
  enabled: true,
  disableReason: "",
  recommended: false,
  sortOrder: 0,
  features: [],
};

/** Maximum number of feature bullets the backend accepts per tier. */

function toSubmitBody(data: TierFormData) {
  return {
    name: data.name,
    requestsPerMinute: data.requestsPerMinute,
    requestsPerDay: data.requestsPerDay,
    attributionRequired: data.attributionRequired,
    price: data.price || null,
    priceYearly: data.priceYearly || null,
    color: data.color,
    icon: data.icon,
    buttonLabel: data.buttonLabel.trim() || null,
    description: data.description,
    enabled: data.enabled,
    disableReason: data.disableReason,
    recommended: data.recommended,
    sortOrder: data.sortOrder,
    // Strip rows whose label is blank so the backend never receives an empty label.
    features: data.features.reduce<string[]>((acc, f) => {
      const label = f.label.trim();
      if (label !== "") acc.push(label);
      return acc;
    }, []),
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
  /** What the server refused the last save with, or `null` when it did not. */
  saveError: string | null;
  deleteConfirm: string | null;
}

const TierEditorActionType = {
  OpenCreate: "OPEN_CREATE",
  OpenEdit: "OPEN_EDIT",
  CloseDialog: "CLOSE_DIALOG",
  SetForm: "SET_FORM",
  SetErrors: "SET_ERRORS",
  SaveFailed: "SAVE_FAILED",
  ConfirmDelete: "CONFIRM_DELETE",
  CancelDelete: "CANCEL_DELETE",
} as const;

type TierEditorAction =
  | { type: typeof TierEditorActionType.OpenCreate }
  | { type: typeof TierEditorActionType.OpenEdit; tier: TierResponse }
  | { type: typeof TierEditorActionType.CloseDialog }
  | { type: typeof TierEditorActionType.SetForm; patch: Partial<TierFormData> }
  | { type: typeof TierEditorActionType.SetErrors; errors: Partial<Record<keyof TierFormData, string>> }
  | { type: typeof TierEditorActionType.SaveFailed; message: string }
  | { type: typeof TierEditorActionType.ConfirmDelete; id: string }
  | { type: typeof TierEditorActionType.CancelDelete };

/**
 * The sentence to show when a save is refused.
 *
 * The backend answers a rejected write with a message naming what it refused
 * and why, which is more use than any wording here, so that one wins. The
 * generic line covers a failure that carries nothing to quote, such as a lost
 * connection.
 *
 * @param error - Whatever the mutation rejected with.
 * @param cm - The common copy, for the fallback wording.
 * @returns The message to put in front of the user.
 */
function saveErrorMessage(error: unknown, cm: (typeof dashboardCopy)["common"]): string {
  const message = error instanceof Error ? error.message.trim() : "";
  return message === "" ? `${cm.saveError}: ${cm.unknownError}` : message;
}

function tierEditorReducer(state: TierEditorState, action: TierEditorAction): TierEditorState {
  switch (action.type) {
    case TierEditorActionType.OpenCreate:
      return { ...state, dialogOpen: true, editingTier: null, form: EMPTY_FORM, errors: {}, saveError: null };
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
          priceYearly: action.tier.priceYearly ?? "",
          color: action.tier.color,
          icon: action.tier.icon,
          buttonLabel: action.tier.buttonLabel ?? "",
          description: action.tier.description,
          enabled: action.tier.enabled,
          disableReason: action.tier.disableReason,
          recommended: action.tier.recommended,
          sortOrder: action.tier.sortOrder,
          features: toFormFeatures(action.tier.features ?? []),
        },
        errors: {},
        saveError: null,
      };
    case TierEditorActionType.CloseDialog:
      return { ...state, dialogOpen: false };
    case TierEditorActionType.SetForm:
      return { ...state, form: { ...state.form, ...action.patch } };
    case TierEditorActionType.SetErrors:
      return { ...state, errors: action.errors };
    case TierEditorActionType.SaveFailed:
      // The dialog stays open, because closing it on a refusal is what makes a
      // rejected save look like nothing having happened.
      return { ...state, saveError: action.message };
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
  /** What the server refused the last save with, shown beside the actions. */
  saveError: string | null;
  dm: (typeof dashboardCopy)["developer"];
  cm: (typeof dashboardCopy)["common"];
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
 * @param saveError - What the server refused the last save with, or `null`.
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
  saveError,
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
          <div className="flex items-start gap-3">
            <div className="flex-1">
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
            <LabeledSwitch
              id="tier-active"
              label={dm.colActive}
              checked={form.enabled}
              onChange={(checked) => onFormChange({ enabled: checked })}
            />
            <LabeledSwitch
              id="tier-recommended"
              label={dm.colRecommended}
              checked={form.recommended}
              onChange={(checked) => onFormChange({ recommended: checked })}
            />
          </div>

          {/* Stays mounted so the reveal can animate; grid-row + opacity
              transition lives in index.css (.field-reveal). */}
          <div className={`field-reveal${form.enabled ? "" : " is-open"}`}>
            <div>
              <div className="pt-3">
                <FormLabel htmlFor="tier-disable-reason">{dm.colDisableReason}</FormLabel>
                <textarea
                  id="tier-disable-reason"
                  aria-label={dm.colDisableReason}
                  className={formTextareaClass}
                  value={form.disableReason}
                  onChange={(e) => onFormChange({ disableReason: e.target.value })}
                  maxLength={200}
                  placeholder="e.g. Replaced by the new Pro plan."
                />
              </div>
            </div>
          </div>
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

        <TierIconPicker
          value={form.icon}
          onChange={(icon) => onFormChange({ icon })}
          label={dm.colIcon}
          searchPlaceholder={dm.iconPickerSearch}
          noneLabel={dm.iconNone}
        />

        <div className="flex items-start gap-3">
          <div className="flex-1">
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
          <div className="flex-1">
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
          <LabeledSwitch
            id="tier-attribution"
            label={dm.colAttribution}
            checked={form.attributionRequired}
            onChange={(checked) => onFormChange({ attributionRequired: checked })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FormLabel htmlFor="tier-price">{dm.colPriceMonthly}</FormLabel>
            <input
              id="tier-price"
              aria-label={dm.colPriceMonthly}
              type="text"
              inputMode="decimal"
              className={formInputClass}
              value={form.price}
              onChange={(e) => onFormChange({ price: e.target.value })}
              placeholder="e.g. 9.90"
            />
          </div>
          <div>
            <FormLabel htmlFor="tier-price-yearly">{dm.colPriceYearly}</FormLabel>
            <input
              id="tier-price-yearly"
              aria-label={dm.colPriceYearly}
              type="text"
              inputMode="decimal"
              className={formInputClass}
              value={form.priceYearly}
              onChange={(e) => onFormChange({ priceYearly: e.target.value })}
              placeholder="e.g. 99"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FormLabel htmlFor="tier-color">{dm.colColor}</FormLabel>
            <div className="flex items-center gap-2">
              <input
                id="tier-color"
                aria-label={dm.colColor}
                type="color"
                className="size-9 shrink-0 cursor-pointer appearance-none overflow-hidden rounded-full border border-[var(--ds-border)] bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
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

        <div>
          <FormLabel htmlFor="tier-button-label">{dm.colButtonLabel}</FormLabel>
          <input
            id="tier-button-label"
            aria-label={dm.colButtonLabel}
            type="text"
            className={formInputClass}
            value={form.buttonLabel}
            onChange={(e) => onFormChange({ buttonLabel: e.target.value })}
            maxLength={40}
            placeholder={dm.colButtonLabelPlaceholder}
          />
        </div>

        <TierFeatureBulletsEditor
          features={form.features}
          onChange={(features) => onFormChange({ features })}
          dm={dm}
        />

        <p className="text-xs text-[var(--ds-text-muted)]">{dm.planCreateThenEdit}</p>
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
        {saveError && (
          <p role="alert" className="mr-auto text-sm text-[var(--ds-danger-text)]">
            {saveError}
          </p>
        )}
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
  dm: (typeof dashboardCopy)["developer"];
  cm: (typeof dashboardCopy)["common"];
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
  dm: (typeof dashboardCopy)["developer"],
  cm: (typeof dashboardCopy)["common"],
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
          <span className="inline-flex items-center gap-2 font-medium" style={{ color: a.color }}>
            {a.icon ? (
              <TierIconGlyph name={a.icon} className="size-6" />
            ) : (
              <span
                className="size-3 shrink-0 rounded-full border border-[var(--ds-border)]"
                style={{ backgroundColor: a.color }}
                aria-hidden
              />
            )}
            <span>{a.name}</span>
            {!a.enabled && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-400">
                {dm.tierDisabledBadge}
              </span>
            )}
            {a.recommended && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs font-semibold text-emerald-400">
                {dm.tierRecommendedBadge}
              </span>
            )}
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
        cell: (a) => (
          <span className="text-[var(--ds-text-muted)]">
            {a.price ?? "—"}
            {a.priceYearly != null && <span className="text-xs"> / {a.priceYearly} p.a.</span>}
          </span>
        ),
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
  const messages = dashboardCopy;
  const dm = messages.developer;
  const cm = messages.common;
  const { data: tiers, isLoading } = useTiers();
  const navigate = useNavigate();
  const createTier = useCreateTier();
  const _updateTier = useUpdateTier();
  const deleteTier = useDeleteTier();
  const [state, dispatch] = useReducer(tierEditorReducer, {
    dialogOpen: false,
    editingTier: null,
    form: EMPTY_FORM,
    errors: {},
    saveError: null,
    deleteConfirm: null,
  });

  const openCreate = useCallback(() => dispatch({ type: TierEditorActionType.OpenCreate }), []);
  // Editing a plan is a page of its own, because a plan carries an unbounded
  // list of offers and every field Creem accepts. The dialog is left with the
  // one thing a page cannot do, which is bring a plan into being.
  const openEdit = useCallback((tier: TierResponse) => navigate(`/developer/plans/${tier.id}`), [navigate]);
  const confirmDelete = useCallback((id: string) => dispatch({ type: TierEditorActionType.ConfirmDelete, id }), []);

  const columns = useTierColumns(dm, cm, openEdit, confirmDelete);

  function handleSave() {
    const errs = validateForm(state.form);
    if (Object.keys(errs).length > 0) {
      dispatch({ type: TierEditorActionType.SetErrors, errors: errs });
      return;
    }
    const outcome = {
      onSuccess: () => dispatch({ type: TierEditorActionType.CloseDialog }),
      onError: (error: unknown) =>
        dispatch({ type: TierEditorActionType.SaveFailed, message: saveErrorMessage(error, cm) }),
    };

    createTier.mutate(toSubmitBody(state.form), {
      ...outcome,
      onSuccess: (created) => {
        dispatch({ type: TierEditorActionType.CloseDialog });
        navigate(`/developer/plans/${created.id}`);
      },
    });
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
            <DataTable
              columns={columns}
              data={tierList}
              getRowKey={(t) => t.id}
              defaultSort={{ id: "sortOrder", dir: "asc" }}
            >
              <DataTable.Viewport scroll={DataTableScroll.Self}>
                <DataTable.Head sticky />
                <DataTable.Rows />
              </DataTable.Viewport>
            </DataTable>
          </DashboardSection.Body>
        </DashboardSection>
      )}

      <TierFormDialog
        open={state.dialogOpen}
        editingTier={state.editingTier}
        form={state.form}
        errors={state.errors}
        saveError={state.saveError}
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

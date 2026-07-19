import { DashboardActionButton, DashboardActionId, DashboardInput } from "@musiccloud/dashboard-ui";
import { SpinnerGap as SpinnerGapIcon, User as UserIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { dashboardCopy } from "@/copy/dashboard";
import { TierDropdown } from "@/features/developer/components/TierDropdown";
import { DeveloperAccountStatus } from "@/features/developer/domain";
import {
  useDeleteDeveloperAccount,
  useDeveloperAccount,
  useUpdateDeveloperAccount,
} from "@/features/developer/hooks/useDeveloperData";
import { Dialog } from "@/shared/ui/Dialog";

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

/**
 * Editable developer account fields as drafted by the admin, kept separate
 * from the loaded account so unsaved edits survive re-renders without a
 * sync effect.
 */
interface AccountDraft {
  email: string;
  displayName: string;
  /** Assigned tier id, or `null` for "no tier". */
  tierId: string | null;
}

/**
 * Admin detail page for a single developer account.
 *
 * Lets the admin edit email, display name and plan, toggle the account
 * between active and suspended, and delete the account (with confirmation
 * dialog). Deleting navigates back to the accounts list.
 *
 * Form inputs use a draft state that falls back to the loaded account values
 * until the admin edits them (derived state, no sync effect).
 */
export function DeveloperDetailPage() {
  const { id } = useParams<{ id: string }>();
  const messages = dashboardCopy;
  const dm = messages.developer;
  const navigate = useNavigate();
  const { data: account, isLoading } = useDeveloperAccount(id!);
  const updateAccount = useUpdateDeveloperAccount();
  const deleteAccount = useDeleteDeveloperAccount();
  const [saved, setSaved] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [accountDraft, setAccountDraft] = useState<AccountDraft | null>(null);

  const form = accountDraft ?? {
    email: account?.email ?? "",
    displayName: account?.displayName ?? "",
    tierId: account?.tierId ?? null,
  };

  function handleBack() {
    navigate("/developer/accounts");
  }

  function handleSave() {
    updateAccount.mutate(
      { id: id!, email: form.email, displayName: form.displayName || null, tierId: form.tierId },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  }

  function handleToggleStatus() {
    const newStatus =
      account!.status === DeveloperAccountStatus.Active
        ? DeveloperAccountStatus.Suspended
        : DeveloperAccountStatus.Active;
    updateAccount.mutate(
      { id: id!, status: newStatus },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  }

  function handleDelete() {
    deleteAccount.mutate(id!, {
      onSuccess: () => navigate("/developer/accounts"),
    });
  }

  if (isLoading || !account) {
    return (
      <PageLayout>
        <PageHeader
          title=""
          renderLeading={() => <HeaderBackButton label={dm.accountDetailBackLabel} onClick={handleBack} />}
        />
        <div className="flex items-center justify-center py-12">
          <SpinnerGapIcon className="w-6 h-6 animate-spin text-[var(--ds-text-muted)]" />
        </div>
      </PageLayout>
    );
  }

  const isSuspended = account.status === DeveloperAccountStatus.Suspended;

  return (
    <>
      <PageLayout>
        <PageHeader
          title={account.email}
          renderLeading={() => <HeaderBackButton label={dm.accountDetailBackLabel} onClick={handleBack} />}
        />
        <div className="space-y-4">
          <DashboardSection className="overflow-hidden">
            <DashboardSection.Header
              icon={<UserIcon weight="duotone" className="size-4" />}
              title={dm.accountDetailTitle}
            />
            <DashboardSection.Body>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="dev-email" className={labelClass}>
                    {dm.colEmail}
                  </label>
                  <DashboardInput
                    id="dev-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setAccountDraft({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="dev-display-name" className={labelClass}>
                    {dm.colDisplayName}
                  </label>
                  <DashboardInput
                    id="dev-display-name"
                    type="text"
                    value={form.displayName}
                    onChange={(e) => setAccountDraft({ ...form, displayName: e.target.value })}
                  />
                </div>
                <div>
                  <span className={labelClass}>{dm.colTier}</span>
                  <TierDropdown
                    value={form.tierId}
                    onChange={(tierId) => setAccountDraft({ ...form, tierId })}
                    aria-label={dm.colTier}
                  />
                  {account.tierEnabled === false && form.tierId === account.tierId && (
                    <p className="mt-1.5 inline-flex rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-400">
                      {dm.tierInactiveBadge}
                    </p>
                  )}
                </div>
              </div>
            </DashboardSection.Body>
            <DashboardSection.Footer>
              <DashboardActionButton
                action={DashboardActionId.Delete}
                label={messages.common.delete}
                onClick={() => setShowDelete(true)}
                type="button"
                className="!bg-red-500/15 !text-red-400 !border-red-500/30 hover:!bg-red-500/25"
              />
              <DashboardActionButton
                action={DashboardActionId.Reject}
                label={isSuspended ? dm.accountDetailReactivate : dm.accountDetailDeactivate}
                onClick={handleToggleStatus}
                disabled={updateAccount.isPending}
                type="button"
                className="!bg-amber-500/20 !text-amber-400 !border-amber-500/30 hover:!bg-amber-500/30"
              />
              <DashboardActionButton
                action={DashboardActionId.Save}
                label={saved ? messages.common.saved : messages.common.save}
                onClick={handleSave}
                disabled={updateAccount.isPending}
                type="button"
              />
            </DashboardSection.Footer>
            {isSuspended && (
              <div className="px-4 pb-4">
                <p className="text-xs text-[var(--ds-text-muted)]">{dm.accountDetailDeactivateHint}</p>
              </div>
            )}
          </DashboardSection>
        </div>
      </PageLayout>

      <Dialog open={showDelete} title={dm.accountDetailDeleteConfirm} onClose={() => setShowDelete(false)}>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-[var(--ds-text)]">{dm.accountDetailDeleteHint}</p>
        </div>
        <Dialog.Footer>
          <DashboardActionButton
            action={DashboardActionId.Cancel}
            label={messages.common.cancel}
            onClick={() => setShowDelete(false)}
            type="button"
          />
          <DashboardActionButton
            action={DashboardActionId.Delete}
            label={messages.common.delete}
            onClick={handleDelete}
            disabled={updateAccount.isPending}
            type="button"
            className="!bg-red-500/15 !text-red-400 !border-red-500/30 hover:!bg-red-500/25"
          />
        </Dialog.Footer>
      </Dialog>
    </>
  );
}

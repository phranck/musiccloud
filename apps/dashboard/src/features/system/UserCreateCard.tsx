import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { CopyIcon, PersonIcon, PlusCircleIcon, UserCheckIcon, UserPlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { dashboardCopy } from "@/copy/dashboard";
import { useAuth } from "@/features/auth/AuthContext";
import { getSegmentedStorageKey } from "@/lib/segmented-storage";
import { AdminRole } from "@/shared/constants/domain";
import type { AdminUserInvite } from "@/shared/types/admin";
import { dialogHeaderIconClass } from "@/shared/ui/Dialog";
import { FormLabel, FormLabelText } from "@/shared/ui/FormPrimitives";
import { OverlayCard } from "@/shared/ui/OverlayCard";
import type { CreateUserFormData } from "./hooks/useAdminUsers";
import { EMPTY_CREATE_USER_FORM, useCreateUser } from "./hooks/useAdminUsers";

interface UserCreateCardProps {
  onClose: () => void;
  onCreated: () => void;
}

export function UserCreateCard({ onClose, onCreated }: UserCreateCardProps) {
  const messages = dashboardCopy;
  const { user } = useAuth();
  const common = messages.common;
  const usersMessages = messages.users;
  const roleOptions = [
    {
      value: AdminRole.Admin,
      label: usersMessages.role.admin,
      icon: <PersonIcon weight="duotone" className="w-3.5 h-3.5" />,
    },
    {
      value: AdminRole.Moderator,
      label: usersMessages.role.moderator,
      icon: <UserCheckIcon weight="duotone" className="w-3.5 h-3.5" />,
    },
  ] as const;
  const [form, setForm] = useState<CreateUserFormData>({ ...EMPTY_CREATE_USER_FORM, role: AdminRole.Admin });
  const [inviteResult, setInviteResult] = useState<AdminUserInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useCreateUser();

  function handleSubmit() {
    createMutation.mutate(form, {
      onSuccess: (result) => {
        setInviteResult(result);
        setCopied(false);
        onCreated();
      },
    });
  }

  async function handleCopyInviteLink() {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const canSubmit = form.username.trim().length >= 3 && form.email.trim().length > 0 && !createMutation.isPending;

  return (
    <OverlayCard
      open
      onClose={onClose}
      size={{ storageKey: "users:create-card-size" }}
      aria-label={usersMessages.createCard.title}
    >
      <OverlayCard.Header>
        <div className="flex items-center gap-3">
          <UserPlusIcon weight="duotone" className={dialogHeaderIconClass} />
          <h2 className="font-semibold text-[var(--ds-text)]">{usersMessages.createCard.title}</h2>
        </div>
      </OverlayCard.Header>

      <OverlayCard.Body className="space-y-4">
        {inviteResult ? (
          <div className="space-y-4">
            <div className="rounded-[var(--radius-card)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] p-4 space-y-2">
              <p className="text-sm font-medium text-[var(--ds-text)]">{usersMessages.createCard.inviteCreated}</p>
              <p className="text-sm text-[var(--ds-text-muted)]">{usersMessages.createCard.inviteHint}</p>
            </div>
            <div>
              <FormLabel htmlFor="uc-invite-url">{usersMessages.createCard.inviteLink}</FormLabel>
              <DashboardInput id="uc-invite-url" type="text" readOnly value={inviteResult.inviteUrl} />
            </div>
          </div>
        ) : (
          <>
            <div>
              <FormLabelText className="mb-2">{usersMessages.createCard.role}</FormLabelText>
              <SegmentedControl
                value={form.role ?? AdminRole.Admin}
                onChange={(role) => setForm((f) => ({ ...f, role }))}
                storageKey={getSegmentedStorageKey(user?.id, "users:create:role")}
                options={roleOptions}
              />
            </div>
            <div>
              <FormLabel htmlFor="uc-username">{usersMessages.createCard.username}</FormLabel>
              <DashboardInput
                id="uc-username"
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                minLength={3}
              />
            </div>
            <div>
              <FormLabel htmlFor="uc-email">{usersMessages.createCard.email}</FormLabel>
              <DashboardInput
                id="uc-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <p className="text-xs text-[var(--ds-text-subtle)]">{usersMessages.createCard.inviteFlowHint}</p>
            {createMutation.isError && (
              <p className="text-[var(--ds-danger-text)] text-sm">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : usersMessages.createCard.errorCreating}
              </p>
            )}
          </>
        )}
      </OverlayCard.Body>

      <OverlayCard.Footer className="flex justify-end gap-2">
        <DashboardActionButton
          action={DashboardActionId.Cancel}
          icon={false}
          label={common.cancel}
          onClick={onClose}
          size="control"
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        {inviteResult ? (
          <DashboardActionButton
            action={DashboardActionId.Copy}
            icon={<CopyIcon weight="duotone" className="size-3.5" />}
            label={copied ? common.copied : usersMessages.createCard.copyInvite}
            onClick={handleCopyInviteLink}
            size="control"
            type="button"
          />
        ) : (
          <DashboardActionButton
            action={DashboardActionId.Create}
            busyLabel={usersMessages.createCard.creating}
            disabled={!canSubmit}
            icon={<PlusCircleIcon weight="duotone" className="size-3.5" />}
            label={usersMessages.createCard.create}
            onClick={handleSubmit}
            size="control"
            status={createMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
            type="button"
          />
        )}
      </OverlayCard.Footer>
    </OverlayCard>
  );
}

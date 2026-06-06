import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { FileTextIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { ItemCard } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { useAuth } from "@/features/auth/AuthContext";
import { useAdminUsers, useDeleteUser } from "@/features/system/hooks/useAdminUsers";
import { AdminRole } from "@/shared/constants/domain";
import { Dialog, dialogHeaderIconClass } from "@/shared/ui/Dialog";

import { UserAvatar } from "./UserAvatar";
import { UserCreateCard } from "./UserCreateCard";
import { UserEditCard } from "./UserEditCard";

export function UsersPage() {
  const { messages } = useI18n();
  const common = messages.common;
  const usersMessages = messages.users;
  const { user: me } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useAdminUsers();
  const deleteMutation = useDeleteUser();

  const deleteTarget = users.find((u) => u.id === deleteId);

  return (
    <PageLayout>
      <PageHeader title={usersMessages.title}>
        <DashboardActionButton
          action={DashboardActionId.Create}
          icon={<PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />}
          label={usersMessages.inviteUser}
          onClick={() => setShowCreate(true)}
          size="control"
          type="button"
        />
      </PageHeader>

      <PageBody>
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => `sk-${i}`).map((key) => (
              <ItemCard key={key} className="h-16 animate-pulse" />
            ))}
          </div>
        )}

        <div className="space-y-2">
          {users.map((user) => (
            <ItemCard key={user.id} className="px-5 py-4 flex items-center gap-3">
              <UserAvatar username={user.username} avatarUrl={user.avatarUrl} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-[var(--ds-text)]">{user.username}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      user.role === AdminRole.Owner
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                        : user.role === AdminRole.Admin
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {user.role === AdminRole.Owner
                      ? usersMessages.role.owner
                      : user.role === AdminRole.Admin
                        ? usersMessages.role.admin
                        : usersMessages.role.moderator}
                  </span>
                  {user.id === me?.id && (
                    <span className="text-xs bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)] px-2 py-0.5 rounded-full">
                      {usersMessages.you}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--ds-text-subtle)]">{user.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(me?.isOwner || user.id === me?.id) && (
                  <DashboardActionButton
                    action={DashboardActionId.Edit}
                    icon={<FileTextIcon weight="duotone" className="w-3.5 h-3.5" />}
                    label={usersMessages.editCard.editTooltip}
                    onClick={() => setEditingUserId(user.id)}
                    size="control"
                    type="button"
                  />
                )}
                {me?.isOwner && user.id !== me?.id && (
                  <DashboardActionButton
                    action={DashboardActionId.Delete}
                    icon={<TrashIcon weight="duotone" className="w-3.5 h-3.5" />}
                    label={usersMessages.remove}
                    onClick={() => setDeleteId(user.id)}
                    size="control"
                    type="button"
                  />
                )}
              </div>
            </ItemCard>
          ))}
        </div>
      </PageBody>

      <Dialog
        open={deleteId !== null && !!deleteTarget}
        title={usersMessages.removeConfirmTitle}
        titleIcon={<TrashIcon weight="duotone" className={dialogHeaderIconClass} />}
        onClose={() => setDeleteId(null)}
      >
        <div className="px-6 py-3">
          <p className="text-sm text-[var(--ds-text-muted)]">
            <span className="font-medium">{deleteTarget?.username}</span> {usersMessages.removeConfirmDescription}
          </p>
        </div>
        <Dialog.Footer>
          <DashboardActionButton
            action={DashboardActionId.Cancel}
            icon={false}
            label={common.cancel}
            onClick={() => setDeleteId(null)}
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
          <DashboardActionButton
            action={DashboardActionId.Delete}
            busyLabel="\u2026"
            icon={false}
            label={common.remove}
            onClick={() => {
              if (deleteId !== null) deleteMutation.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
            }}
            status={deleteMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
            type="button"
          />
        </Dialog.Footer>
      </Dialog>

      {showCreate && <UserCreateCard onClose={() => setShowCreate(false)} onCreated={() => {}} />}

      {editingUserId !== null && (
        <UserEditCard
          userId={editingUserId}
          onClose={() => setEditingUserId(null)}
          onSaved={() => setEditingUserId(null)}
        />
      )}
    </PageLayout>
  );
}

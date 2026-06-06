import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { DownloadIcon, TrashIcon, TrayArrowUpIcon, UserCircleIcon } from "@phosphor-icons/react";
import md5 from "blueimp-md5";
import { type ChangeEvent, type Reducer, type RefObject, useEffect, useReducer, useRef } from "react";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { SaveNotification, useSaveNotification } from "@/components/ui/SaveNotification";
import { useI18n } from "@/context/I18nContext";
import { useAuth } from "@/features/auth/AuthContext";
import type { DashboardMessages } from "@/i18n/messages";
import { useKeyboardSave } from "@/lib/useKeyboardSave";
import { AdminRole, type EditableAdminRole } from "@/shared/constants/domain";
import type { AdminLocale, AdminUser } from "@/shared/types/admin";
import { AlertDialog } from "@/shared/ui/AlertDialog";
import { dialogHeaderIconClass } from "@/shared/ui/Dialog";
import { FormLabel, FormLabelText, formInputClass } from "@/shared/ui/FormPrimitives";
import { OverlayCard } from "@/shared/ui/OverlayCard";

import {
  useAdminUsers,
  useDeleteUserAvatar,
  useSaveUserAvatar,
  useSetGravatarAvatar,
  useUpdateUser,
} from "./hooks/useAdminUsers";

interface UserEditCardProps {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

type EditableRole = EditableAdminRole;

interface AvatarState {
  previewUrl: string | null;
  pendingFile: File | null;
  pendingGravatarUrl: string | null;
  deleted: boolean;
}

interface UserEditDraftState {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  locale: AdminLocale;
  role: EditableRole;
  logoutConfirm: boolean;
  sessionTimeoutMinutes: string;
  avatar: AvatarState;
}

type UserEditField = "username" | "email" | "password" | "firstName" | "lastName" | "sessionTimeoutMinutes";

const UserEditDraftActionType = {
  SetField: "setField",
  SetLocale: "setLocale",
  SetRole: "setRole",
  SetLogoutConfirm: "setLogoutConfirm",
  SetAvatar: "setAvatar",
} as const;

type UserEditDraftAction =
  | { type: typeof UserEditDraftActionType.SetField; field: UserEditField; value: string }
  | { type: typeof UserEditDraftActionType.SetLocale; value: AdminLocale }
  | { type: typeof UserEditDraftActionType.SetRole; value: EditableRole }
  | { type: typeof UserEditDraftActionType.SetLogoutConfirm; value: boolean }
  | { type: typeof UserEditDraftActionType.SetAvatar; value: AvatarState };

interface UserEditCardFormProps {
  common: DashboardMessages["common"];
  logoutConfirmLabel: string;
  me: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
  refreshAuth: () => Promise<void>;
  savedPhase: ReturnType<typeof useSaveNotification>["phase"];
  showSaved: ReturnType<typeof useSaveNotification>["show"];
  user: AdminUser;
  usersMessages: DashboardMessages["users"];
}

const EMPTY_AVATAR_STATE: AvatarState = {
  previewUrl: null,
  pendingFile: null,
  pendingGravatarUrl: null,
  deleted: false,
};

const userEditDraftReducer: Reducer<UserEditDraftState, UserEditDraftAction> = (state, action) => {
  switch (action.type) {
    case UserEditDraftActionType.SetField:
      return { ...state, [action.field]: action.value };
    case UserEditDraftActionType.SetLocale:
      return { ...state, locale: action.value };
    case UserEditDraftActionType.SetRole:
      return { ...state, role: action.value };
    case UserEditDraftActionType.SetLogoutConfirm:
      return { ...state, logoutConfirm: action.value };
    case UserEditDraftActionType.SetAvatar:
      return { ...state, avatar: action.value };
    default:
      return state;
  }
};

function createInitialDraft(user: AdminUser): UserEditDraftState {
  return {
    username: user.username,
    email: user.email ?? "",
    password: "",
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    locale: user.locale,
    role: user.role === AdminRole.Moderator ? AdminRole.Moderator : AdminRole.Admin,
    logoutConfirm: localStorage.getItem("logout-skip-confirm") !== "true",
    sessionTimeoutMinutes: user.sessionTimeoutMinutes != null ? String(user.sessionTimeoutMinutes) : "",
    avatar: { ...EMPTY_AVATAR_STATE, previewUrl: user.avatarUrl ?? null },
  };
}

function UserAvatarEditor({
  currentAvatarUrl,
  displayUsername,
  fileInputRef,
  onFileChange,
  onRemoveAvatar,
  onUseGravatar,
  usersMessages,
}: {
  currentAvatarUrl: string | null;
  displayUsername: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
  onUseGravatar: () => void;
  usersMessages: DashboardMessages["users"];
}) {
  return (
    <div className="flex flex-col items-center gap-3 shrink-0">
      <div className="w-24 h-24 rounded-full overflow-hidden ring-2 ring-[var(--ds-border)] bg-[var(--ds-bg-elevated)] flex items-center justify-center">
        {currentAvatarUrl ? (
          <img
            src={currentAvatarUrl}
            alt={displayUsername}
            width={96}
            height={96}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span className="text-3xl font-bold text-[var(--ds-text-subtle)] select-none">
            {displayUsername[0]?.toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 w-full">
        <DashboardActionButton
          action={DashboardActionId.Import}
          icon={<TrayArrowUpIcon weight="duotone" className="size-3.5 shrink-0" />}
          label={usersMessages.editCard.uploadImage}
          onClick={() => fileInputRef.current?.click()}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Copy}
          icon={<UserCircleIcon weight="duotone" className="size-3.5 shrink-0" />}
          label={usersMessages.editCard.useGravatar}
          onClick={onUseGravatar}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        {currentAvatarUrl && (
          <DashboardActionButton
            action={DashboardActionId.Delete}
            icon={<TrashIcon weight="duotone" className="size-3.5 shrink-0" />}
            label={usersMessages.editCard.removeAvatar}
            onClick={onRemoveAvatar}
            type="button"
          />
        )}
      </div>

      <input
        ref={fileInputRef}
        aria-label={usersMessages.editCard.uploadImage}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}

function UserProfileFields({
  canChangeRole,
  draft,
  logoutConfirmLabel,
  me,
  onFieldChange,
  onLocaleChange,
  onLogoutConfirmChange,
  onRoleChange,
  userId,
  usersMessages,
}: {
  canChangeRole: boolean;
  draft: UserEditDraftState;
  logoutConfirmLabel: string;
  me: AdminUser | null;
  onFieldChange: (field: UserEditField, value: string) => void;
  onLocaleChange: (value: AdminLocale) => void;
  onLogoutConfirmChange: (value: boolean) => void;
  onRoleChange: (value: EditableRole) => void;
  userId: string;
  usersMessages: DashboardMessages["users"];
}) {
  return (
    <div className="flex-1 space-y-3 min-w-0">
      <div>
        <FormLabel htmlFor="user-edit-username">{usersMessages.editCard.username}</FormLabel>
        <DashboardInput
          id="user-edit-username"
          type="text"
          value={draft.username}
          onChange={(e) => onFieldChange("username", e.target.value)}
        />
      </div>
      <div>
        <FormLabel htmlFor="user-edit-email">{usersMessages.editCard.email}</FormLabel>
        <DashboardInput
          id="user-edit-email"
          type="email"
          value={draft.email}
          onChange={(e) => onFieldChange("email", e.target.value)}
        />
      </div>
      <div>
        <FormLabel htmlFor="user-edit-first-name">{usersMessages.editCard.firstName}</FormLabel>
        <DashboardInput
          id="user-edit-first-name"
          type="text"
          value={draft.firstName}
          onChange={(e) => onFieldChange("firstName", e.target.value)}
        />
      </div>
      <div>
        <FormLabel htmlFor="user-edit-last-name">{usersMessages.editCard.lastName}</FormLabel>
        <DashboardInput
          id="user-edit-last-name"
          type="text"
          value={draft.lastName}
          onChange={(e) => onFieldChange("lastName", e.target.value)}
        />
      </div>
      {canChangeRole && (
        <div>
          <FormLabel htmlFor="user-edit-role">{usersMessages.editCard.role}</FormLabel>
          <select
            id="user-edit-role"
            value={draft.role}
            onChange={(e) => onRoleChange(e.target.value as EditableRole)}
            className={formInputClass}
          >
            <option value={AdminRole.Admin}>{usersMessages.editCard.roleAdmin}</option>
            <option value={AdminRole.Moderator}>{usersMessages.editCard.roleModerator}</option>
          </select>
        </div>
      )}
      <div>
        <FormLabel htmlFor="user-edit-password">{usersMessages.editCard.password}</FormLabel>
        <DashboardInput
          id="user-edit-password"
          type="password"
          value={draft.password}
          onChange={(e) => onFieldChange("password", e.target.value)}
          placeholder={usersMessages.editCard.passwordPlaceholder}
        />
      </div>
      {me?.id === userId && (
        <>
          <div>
            <FormLabelText>{usersMessages.editCard.language}</FormLabelText>
            <div className="inline-block">
              <LanguageToggle value={draft.locale} onChange={onLocaleChange} />
            </div>
          </div>
          <div>
            <FormLabel htmlFor="user-edit-session-timeout">{usersMessages.editCard.sessionTimeout}</FormLabel>
            <DashboardInput
              id="user-edit-session-timeout"
              type="number"
              min="1"
              max="480"
              value={draft.sessionTimeoutMinutes}
              onChange={(e) => onFieldChange("sessionTimeoutMinutes", e.target.value)}
              placeholder={usersMessages.editCard.sessionTimeoutNone}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none px-[5px] pt-1">
            <input
              type="checkbox"
              checked={draft.logoutConfirm}
              onChange={(e) => onLogoutConfirmChange(e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--color-primary)]"
            />
            <span className="text-xs text-[var(--ds-text-muted)]">{logoutConfirmLabel}</span>
          </label>
        </>
      )}
    </div>
  );
}

function UserEditCardForm({
  common,
  logoutConfirmLabel,
  me,
  onClose,
  onSaved,
  refreshAuth,
  savedPhase,
  showSaved,
  user,
  usersMessages,
}: UserEditCardFormProps) {
  const savedLogoutConfirm = localStorage.getItem("logout-skip-confirm") !== "true";
  const [draft, dispatch] = useReducer(userEditDraftReducer, user, createInitialDraft);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  const updateUser = useUpdateUser();
  const saveAvatar = useSaveUserAvatar();
  const setGravatar = useSetGravatarAvatar();
  const deleteAvatar = useDeleteUserAvatar();

  const isPending = updateUser.isPending || saveAvatar.isPending || setGravatar.isPending || deleteAvatar.isPending;
  const isError = updateUser.isError || saveAvatar.isError || setGravatar.isError || deleteAvatar.isError;
  const error = updateUser.error ?? saveAvatar.error ?? setGravatar.error ?? deleteAvatar.error;

  const canChangeRole = Boolean(me?.isOwner) && user.id !== me?.id && user.role !== AdminRole.Owner;
  const roleChanged =
    canChangeRole && draft.role !== (user.role === AdminRole.Moderator ? AdminRole.Moderator : AdminRole.Admin);
  const savedSessionTimeout = user.sessionTimeoutMinutes != null ? String(user.sessionTimeoutMinutes) : "";
  const hasChanges =
    draft.username !== user.username ||
    draft.email !== user.email ||
    draft.password.trim() !== "" ||
    draft.firstName !== (user.firstName ?? "") ||
    draft.lastName !== (user.lastName ?? "") ||
    draft.locale !== user.locale ||
    roleChanged ||
    draft.avatar.pendingFile !== null ||
    draft.avatar.pendingGravatarUrl !== null ||
    draft.avatar.deleted ||
    (me?.id === user.id &&
      (draft.logoutConfirm !== savedLogoutConfirm || draft.sessionTimeoutMinutes !== savedSessionTimeout));

  const canSave = hasChanges && draft.username.trim() !== "" && draft.email.trim() !== "" && !isPending;
  const currentAvatarUrl = draft.avatar.previewUrl;
  const displayUsername = draft.username || user.username;

  function setAvatarState(next: AvatarState) {
    if (previewObjectUrlRef.current && previewObjectUrlRef.current !== next.previewUrl) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    if (next.previewUrl?.startsWith("blob:")) {
      previewObjectUrlRef.current = next.previewUrl;
    }
    dispatch({ type: UserEditDraftActionType.SetAvatar, value: next });
  }

  useEffect(
    () => () => {
      if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    },
    [],
  );

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setAvatarState({ previewUrl, pendingFile: file, pendingGravatarUrl: null, deleted: false });
    e.target.value = "";
  }

  function handleGravatar() {
    const hash = md5(draft.email.trim().toLowerCase());
    const gravatarUrl = `https://www.gravatar.com/avatar/${hash}?s=256&d=mp`;
    setAvatarState({ previewUrl: gravatarUrl, pendingFile: null, pendingGravatarUrl: gravatarUrl, deleted: false });
  }

  function handleRemoveAvatar() {
    setAvatarState({ previewUrl: null, pendingFile: null, pendingGravatarUrl: null, deleted: true });
  }

  async function handleSave(close = true) {
    const profileChanges: Record<string, unknown> = {};
    if (draft.username !== user.username) profileChanges.username = draft.username;
    if (draft.email !== user.email) profileChanges.email = draft.email;
    if (draft.password.trim()) profileChanges.password = draft.password;
    if (draft.firstName !== (user.firstName ?? "")) profileChanges.firstName = draft.firstName;
    if (draft.lastName !== (user.lastName ?? "")) profileChanges.lastName = draft.lastName;
    if (draft.locale !== user.locale) profileChanges.locale = draft.locale;
    if (roleChanged) profileChanges.role = draft.role;
    if (me?.id === user.id && draft.sessionTimeoutMinutes !== savedSessionTimeout) {
      profileChanges.sessionTimeoutMinutes =
        draft.sessionTimeoutMinutes === "" ? null : Number(draft.sessionTimeoutMinutes);
    }

    if (Object.keys(profileChanges).length > 0) {
      await updateUser.mutateAsync({
        id: user.id,
        data: profileChanges as Parameters<typeof updateUser.mutateAsync>[0]["data"],
      });
    }

    if (draft.avatar.pendingFile) {
      await saveAvatar.mutateAsync({ id: user.id, file: draft.avatar.pendingFile });
    } else if (draft.avatar.pendingGravatarUrl) {
      await setGravatar.mutateAsync({ id: user.id, gravatarUrl: draft.avatar.pendingGravatarUrl });
    } else if (draft.avatar.deleted && user.avatarUrl) {
      await deleteAvatar.mutateAsync(user.id);
    }

    if (me?.id === user.id) {
      if (draft.logoutConfirm) localStorage.removeItem("logout-skip-confirm");
      else localStorage.setItem("logout-skip-confirm", "true");
      await refreshAuth();
    }

    if (close) onSaved();
    else showSaved();
  }

  useKeyboardSave(() => {
    if (hasChanges) void handleSave(false);
  });

  return (
    <OverlayCard
      open
      onClose={onClose}
      size={{ storageKey: "users:edit-card-size", defaultWidth: 512 }}
      aria-label={usersMessages.editCard.title}
    >
      <OverlayCard.Header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCircleIcon weight="duotone" className={dialogHeaderIconClass} />
          <h2 className="text-base font-semibold text-[var(--ds-text)]">{usersMessages.editCard.title}</h2>
        </div>
        <SaveNotification phase={savedPhase} label={common.saved} />
      </OverlayCard.Header>

      <OverlayCard.Body>
        <div className="flex gap-6 items-start">
          <UserAvatarEditor
            currentAvatarUrl={currentAvatarUrl}
            displayUsername={displayUsername}
            fileInputRef={fileInputRef}
            onFileChange={handleFileSelect}
            onRemoveAvatar={handleRemoveAvatar}
            onUseGravatar={handleGravatar}
            usersMessages={usersMessages}
          />
          <UserProfileFields
            canChangeRole={canChangeRole}
            draft={draft}
            logoutConfirmLabel={logoutConfirmLabel}
            me={me}
            onFieldChange={(field, value) => dispatch({ type: UserEditDraftActionType.SetField, field, value })}
            onLocaleChange={(value) => dispatch({ type: UserEditDraftActionType.SetLocale, value })}
            onLogoutConfirmChange={(value) => dispatch({ type: UserEditDraftActionType.SetLogoutConfirm, value })}
            onRoleChange={(value) => dispatch({ type: UserEditDraftActionType.SetRole, value })}
            userId={user.id}
            usersMessages={usersMessages}
          />
        </div>
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
        <DashboardActionButton
          action={DashboardActionId.Save}
          busyLabel={common.saving}
          disabled={!canSave}
          icon={<DownloadIcon weight="duotone" className="size-3.5" />}
          label={common.save}
          onClick={() => void handleSave()}
          size="control"
          status={isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          type="button"
        />
      </OverlayCard.Footer>

      <AlertDialog
        open={isError}
        title={usersMessages.editCard.errorSaving}
        onClose={() => {
          updateUser.reset();
          saveAvatar.reset();
          setGravatar.reset();
          deleteAvatar.reset();
        }}
        buttonLabel={common.close}
      >
        {error instanceof Error ? error.message : usersMessages.editCard.errorSaving}
      </AlertDialog>
    </OverlayCard>
  );
}

export function UserEditCard({ userId, onClose, onSaved }: UserEditCardProps) {
  const { messages } = useI18n();
  const common = messages.common;
  const usersMessages = messages.users;
  const { user: me, refresh } = useAuth();
  const { phase: savedPhase, show: showSaved } = useSaveNotification();
  const { data: users = [] } = useAdminUsers();

  const user = users.find((candidate) => candidate.id === userId);

  if (!user) {
    return (
      <OverlayCard
        open
        onClose={onClose}
        size={{ storageKey: "users:edit-card-size", defaultWidth: 512 }}
        aria-label={usersMessages.editCard.title}
      >
        <OverlayCard.Header className="flex items-center gap-3">
          <UserCircleIcon weight="duotone" className={dialogHeaderIconClass} />
          <h2 className="text-base font-semibold text-[var(--ds-text)]">{usersMessages.editCard.title}</h2>
        </OverlayCard.Header>
        <OverlayCard.Body>
          <p className="text-sm text-[var(--ds-text-muted)]">{common.loading}</p>
        </OverlayCard.Body>
      </OverlayCard>
    );
  }

  const userKey = [
    user.id,
    user.username,
    user.email,
    user.firstName ?? "",
    user.lastName ?? "",
    user.avatarUrl ?? "",
    user.role,
  ].join(":");

  return (
    <UserEditCardForm
      key={userKey}
      common={common}
      logoutConfirmLabel={messages.layout.sidebar.logoutConfirmLabel}
      me={me}
      onClose={onClose}
      onSaved={onSaved}
      refreshAuth={refresh}
      savedPhase={savedPhase}
      showSaved={showSaved}
      user={user}
      usersMessages={usersMessages}
    />
  );
}

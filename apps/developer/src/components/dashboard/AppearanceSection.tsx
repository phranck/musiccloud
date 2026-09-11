import { ENDPOINTS, MAX_DISPLAY_NAME_LENGTH } from "@musiccloud/shared";
import { type ChangeEvent, type SyntheticEvent, useCallback, useReducer, useState } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { AvatarPicker, MAX_UPLOAD_BYTES } from "@/components/dashboard/AvatarPicker";
import { ContentCard } from "@/components/docs/ContentCard";
import { sendAuth } from "@/lib/authClient";
import { announceAvatar } from "@/lib/avatarBroadcast";
import {
  type AvatarAccount,
  AvatarActionType,
  avatarChanges,
  avatarReducer,
  initialAvatarState,
} from "@/lib/avatarPickerState";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";
import { ProfileIcon } from "@/lib/icons";

/**
 * What this card knows about the account.
 *
 * @property displayName - What the portal calls them, or `null`.
 * @property firstName - Their given name, or `null`.
 * @property lastName - Their family name, or `null`.
 */
export interface AppearanceAccount extends AvatarAccount {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
}

/** Props for {@link AppearanceSection}. */
export interface AppearanceSectionProps {
  /** The account as the page rendered it. */
  account: AppearanceAccount;
}

/**
 * The card where a developer says how they appear: their names and their
 * picture.
 *
 * One save for both. Picking a picture shows it and nothing more, so a
 * developer can try one and leave the page without having changed their
 * account; what the save sends is only what actually differs.
 *
 * @param props - See {@link AppearanceSectionProps}.
 * @returns The appearance card.
 */
export function AppearanceSection({ account }: AppearanceSectionProps) {
  const [names, setNames] = useState({
    displayName: account.displayName ?? "",
    firstName: account.firstName ?? "",
    lastName: account.lastName ?? "",
  });
  const [picture, dispatch] = useReducer(avatarReducer, account, initialAvatarState);
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);
  const [error, setError] = useState<string | null>(null);

  const onField = useCallback(
    (field: keyof typeof names) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setNames((current) => ({ ...current, [field]: value }));
      setPhase(FormPhase.Idle);
      setError(null);
    },
    [],
  );

  const pictureChanges = avatarChanges(picture, account);
  const namesChanged =
    names.displayName.trim() !== (account.displayName ?? "") ||
    names.firstName.trim() !== (account.firstName ?? "") ||
    names.lastName.trim() !== (account.lastName ?? "");
  const changed = namesChanged || Object.keys(pictureChanges).length > 0;

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmed = {
        displayName: names.displayName.trim(),
        firstName: names.firstName.trim(),
        lastName: names.lastName.trim(),
      };
      if (Object.values(trimmed).some((value) => value.length > MAX_DISPLAY_NAME_LENGTH)) {
        setError(`Each name may be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`);
        return;
      }

      setPhase(FormPhase.Submitting);
      setError(null);

      const changes = pictureChanges;

      // The picture travels on its own request, because it is large and the
      // route that takes it carries the size caps.
      if (changes.upload) {
        const response = await fetch(ENDPOINTS.dev.auth.avatar, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: changes.upload }),
          credentials: "same-origin",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          setPhase(FormPhase.Error);
          setError(body?.message ?? "The picture could not be stored.");
          return;
        }
      } else if (changes.remove) {
        const response = await fetch(ENDPOINTS.dev.auth.avatar, { method: "DELETE", credentials: "same-origin" });
        if (!response.ok) {
          setPhase(FormPhase.Error);
          setError("The picture could not be removed.");
          return;
        }
      }

      // An empty field means "none", which is the same state as never having
      // set one, so both travel as null.
      const result = await sendAuth("PATCH", ENDPOINTS.dev.auth.profile, {
        displayName: trimmed.displayName === "" ? null : trimmed.displayName,
        firstName: trimmed.firstName === "" ? null : trimmed.firstName,
        lastName: trimmed.lastName === "" ? null : trimmed.lastName,
        ...(changes.gravatarUrl !== undefined ? { gravatarUrl: changes.gravatarUrl } : {}),
        ...(changes.avatarSource !== undefined ? { avatarSource: changes.avatarSource } : {}),
      });

      if (!result.ok) {
        setPhase(FormPhase.Error);
        setError(result.message ?? "Something went wrong. Please try again.");
        return;
      }

      // The account as it now stands, so the card stops offering to save what
      // it has already saved, and the header shows the picture without a reload.
      const me = await fetch(ENDPOINTS.dev.auth.me, { credentials: "same-origin" });
      const body = (await me.json().catch(() => null)) as { account?: AppearanceAccount } | null;
      if (body?.account) {
        dispatch({ type: AvatarActionType.Saved, account: body.account });
        announceAvatar(body.account.avatarUrl);
      }
      setPhase(FormPhase.Success);
    },
    [names, pictureChanges],
  );

  return (
    <ContentCard className="mb-6">
      <ContentCard.Header>
        <ContentCard.Header.Icon>
          <ProfileIcon aria-hidden="true" />
        </ContentCard.Header.Icon>
        <ContentCard.Header.Title>How you appear</ContentCard.Header.Title>
      </ContentCard.Header>
      <form onSubmit={onSubmit} noValidate>
        <ContentCard.Body>
          <ContentCard.Body.Copy>
            <div className="flex flex-wrap items-start gap-6">
              <AvatarPicker state={picture} dispatch={dispatch} />

              <div className="grid min-w-0 flex-1 items-start gap-4 sm:grid-cols-3">
                <TextField
                  name="firstName"
                  label="First name"
                  value={names.firstName}
                  onChange={onField("firstName")}
                  autoComplete="given-name"
                  required={false}
                  placeholder="Optional"
                />
                <TextField
                  name="lastName"
                  label="Last name"
                  value={names.lastName}
                  onChange={onField("lastName")}
                  autoComplete="family-name"
                  required={false}
                  placeholder="Optional"
                />
                <TextField
                  name="displayName"
                  label="Display name"
                  value={names.displayName}
                  onChange={onField("displayName")}
                  autoComplete="nickname"
                  required={false}
                  placeholder="Optional"
                  hint="What the portal calls you. Your address is shown when none is set."
                  error={error ?? undefined}
                />
              </div>
            </div>

            <p className="text-body text-fg-muted">
              JPEG, PNG or WebP, up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB. Nothing is stored until you save. Checking
              Gravatar asks gravatar.com whether your account has a picture, which is why it happens only when you press
              the button.
            </p>
          </ContentCard.Body.Copy>
        </ContentCard.Body>
        <ContentCard.Footer>
          <SubmitButton loading={phase === FormPhase.Submitting} disabled={!changed}>
            {phase === FormPhase.Success && !changed ? "Saved" : "Save"}
          </SubmitButton>
        </ContentCard.Footer>
      </form>
    </ContentCard>
  );
}

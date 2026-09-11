import { ENDPOINTS, MAX_DISPLAY_NAME_LENGTH } from "@musiccloud/shared";
import { type ChangeEvent, type SyntheticEvent, useCallback, useState } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { AvatarPicker, MAX_UPLOAD_BYTES } from "@/components/dashboard/AvatarPicker";
import { ContentCard } from "@/components/docs/ContentCard";
import { sendAuth } from "@/lib/authClient";
import type { AvatarAccount } from "@/lib/avatarPickerState";
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
 * The names are one form with one save. The picture is its own control, because
 * each of its actions stores itself and none of them waits for a save.
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

      // An empty field means "none", which is the same state as never having
      // set one, so both travel as null.
      const result = await sendAuth("PATCH", ENDPOINTS.dev.auth.profile, {
        displayName: trimmed.displayName === "" ? null : trimmed.displayName,
        firstName: trimmed.firstName === "" ? null : trimmed.firstName,
        lastName: trimmed.lastName === "" ? null : trimmed.lastName,
      });

      if (result.ok) {
        setPhase(FormPhase.Success);
        return;
      }
      setPhase(FormPhase.Error);
      setError(result.message ?? "Something went wrong. Please try again.");
    },
    [names],
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
              <AvatarPicker account={account} />

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
              JPEG, PNG or WebP, up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB. Checking Gravatar asks gravatar.com whether
              your address has a picture, which is why it happens only when you press the button.
            </p>
          </ContentCard.Body.Copy>
        </ContentCard.Body>
        <ContentCard.Footer>
          <SubmitButton loading={phase === FormPhase.Submitting}>
            {phase === FormPhase.Success ? "Saved" : "Save"}
          </SubmitButton>
        </ContentCard.Footer>
      </form>
    </ContentCard>
  );
}

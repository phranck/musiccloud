import { ENDPOINTS, MAX_DISPLAY_NAME_LENGTH } from "@musiccloud/shared";
import { type ChangeEvent, type SyntheticEvent, useCallback, useState } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { ContentCard } from "@/components/docs/ContentCard";
import { sendAuth } from "@/lib/authClient";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";
import { LoginIcon } from "@/lib/icons";

/**
 * Props for {@link SignInSection}.
 */
export interface SignInSectionProps {
  /** The address this account signs in with. Shown, never edited here. */
  email: string;
  /** The name shown in the portal, or `null` when none is set. */
  displayName: string | null;
}

/**
 * Dashboard card for how the account identifies itself.
 *
 * The sign-in address is read-only: changing it is an identity change rather
 * than a profile edit, and it is the only address that receives a password
 * reset. The display name is what the portal calls the developer, so it is
 * theirs to set, and clearing it falls back to the address.
 *
 * @param props - See {@link SignInSectionProps}.
 * @returns The sign-in card.
 */
export function SignInSection({ email, displayName }: SignInSectionProps) {
  const [value, setValue] = useState(displayName ?? "");
  // What a save put on file, or `null` while this page has saved nothing. The
  // prop is what the server had when the page rendered, so it stays the answer
  // until a save replaces it.
  const [savedHere, setSavedHere] = useState<{ displayName: string | null } | null>(null);
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);
  const [error, setError] = useState<string | null>(null);

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    setPhase(FormPhase.Idle);
    setError(null);
  }, []);

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmed = value.trim();
      if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
        setError(`A display name may be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`);
        return;
      }

      setPhase(FormPhase.Submitting);
      setError(null);

      const result = await sendAuth("PATCH", ENDPOINTS.dev.auth.profile, {
        displayName: trimmed === "" ? null : trimmed,
      });

      if (result.ok) {
        setSavedHere({ displayName: trimmed === "" ? null : trimmed });
        setPhase(FormPhase.Success);
        return;
      }

      setPhase(FormPhase.Error);
      setError(result.message ?? "Something went wrong. Please try again.");
    },
    [value],
  );

  const onFile = savedHere ? savedHere.displayName : displayName;

  return (
    <ContentCard className="mb-6">
      <ContentCard.Header>
        <ContentCard.Header.Icon>
          <LoginIcon aria-hidden="true" />
        </ContentCard.Header.Icon>
        <ContentCard.Header.Title>Sign-in</ContentCard.Header.Title>
      </ContentCard.Header>
      <form onSubmit={onSubmit} noValidate>
        <ContentCard.Body>
          <ContentCard.Body.Copy>
            <dl className="grid grid-cols-1 gap-y-1">
              <dt className="text-nav text-fg-subtle">Email</dt>
              <dd className="text-body text-fg">{email}</dd>
            </dl>
            <p className="text-body text-fg-muted">
              Your sign-in address cannot be changed here, because it is the one address that receives a password reset.
            </p>
            <TextField
              className="field--third"
              name="displayName"
              label="Display name"
              value={value}
              onChange={onChange}
              autoComplete="name"
              required={false}
              placeholder="Optional"
              hint={onFile ? `Currently ${onFile}.` : "Optional. Your address is shown when none is set."}
              error={error ?? undefined}
            />
          </ContentCard.Body.Copy>
        </ContentCard.Body>
        <ContentCard.Footer>
          <SubmitButton loading={phase === FormPhase.Submitting}>
            {phase === FormPhase.Success ? "Saved" : "Save name"}
          </SubmitButton>
        </ContentCard.Footer>
      </form>
    </ContentCard>
  );
}

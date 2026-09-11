import { ENDPOINTS } from "@musiccloud/shared";
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
  /** The address this account signs in with today. */
  email: string;
  /** An address asked for and not yet confirmed, or `null`. */
  pendingEmail: string | null;
  /** Whether this account has a password, which a GitHub-only one does not. */
  hasPassword: boolean;
}

/**
 * Dashboard card for the address the account signs in with.
 *
 * Changing it is an identity change, so it takes the password and a
 * confirmation from the new address. Nothing moves until that link is
 * followed, which is why the card keeps showing the old address whilst a
 * change is pending.
 *
 * @param props - See {@link SignInSectionProps}.
 * @returns The sign-in card.
 */
export function SignInSection({ email, pendingEmail, hasPassword }: SignInSectionProps) {
  // What this page has done, or `null` while it has done nothing. The prop is
  // what the server had when the page rendered, so it stays the answer until a
  // request here replaces it, and a copy of it would go stale instead.
  const [changedHere, setChangedHere] = useState<{ pendingEmail: string | null } | null>(null);
  const pending = changedHere ? changedHere.pendingEmail : pendingEmail;
  const [fields, setFields] = useState({ email: "", password: "" });
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);
  const [error, setError] = useState<string | null>(null);

  const onField = useCallback(
    (field: keyof typeof fields) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setFields((current) => ({ ...current, [field]: value }));
      setPhase(FormPhase.Idle);
      setError(null);
    },
    [],
  );

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPhase(FormPhase.Submitting);
      setError(null);

      const result = await sendAuth("POST", ENDPOINTS.dev.auth.changeEmail, {
        email: fields.email.trim(),
        password: fields.password,
      });

      if (result.ok) {
        setChangedHere({ pendingEmail: fields.email.trim().toLowerCase() });
        setFields({ email: "", password: "" });
        setPhase(FormPhase.Success);
        return;
      }
      setPhase(FormPhase.Error);
      setError(result.message ?? "That change could not be requested.");
    },
    [fields],
  );

  const onCancel = useCallback(async () => {
    setError(null);
    const response = await fetch(ENDPOINTS.dev.auth.changeEmail, { method: "DELETE", credentials: "same-origin" });
    if (!response.ok) {
      setError("That change could not be cancelled.");
      return;
    }
    setChangedHere({ pendingEmail: null });
    setPhase(FormPhase.Idle);
  }, []);

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
              <dt className="text-body text-fg-muted">Email</dt>
              <dd className="text-body text-fg">{email}</dd>
            </dl>

            {pending ? (
              <>
                <p className="text-body text-fg-muted">
                  You asked to sign in with <span className="text-fg">{pending}</span>. We sent a link there; until it
                  is followed, this address stays the one you sign in with.
                </p>
                <div>
                  <button type="button" className="button button--secondary" onClick={onCancel}>
                    Cancel the change
                  </button>
                </div>
                {error && <p className="text-body text-danger">{error}</p>}
              </>
            ) : hasPassword ? (
              <>
                <p className="text-body text-fg-muted">
                  This is also the only address that receives a password reset. Changing it needs your password and a
                  confirmation from the new address, and nothing moves until that link is followed.
                </p>
                <div className="grid items-start gap-4 sm:grid-cols-2">
                  <TextField
                    name="newEmail"
                    label="New address"
                    type="email"
                    value={fields.email}
                    onChange={onField("email")}
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                  <TextField
                    name="currentPassword"
                    label="Your password"
                    type="password"
                    value={fields.password}
                    onChange={onField("password")}
                    autoComplete="current-password"
                    error={error ?? undefined}
                  />
                </div>
              </>
            ) : (
              <p className="text-body text-fg-muted">
                You sign in through GitHub, so this is the address GitHub holds for you. Change it there and sign in
                again.
              </p>
            )}
          </ContentCard.Body.Copy>
        </ContentCard.Body>
        {!pending && hasPassword && (
          <ContentCard.Footer>
            <SubmitButton loading={phase === FormPhase.Submitting}>
              {phase === FormPhase.Success ? "Check your new address" : "Change address"}
            </SubmitButton>
          </ContentCard.Footer>
        )}
      </form>
    </ContentCard>
  );
}

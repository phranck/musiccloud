import { ENDPOINTS } from "@musiccloud/shared";
import { type ChangeEvent, type SyntheticEvent, useCallback, useState } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { ApiContent } from "@/components/docs/ApiContent";
import { ContentCard } from "@/components/docs/ContentCard";
import { postAuth } from "@/lib/authClient";
import { AuthErrorCode } from "@/lib/authErrors";
import { ButtonVariant } from "@/lib/buttonVariant";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";
import { ForbiddenIcon, Warning2Icon } from "@/lib/icons";

/** Where the browser lands once the account is deleted. */
const HOME_PATH = "/";

/** The warning both states of the card open with, so it reads the same either way. */
const INTRO = (
  <p className="text-body text-fg-muted">
    Deleting your account permanently removes your profile, API clients and tokens. This cannot be undone.
  </p>
);

/**
 * Props for {@link DeleteAccountSection}.
 */
export interface DeleteAccountSectionProps {
  /**
   * Whether the account has a password set. `true` shows a password field
   * that must match before deletion proceeds; `false` (GitHub-only accounts)
   * skips it, since there is no password to confirm.
   */
  hasPassword: boolean;
}

/**
 * Dashboard "Danger Zone" island: lets a developer permanently delete their
 * own account. Collapsed by default to a single warning line + a "Delete
 * account" button; clicking it reveals an inline confirmation panel (an
 * irreversibility notice, the password field when {@link hasPassword}, and
 * the final destructive submit) rather than deleting immediately. On success
 * it hard-navigates home so the cleared session takes effect, mirroring
 * the `AvatarMenu` logout.
 *
 * Rendered with `client:load` from `dashboard/index.astro`.
 *
 * @param props - See {@link DeleteAccountSectionProps}.
 * @returns The Danger Zone card content.
 */
export function DeleteAccountSection({ hasPassword }: DeleteAccountSectionProps) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);
  const [error, setError] = useState<string | null>(null);

  const onPassword = useCallback((event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value), []);

  const onReveal = useCallback(() => setRevealed(true), []);

  const onCancel = useCallback(() => {
    setRevealed(false);
    setPassword("");
    setError(null);
    setPhase(FormPhase.Idle);
  }, []);

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (hasPassword && !password) {
        setError("Password is required.");
        return;
      }

      setPhase(FormPhase.Submitting);
      setError(null);

      const result = await postAuth(ENDPOINTS.dev.auth.deleteAccount, hasPassword ? { password } : {});

      if (result.ok) {
        window.location.href = HOME_PATH;
        return;
      }

      setPhase(FormPhase.Error);
      setError(
        result.code === AuthErrorCode.InvalidCredentials
          ? "Incorrect password."
          : "Something went wrong. Please try again.",
      );
    },
    [hasPassword, password],
  );

  return (
    <>
      <ApiContent.Chapter.Header className="api-content__chapter-header--danger">
        <ApiContent.Chapter.Header.Icon>
          <Warning2Icon aria-hidden="true" />
        </ApiContent.Chapter.Header.Icon>
        <ApiContent.Chapter.Header.Title>Danger zone</ApiContent.Chapter.Header.Title>
      </ApiContent.Chapter.Header>

      <ContentCard>
        <ContentCard.Header>
          <ContentCard.Header.Icon>
            <ForbiddenIcon aria-hidden="true" />
          </ContentCard.Header.Icon>
          <ContentCard.Header.Title>Delete account</ContentCard.Header.Title>
        </ContentCard.Header>

        {!revealed ? (
          <>
            <ContentCard.Body>
              <ContentCard.Body.Copy>{INTRO}</ContentCard.Body.Copy>
            </ContentCard.Body>
            <ContentCard.Footer>
              <SubmitButton variant={ButtonVariant.Danger} type="button" onClick={onReveal}>
                Delete account
              </SubmitButton>
            </ContentCard.Footer>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <ContentCard.Body>
              <ContentCard.Body.Copy>
                {INTRO}
                <p className="status-message status-message--danger">This action is permanent and cannot be undone.</p>
                {hasPassword && (
                  <TextField
                    name="password"
                    label="Confirm your password"
                    type="password"
                    value={password}
                    onChange={onPassword}
                    autoComplete="current-password"
                    error={error ?? undefined}
                  />
                )}
                {!hasPassword && error ? <p className="field__message field__message--error">{error}</p> : null}
              </ContentCard.Body.Copy>
            </ContentCard.Body>
            <ContentCard.Footer>
              <SubmitButton variant={ButtonVariant.Secondary} type="button" onClick={onCancel}>
                Cancel
              </SubmitButton>
              <SubmitButton variant={ButtonVariant.Danger} loading={phase === FormPhase.Submitting}>
                Permanently delete account
              </SubmitButton>
            </ContentCard.Footer>
          </form>
        )}
      </ContentCard>
    </>
  );
}

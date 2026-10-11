import { ENDPOINTS } from "@musiccloud/shared";
import { type ChangeEvent, type SyntheticEvent, useCallback, useState } from "react";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { ContentCard } from "@/components/docs/ContentCard";
import { postAuth } from "@/lib/authClient";
import { AuthErrorCode, authErrorLabel } from "@/lib/authErrors";
import { AuthStatusTone } from "@/lib/authStatusTone";
import { ButtonVariant } from "@/lib/buttonVariant";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";

/**
 * Props for {@link ForgotForm}.
 */
export interface ForgotFormProps {
  /** The sentence shown above the field, saying what submitting will do. */
  subtitle: string;
}

/**
 * Password-reset request island. Posts the email to
 * `/api/dev/auth/request-reset`, which returns `200` whether or not the account
 * exists (no account-existence leak). The form therefore shows the same neutral
 * confirmation panel on success. It surfaces an error in two cases only: a
 * hard transport failure (status 0) so the developer can retry, and an address
 * the backend refuses as an address, which no account could hold anyway.
 *
 * Rendered with `client:load` from `forgot.astro`.
 *
 * @param props - See {@link ForgotFormProps}.
 * @returns The email form, or the post-submit confirmation panel.
 */
export function ForgotForm({ subtitle }: ForgotFormProps) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);
  const [emailError, setEmailError] = useState<string | null>(null);

  const onEmail = useCallback((event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value), []);

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPhase(FormPhase.Submitting);
      setEmailError(null);
      const result = await postAuth(ENDPOINTS.dev.auth.requestReset, { email });

      // An address the backend cannot use is the one refusal worth showing
      // here: it says nothing about who holds an account, and the confirmation
      // panel would otherwise promise a mail that was never sent.
      if (result.code === AuthErrorCode.InvalidEmail) {
        setEmailError(authErrorLabel(result.code, result.message));
        setPhase(FormPhase.Idle);
        return;
      }

      // Beyond that the endpoint never leaks existence (always 200); only a
      // transport failure (status 0) is worth retrying, so treat any response
      // as success.
      setPhase(result.ok || result.status > 0 ? FormPhase.Success : FormPhase.Error);
    },
    [email],
  );

  if (phase === FormPhase.Success) {
    return (
      <AuthStatus tone={AuthStatusTone.Info} title="Check your email">
        If an account exists for that address, a password-reset link is on its way.
      </AuthStatus>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <ContentCard.Body>
        <ContentCard.Body.Copy>
          <p className="text-body text-fg-muted">{subtitle}</p>
          {phase === FormPhase.Error ? (
            <p className="field__message field__message--error">Could not reach the server. Please try again.</p>
          ) : null}
          <TextField
            name="email"
            label="Email"
            type="email"
            value={email}
            onChange={onEmail}
            autoComplete="email"
            placeholder="you@example.com"
            error={emailError ?? undefined}
          />
        </ContentCard.Body.Copy>
      </ContentCard.Body>
      <ContentCard.Footer>
        <SubmitButton variant={ButtonVariant.Content} loading={phase === FormPhase.Submitting}>
          Send reset link
        </SubmitButton>
      </ContentCard.Footer>
    </form>
  );
}

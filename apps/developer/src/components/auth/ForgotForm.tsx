import { ENDPOINTS } from "@musiccloud/shared";
import { type ChangeEvent, type SyntheticEvent, useCallback, useState } from "react";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { postAuth } from "@/lib/authClient";
import { AuthStatusTone } from "@/lib/authStatusTone";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";

/**
 * Password-reset request island. Posts the email to
 * `/api/dev/auth/request-reset`, which always returns `200` regardless of
 * whether the account exists (no account-existence leak). The form therefore
 * shows the same neutral confirmation panel on success, and only surfaces an
 * error for a hard transport failure (status 0) so the developer can retry.
 *
 * Rendered with `client:load` from `forgot.astro`.
 *
 * @returns The email form, or the post-submit confirmation panel.
 */
export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);

  const onEmail = useCallback((event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value), []);

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPhase(FormPhase.Submitting);
      const result = await postAuth(ENDPOINTS.dev.auth.requestReset, { email });
      // The endpoint never leaks existence (always 200); only a transport
      // failure (status 0) is worth retrying, so treat any response as success.
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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
      />
      <SubmitButton loading={phase === FormPhase.Submitting}>Send reset link</SubmitButton>
    </form>
  );
}

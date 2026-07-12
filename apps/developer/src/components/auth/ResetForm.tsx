import { ENDPOINTS } from "@musiccloud/shared";
import { type ChangeEvent, type SyntheticEvent, useCallback, useState } from "react";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { postAuth } from "@/lib/authClient";
import { authErrorLabel } from "@/lib/authErrors";
import { AuthStatusTone } from "@/lib/authStatusTone";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";

/** Minimum password length the backend accepts (mirrors `PASSWORD_MIN_LENGTH`). */
const PASSWORD_MIN_LENGTH = 8;
/** Maximum password length the backend accepts (mirrors `PASSWORD_MAX_LENGTH`). */
const PASSWORD_MAX_LENGTH = 128;

/**
 * Props for {@link ResetForm}.
 */
export interface ResetFormProps {
  /** The password-reset token read from `?token=` by the page. */
  token: string;
}

/**
 * Password-reset island. Takes a new password plus a confirmation, checks they
 * match client-side (no round-trip on mismatch), then POSTs `{ token, password }`
 * to `/api/dev/auth/reset-password`. A `200` swaps to a success panel linking to
 * sign-in; a `400` (`INVALID_TOKEN`) or validation failure surfaces inline on
 * the confirm field.
 *
 * Rendered with `client:load` from `reset.astro`.
 *
 * @param props - See {@link ResetFormProps}.
 * @returns The reset form, or the post-submit success panel.
 */
export function ResetForm({ token }: ResetFormProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);
  const [error, setError] = useState<string | null>(null);

  const onPassword = useCallback((event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value), []);
  const onConfirm = useCallback((event: ChangeEvent<HTMLInputElement>) => setConfirm(event.target.value), []);

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (password !== confirm) {
        setError("Passwords do not match.");
        setPhase(FormPhase.Error);
        return;
      }

      setPhase(FormPhase.Submitting);
      setError(null);

      const result = await postAuth(ENDPOINTS.dev.auth.resetPassword, { token, password });
      if (result.ok) {
        setPhase(FormPhase.Success);
        return;
      }
      setError(authErrorLabel(result.code, result.message));
      setPhase(FormPhase.Error);
    },
    [token, password, confirm],
  );

  if (phase === FormPhase.Success) {
    return (
      <AuthStatus tone={AuthStatusTone.Success} title="Password updated">
        Your password has been changed. You can now{" "}
        <a href="/login" className="content-link text-fg">
          sign in
        </a>
        .
      </AuthStatus>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        name="password"
        label="New password"
        type="password"
        value={password}
        onChange={onPassword}
        autoComplete="new-password"
        hint={`${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`}
      />
      <TextField
        name="confirm"
        label="Confirm password"
        type="password"
        value={confirm}
        onChange={onConfirm}
        autoComplete="new-password"
        error={error ?? undefined}
      />
      <SubmitButton loading={phase === FormPhase.Submitting}>Update password</SubmitButton>
    </form>
  );
}

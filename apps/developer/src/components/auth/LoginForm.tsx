import { ENDPOINTS } from "@musiccloud/shared";
import { type ChangeEvent, type SyntheticEvent, useCallback, useState } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { postAuth } from "@/lib/authClient";
import { AuthErrorCode, authErrorLabel } from "@/lib/authErrors";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";

/** Where to send the browser after a successful login. */
const DASHBOARD_PATH = "/dashboard";

/**
 * Login island for the developer portal: email + password posted to the BFF
 * `/api/dev/auth/login`. On `200` it hard-navigates to the dashboard (a full
 * load so the new session cookie is picked up by the protected page's SSR
 * guard). `401` shows "Invalid email or password"; `403` (unverified) shows a
 * verification prompt; everything else surfaces the backend message.
 *
 * Rendered with `client:load` from `login.astro`; the GitHub button and the
 * "or" divider live in the page, above this form (spec: GitHub first).
 *
 * @returns The email/password login form.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);
  const [error, setError] = useState<string | null>(null);

  const onEmail = useCallback((event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value), []);
  const onPassword = useCallback((event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value), []);

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPhase(FormPhase.Submitting);
      setError(null);

      const result = await postAuth(ENDPOINTS.dev.auth.login, { email, password });
      if (result.ok) {
        window.location.href = DASHBOARD_PATH;
        return;
      }

      if (result.code === AuthErrorCode.EmailNotVerified) {
        setError("Please verify your email address first. Check your inbox for the verification link.");
      } else {
        setError(authErrorLabel(result.code, result.message));
      }
      setPhase(FormPhase.Error);
    },
    [email, password],
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        name="email"
        label="Email"
        type="email"
        value={email}
        onChange={onEmail}
        autoComplete="email"
        placeholder="you@example.com"
      />
      <TextField
        name="password"
        label="Password"
        type="password"
        value={password}
        onChange={onPassword}
        autoComplete="current-password"
        error={error ?? undefined}
      />
      <div className="flex justify-end -mt-1">
        <a href="/forgot" className="content-link text-body text-fg-muted">
          Forgot password?
        </a>
      </div>
      <SubmitButton loading={phase === FormPhase.Submitting}>Sign in</SubmitButton>
    </form>
  );
}

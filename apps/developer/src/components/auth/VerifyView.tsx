import { ENDPOINTS } from "@musiccloud/shared";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { postAuth } from "@/lib/authClient";
import { AuthStatusTone } from "@/lib/authStatusTone";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";

/**
 * Props for {@link VerifyView}.
 */
export interface VerifyViewProps {
  /** The email-verification token read from `?token=` by the page. */
  token: string;
}

/**
 * Email-verification island. Unlike the other forms it has no input: it POSTs
 * the `token` to `/api/dev/auth/verify-email` once on mount and reports the
 * outcome. A `200` shows a success panel linking to sign-in; a `400`
 * (`INVALID_TOKEN`) or any other failure shows a recoverable error panel
 * pointing the developer back to signup.
 *
 * The mount fetch is guarded by an `AbortController`: if the component unmounts
 * (or the effect re-runs because the token changed) the in-flight request is
 * aborted and the resolved state is dropped, so no state update lands on an
 * unmounted view.
 *
 * @param props - See {@link VerifyViewProps}.
 * @returns The verifying / success / error panel.
 */
export function VerifyView({ token }: VerifyViewProps) {
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Submitting);

  useEffect(() => {
    const controller = new AbortController();

    postAuth(ENDPOINTS.dev.auth.verifyEmail, { token }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setPhase(result.ok ? FormPhase.Success : FormPhase.Error);
    });

    return () => controller.abort();
  }, [token]);

  if (phase === FormPhase.Success) {
    return (
      <AuthStatus tone={AuthStatusTone.Success} title="Email verified">
        Your account is active. You can now{" "}
        <a href="/login" className="text-fg text-link">
          sign in
        </a>
        .
      </AuthStatus>
    );
  }

  if (phase === FormPhase.Error) {
    return (
      <AuthStatus tone={AuthStatusTone.Error} title="Verification failed">
        This verification link is invalid or has expired. Try{" "}
        <a href="/signup" className="text-fg text-link">
          signing up
        </a>{" "}
        again to receive a new one.
      </AuthStatus>
    );
  }

  return (
    <div className="flex flex-col items-center text-center gap-3 py-2">
      <CircleNotchIcon weight="bold" className="size-7 text-accent animate-spin" aria-hidden="true" />
      <p className="text-body text-fg-muted">Verifying your email…</p>
    </div>
  );
}

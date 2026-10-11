import { ENDPOINTS } from "@musiccloud/shared";
import { useEffect, useState } from "react";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { postAuth } from "@/lib/authClient";
import { AuthStatusTone } from "@/lib/authStatusTone";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";
import { RefreshIcon } from "@/lib/icons";

/**
 * Props for {@link ConfirmEmailChangeView}.
 */
export interface ConfirmEmailChangeViewProps {
  /** The confirmation token read from `?token=` by the page. */
  token: string;
}

/**
 * Confirms a change of sign-in address.
 *
 * Like the verification view it has no input: the link is the proof, so it
 * posts the token once on mount and reports what happened. No session is
 * needed, which is what lets somebody confirm from the device their new
 * mailbox is on.
 *
 * @param props - See {@link ConfirmEmailChangeViewProps}.
 * @returns The confirming, confirmed or failed panel.
 */
export function ConfirmEmailChangeView({ token }: ConfirmEmailChangeViewProps) {
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Submitting);

  useEffect(() => {
    const controller = new AbortController();

    postAuth(ENDPOINTS.dev.auth.confirmEmailChange, { token }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setPhase(result.ok ? FormPhase.Success : FormPhase.Error);
    });

    return () => controller.abort();
  }, [token]);

  if (phase === FormPhase.Success) {
    return (
      <AuthStatus tone={AuthStatusTone.Success} title="Address changed">
        This is the address you sign in with from now on, and the only one that receives a password reset. You can{" "}
        <a href="/login" className="content-link text-fg">
          sign in
        </a>{" "}
        with it.
      </AuthStatus>
    );
  }

  if (phase === FormPhase.Error) {
    return (
      <AuthStatus tone={AuthStatusTone.Error} title="That link did not work">
        It may have expired, been used already, or been replaced by a newer request. Your old address still works, and
        you can ask for the change again from your profile.
      </AuthStatus>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <RefreshIcon className="size-7 animate-spin text-accent" aria-hidden="true" />
      <p className="text-body text-fg-muted">Confirming your new address…</p>
    </div>
  );
}

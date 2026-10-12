import { ENDPOINTS } from "@musiccloud/shared";
import { useEffect, useState } from "react";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { postAuth } from "@/lib/authClient";
import { AuthStatusTone } from "@/lib/authStatusTone";
import { RefreshIcon } from "@/lib/icons";
import { type InvitationRefusalCopy, invitationDestination, invitationRefusalCopy } from "@/lib/invitationOutcome";

/** Props for {@link InviteView}. */
export interface InviteViewProps {
  /** The invitation token read from `?token=` by the page. */
  token: string;
}

/**
 * Invitation island. It redeems the token once it has mounted, which is what
 * keeps a mail scanner that fetches the link from spending the invitation:
 * the scanner reads the page and runs no script.
 *
 * A link that works sends the person on, to the dashboard when they are
 * signed in, to sign-up with the pass the backend has just set, or to sign-in
 * when their address already had an account. A link that does not work says
 * why, and names the error id where the failure was not one of the reasons
 * the backend gives.
 *
 * The mount request is guarded by an `AbortController`, as in `VerifyView`.
 *
 * @param props - See {@link InviteViewProps}.
 * @returns The opening, or the reason the link does not work.
 */
export function InviteView({ token }: InviteViewProps) {
  const [refusal, setRefusal] = useState<(InvitationRefusalCopy & { errorId?: string }) | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    postAuth(ENDPOINTS.dev.auth.redeemInvitation, { token }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      const destination = invitationDestination(result);
      if (destination) {
        window.location.assign(destination);
        return;
      }
      setRefusal({ ...invitationRefusalCopy(result), errorId: result.errorId });
    });

    return () => controller.abort();
  }, [token]);

  if (refusal) {
    return (
      <AuthStatus tone={AuthStatusTone.Error} title={refusal.title}>
        {refusal.body}
        {refusal.offerSignIn && (
          <>
            {" "}
            <a href="/login" className="content-link text-fg">
              Sign in
            </a>
          </>
        )}
        {refusal.errorId && <span className="block mt-2 text-fg-muted">Error ID: {refusal.errorId}</span>}
      </AuthStatus>
    );
  }

  return (
    <div className="flex flex-col items-center text-center gap-3 py-2">
      <RefreshIcon className="size-7 text-accent animate-spin" aria-hidden="true" />
      <p className="text-body text-fg-muted">Opening your invitation…</p>
    </div>
  );
}

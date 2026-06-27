import { ENDPOINTS } from "@musiccloud/shared";
import { CircleNotchIcon, SignOutIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { postAuth } from "@/lib/authClient";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";

/** Where the browser lands after signing out. */
const HOME_PATH = "/";

/**
 * Logout island for the dashboard header. POSTs to the BFF
 * `/api/dev/auth/logout`, which proxies to the backend and relays the
 * session-clearing `Set-Cookie`, then hard-navigates home so the cleared
 * session takes effect and the protected page re-runs its SSR guard.
 *
 * Navigation happens whether the request succeeds or fails: logout is
 * best-effort and the user must never be stranded on the dashboard by a
 * transient error — the next protected render re-checks the session regardless.
 * While the request is in flight the button shows a spinner and is disabled to
 * prevent a double submit.
 *
 * Rendered compact (not the full-width auth `SubmitButton`) because it sits in
 * the header's account block; it reuses the secondary glassy token styling so it
 * stays visually consistent with the rest of the portal.
 *
 * @returns The compact sign-out button.
 */
export function LogoutButton() {
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);
  const loading = phase === FormPhase.Submitting;

  const onLogout = useCallback(async () => {
    setPhase(FormPhase.Submitting);
    await postAuth(ENDPOINTS.dev.auth.logout, {});
    window.location.href = HOME_PATH;
  }, []);

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={loading}
      className="inline-flex items-center justify-center gap-2 rounded-button border border-border-strong bg-surface px-3.5 py-2 text-body font-medium text-fg transition-colors hover:border-fg-subtle disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <CircleNotchIcon weight="bold" className="size-5 animate-spin" aria-hidden="true" />
      ) : (
        <SignOutIcon weight="duotone" className="size-5" aria-hidden="true" />
      )}
      Sign out
    </button>
  );
}

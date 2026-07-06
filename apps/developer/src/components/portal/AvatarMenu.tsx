import { ENDPOINTS } from "@musiccloud/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { postAuth } from "@/lib/authClient";
import { CategoryIcon, LogoutIcon, ProfileIcon, RefreshIcon } from "@/lib/icons";

/** Where the browser lands after signing out. */
const HOME_PATH = "/";

/** Shared classes for both menu entries (link + button) so they stay visually identical. */
const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2.5 px-3.5 py-2 text-body text-fg-muted transition-colors hover:bg-surface hover:text-fg";

interface AvatarMenuProps {
  /** The signed-in account shown in the trigger (avatar image or initial fallback). */
  account: {
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  /**
   * Whether the menu offers the "Dashboard" entry (with its divider). The
   * dashboard shell itself turns this off; being already there, its menu
   * holds only "Logout". Defaults to `true` for the public pages.
   */
  showDashboard?: boolean;
}

/**
 * Signed-in account menu for the portal (MC-102): a round avatar button
 * (the account's image, or its initial as fallback) at the far right of the
 * header that opens a right-aligned dropdown. Public pages show "Dashboard"
 * and, below a divider, "Logout"; inside the dashboard shell only "Logout"
 * (see {@link AvatarMenuProps.showDashboard}).
 *
 * Logout POSTs to the BFF `/api/dev/auth/logout` and then hard-navigates
 * home (best-effort: the user must never be stranded by a transient logout
 * error) so the cleared session cookie takes effect everywhere. The menu
 * closes on outside click and Escape;
 * the trigger carries the `aria-haspopup`/`aria-expanded` pair and the list
 * uses `menu`/`menuitem` roles.
 *
 * @param props - See {@link AvatarMenuProps}.
 * @returns The avatar trigger plus, while open, the dropdown menu.
 */
export function AvatarMenu({ account, showDashboard = true }: AvatarMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const onLogout = useCallback(async () => {
    setLoggingOut(true);
    await postAuth(ENDPOINTS.dev.auth.logout, {});
    window.location.href = HOME_PATH;
  }, []);

  const initial = (account.displayName?.trim() || account.email).charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {account.avatarUrl ? (
          <img
            src={account.avatarUrl}
            alt=""
            width="36"
            height="36"
            className="size-9 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="inline-flex items-center justify-center size-9 rounded-full border border-border bg-surface text-body font-medium text-fg">
            {initial || <ProfileIcon className="size-5 text-fg-muted" aria-hidden="true" />}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-44 overflow-hidden rounded-button border border-border bg-surface-solid py-1.5 shadow-lg"
        >
          {showDashboard && (
            <>
              <a role="menuitem" href="/dashboard" className={MENU_ITEM_CLASS}>
                <CategoryIcon className="size-5" aria-hidden="true" />
                Dashboard
              </a>
              <hr className="my-1.5 border-border" />
            </>
          )}
          <button type="button" role="menuitem" onClick={onLogout} disabled={loggingOut} className={MENU_ITEM_CLASS}>
            {loggingOut ? (
              <RefreshIcon className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <LogoutIcon className="size-5" aria-hidden="true" />
            )}
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

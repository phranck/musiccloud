const LEGACY_LOCALE_KEY = "mc:locale";

type StorageCleanupTarget = Pick<Storage, "removeItem">;
type CookieCleanupTarget = { cookie: string };

/** Removes the retired language preference left by older frontend releases. */
export function clearLegacyLocalePreference(
  storage: StorageCleanupTarget = window.localStorage,
  cookieTarget: CookieCleanupTarget = document,
): void {
  try {
    storage.removeItem(LEGACY_LOCALE_KEY);
  } catch {
    // Storage can be blocked in private or embedded browser contexts.
  }

  try {
    cookieTarget.cookie = `${LEGACY_LOCALE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // Cookie access can be blocked independently of local storage.
  }
}

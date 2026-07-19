interface LocaleStorage {
  removeItem(key: string): void;
}

const LEGACY_DASHBOARD_LOCALE_KEY = "dashboard-locale";

export function clearLegacyDashboardLocalePreference(storage?: LocaleStorage): void {
  try {
    (storage ?? window.localStorage).removeItem(LEGACY_DASHBOARD_LOCALE_KEY);
  } catch {
    // Browser storage can be unavailable in hardened or private contexts.
  }
}

/**
 * @file Leaving the dashboard for an address outside it.
 */

/**
 * Sends the browser to an address outside the dashboard, such as the bank's
 * page where the account holder identifies themselves.
 *
 * A module of its own, so a test can stand in for the one call that would
 * leave the page under test.
 *
 * @param url - The address to go to. The backend has checked it is `https`.
 */
export function leaveDashboardFor(url: string): void {
  window.location.assign(url);
}

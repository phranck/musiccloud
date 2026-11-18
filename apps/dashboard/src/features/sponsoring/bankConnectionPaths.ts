/**
 * @file Where the bank connection screens live in the dashboard, as the route
 * table writes them.
 *
 * The absolute addresses come from `@musiccloud/shared`, because the backend
 * builds the bank's return address from the callback's and Enable Banking
 * refuses any address but the registered one.
 */

import { BANK_CONNECTION_CALLBACK_DASHBOARD_PATH, BANK_CONNECTION_DASHBOARD_PATH } from "@musiccloud/shared";

/** The length of the leading slash a route table entry leaves out: 1. */
const LEADING_SLASH_LENGTH = 1;

/** The bank connection page's route, relative to the dashboard's root route. */
export const BANK_CONNECTION_ROUTE = BANK_CONNECTION_DASHBOARD_PATH.slice(LEADING_SLASH_LENGTH);

/** The page the bank returns the account holder to, relative to the dashboard's root route. */
export const BANK_CONNECTION_CALLBACK_ROUTE = BANK_CONNECTION_CALLBACK_DASHBOARD_PATH.slice(LEADING_SLASH_LENGTH);

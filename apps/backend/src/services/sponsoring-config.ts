/**
 * @file Stores the running costs, the payee and the transfer purposes.
 *
 * One `site_settings` row holds the whole setting as JSON. Only
 * `PUT /api/admin/sponsoring/config` writes it, because the payee account
 * decides where money goes and that route admits the owner alone. The generic
 * settings route refuses the key for the same reason.
 */

import { parseSponsoringConfig, type SponsoringConfig } from "@musiccloud/shared";
import { log } from "../lib/infra/logger.js";
import { getSetting, setSetting } from "./site-settings.js";

/**
 * The `site_settings` key holding the setting.
 *
 * Exported so the generic settings route can refuse it.
 */
export const SPONSORING_CONFIG_KEY = "sponsoring_config";

/**
 * Reads the setting.
 *
 * @returns The stored setting, or the defaults for anything nothing was saved
 *   for. Never throws on a stored value it cannot read.
 */
export async function getSponsoringConfig(): Promise<SponsoringConfig> {
  return parseSponsoringConfig(await getSetting(SPONSORING_CONFIG_KEY));
}

/**
 * The names of the fields whose value differs between two settings.
 *
 * @param previous - The setting before the write.
 * @param next - The setting after it.
 * @returns The field names, in declaration order.
 */
function changedFields(previous: SponsoringConfig, next: SponsoringConfig): string[] {
  return (Object.keys(next) as (keyof SponsoringConfig)[]).filter(
    (field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]),
  );
}

/**
 * Replaces the setting.
 *
 * The caller has validated `next` against the request schema and the IBAN
 * checksum. A change is logged at warn, which survives in production, with the
 * names of the changed fields and who changed them, never their values: the
 * question it answers later is when the payee account changed and by whom.
 *
 * @param next - The complete new setting.
 * @param actorId - The id of the dashboard user making the change.
 */
export async function setSponsoringConfig(next: SponsoringConfig, actorId: string): Promise<void> {
  const previous = await getSponsoringConfig();
  await setSetting(SPONSORING_CONFIG_KEY, JSON.stringify(next));
  log.warn(
    {
      component: "SponsoringConfig",
      operation: "sponsoring_config_change",
      actorId,
      changedFields: changedFields(previous, next),
    },
    "Sponsoring settings changed",
  );
}

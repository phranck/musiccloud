/**
 * @file Which Creem environment the shop sells from.
 *
 * This is the switch that decides whether a purchase moves real money. It is a
 * stored setting rather than a consequence of which API key happens to be
 * deployed, because the two questions are genuinely different: an operator
 * prepares the live products long before anybody should be able to buy them,
 * and the moment of going live is a decision somebody makes rather than a side
 * effect of a deployment.
 *
 * The editor's environment tabs are a different thing entirely. Those say what
 * an operator is looking at; this says what a customer pays.
 */

import { CreemMode, type CreemModeValue, configuredCreemModes } from "../lib/creem-config.js";
import { log } from "../lib/infra/logger.js";
import { getSetting, setSetting } from "./site-settings.js";

/** The `site_settings` key holding the selling environment. */
const SELLING_MODE_KEY = "creem_selling_mode";

/**
 * The environment the shop sells from until somebody says otherwise.
 *
 * Sandbox, always. A default that charged real money would be a default nobody
 * chose.
 */
const DEFAULT_SELLING_MODE: CreemModeValue = CreemMode.Test;

/** Why the selling environment cannot be moved to a given environment. */
export const SellingModeRefusal = {
  /** No API key is configured for that environment, so it cannot be reached. */
  NoKey: "creem_selling_mode_no_key",
  /** Some enabled paid plan has no product there, so its price would vanish. */
  MissingProducts: "creem_selling_mode_missing_products",
} as const;

/** A {@link SellingModeRefusal} member value. */
export type SellingModeRefusalValue = (typeof SellingModeRefusal)[keyof typeof SellingModeRefusal];

/**
 * Reads which Creem environment the shop sells from.
 *
 * An unreadable or absent setting resolves to the sandbox rather than throwing,
 * because the alternative is a pricing page that fails instead of one that is
 * merely not live yet.
 *
 * @returns The selling environment.
 */
export async function getSellingMode(): Promise<CreemModeValue> {
  const stored = await getSetting(SELLING_MODE_KEY);
  return stored === CreemMode.Live ? CreemMode.Live : DEFAULT_SELLING_MODE;
}

/**
 * Moves the shop to another Creem environment.
 *
 * Two things are checked first, and both are refusals rather than warnings. An
 * environment with no key cannot be reached at all, so the pricing page would
 * lose every price. An environment missing a product for an enabled paid plan
 * would show that plan at its database price whilst nobody could buy it, which
 * looks like it works.
 *
 * @param next - The environment to sell from.
 * @param productModes - Which environments each enabled paid plan already has a
 *   product in, keyed by an identifier the caller can show back to the operator.
 * @returns The refusal and what caused it, or `null` when the move was made.
 */
export async function setSellingMode(
  next: CreemModeValue,
  productModes: { label: string; modes: CreemModeValue[] }[],
): Promise<{ refusal: SellingModeRefusalValue; missing: string[] } | null> {
  if (!configuredCreemModes().includes(next)) {
    return { refusal: SellingModeRefusal.NoKey, missing: [] };
  }

  const missing = productModes.filter((entry) => !entry.modes.includes(next)).map((entry) => entry.label);
  if (missing.length > 0) {
    return { refusal: SellingModeRefusal.MissingProducts, missing };
  }

  const previous = await getSellingMode();
  await setSetting(SELLING_MODE_KEY, next);

  // Logged at warn rather than debug so it survives in production. This is the
  // one setting whose change decides whether a purchase charges a real card,
  // and the question it answers later is "when did this become live".
  log.warn(
    { component: "CreemSellingMode", operation: "creem_selling_mode_change", previous, next },
    "Creem selling environment changed",
  );

  return null;
}

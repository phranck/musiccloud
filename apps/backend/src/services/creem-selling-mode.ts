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

import { CREEM_MODES, CreemMode, type CreemModeValue, type SellingModeReadiness } from "@musiccloud/shared";
import { getTierRepository } from "../db/index.js";
import { configuredCreemModes } from "../lib/creem-config.js";
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
 * Every enabled paid plan and interval that needs a Creem product, with the
 * environments it already has one in.
 *
 * A disabled plan is left out because nobody can buy it, and a free one
 * because it has no product by design. What remains is exactly the set that
 * decides whether an environment is ready to sell from.
 *
 * @returns One entry per plan and interval that must be sellable, labelled so
 *   an operator recognises it.
 */
export async function sellablePlanProducts(): Promise<{ label: string; modes: CreemModeValue[] }[]> {
  const repo = await getTierRepository();
  const [tiers, offers, mappings] = await Promise.all([
    repo.listTiers(),
    repo.listAllOffers(),
    repo.listAllCreemProductMappings(),
  ]);

  const needed: { label: string; modes: CreemModeValue[] }[] = [];
  for (const tier of tiers) {
    if (!tier.enabled) continue;
    for (const offer of offers.filter((candidate) => candidate.tierId === tier.id)) {
      needed.push({
        label: `${tier.name} (${offer.billingPeriod})`,
        modes: mappings
          .filter((mapping) => mapping.tierId === tier.id && mapping.billingPeriod === offer.billingPeriod)
          .map((mapping) => mapping.mode),
      });
    }
  }
  return needed;
}

/**
 * Which environments could be sold from right now, and what is missing in the
 * ones that could not.
 *
 * The dashboard decides from this whether to offer the switch, and
 * {@link setSellingMode} decides from it whether to make the move, so the two
 * cannot disagree.
 *
 * @returns One entry per environment, test first.
 */
export async function sellingModeReadiness(): Promise<SellingModeReadiness[]> {
  const configured = configuredCreemModes();
  const needed = await sellablePlanProducts();
  return CREEM_MODES.map((mode) => ({
    mode,
    hasKey: configured.includes(mode),
    missingProducts: needed.filter((entry) => !entry.modes.includes(mode)).map((entry) => entry.label),
  }));
}

/**
 * Moves the shop to another Creem environment.
 *
 * Two things are checked first, and both are refusals rather than warnings. An
 * environment with no key cannot be reached at all, so the pricing page would
 * lose every price. An environment missing a product for an enabled paid plan
 * would show that plan at its offer's amount whilst nobody could buy it, which
 * looks like it works. Both come from {@link sellingModeReadiness}, which is
 * also what the dashboard shows, so the switch it offers is the switch this
 * accepts.
 *
 * @param next - The environment to sell from.
 * @returns The refusal and what caused it, or `null` when the move was made.
 */
export async function setSellingMode(
  next: CreemModeValue,
): Promise<{ refusal: SellingModeRefusalValue; missing: string[] } | null> {
  const readiness = (await sellingModeReadiness()).find((entry) => entry.mode === next);
  if (!readiness?.hasKey) {
    return { refusal: SellingModeRefusal.NoKey, missing: [] };
  }
  if (readiness.missingProducts.length > 0) {
    return { refusal: SellingModeRefusal.MissingProducts, missing: readiness.missingProducts };
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

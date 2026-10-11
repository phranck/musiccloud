import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type { CreemModeValue } from "../../lib/creem-config.js";
import { log } from "../../lib/infra/logger.js";
import {
  type BillingPeriodValue,
  DEFAULT_TIER_COLOR,
  type OfferCurrencyValue,
  type OfferCustomField,
  type Tier,
  type TierCreateData,
  type TierCreemProductKey,
  type TierCreemProductMapping,
  type TierOffer,
  type TierOfferCreateData,
  type TierOfferUpdateData,
  type TierRepository,
  type TierUpdateData,
} from "../tiers-repository.js";
import { dateToMs } from "./postgres-shared.js";

interface TierRow {
  id: string;
  name: string;
  requests_per_minute: number;
  requests_per_day: number;
  attribution_required: boolean;
  price: string | null;
  price_yearly: string | null;
  color: string;
  icon: string | null;
  button_label: string | null;
  description: string;
  enabled: boolean;
  disable_reason: string;
  recommended: boolean;
  sort_order: number;
  features: string[];
  created_at: Date;
  updated_at: Date;
}

function toTier(row: TierRow): Tier {
  return {
    id: row.id,
    name: row.name,
    requestsPerMinute: row.requests_per_minute,
    requestsPerDay: row.requests_per_day,
    attributionRequired: row.attribution_required,
    price: row.price,
    priceYearly: row.price_yearly,
    color: row.color,
    icon: row.icon,
    buttonLabel: row.button_label,
    description: row.description,
    enabled: row.enabled,
    disableReason: row.disable_reason,
    recommended: row.recommended,
    sortOrder: row.sort_order,
    features: row.features ?? [],
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
  };
}

/** One `tier_creem_products` row as PostgreSQL returns it. */
interface TierCreemProductMappingRow {
  tier_id: string;
  interval: string;
  mode: string;
  creem_product_id: string;
}

/** One `tier_offers` row as PostgreSQL returns it. */
interface TierOfferRow {
  id: string;
  tier_id: string;
  billing_period: string;
  price_cents: number;
  currency: string;
  tax_mode: string | null;
  tax_category: string | null;
  image_url: string | null;
  success_url: string | null;
  custom_fields: OfferCustomField[] | null;
  abandoned_cart_recovery: boolean;
  pay_what_you_want: boolean;
  suggested_price_cents: number | null;
  sort_order: number;
}

/** Every column of `tier_offers`, in the order the mapper reads them. */
const OFFER_COLUMNS =
  "id, tier_id, billing_period, price_cents, currency, tax_mode, tax_category, image_url, success_url, custom_fields, abandoned_cart_recovery, pay_what_you_want, suggested_price_cents, sort_order";

/**
 * Converts a `tier_offers` row into the repository's offer shape.
 *
 * Every constrained column is cast to its namespace type, which is what the
 * check constraints on the table already guarantee.
 */
function toOffer(row: TierOfferRow): TierOffer {
  return {
    id: row.id,
    tierId: row.tier_id,
    billingPeriod: row.billing_period as BillingPeriodValue,
    priceCents: row.price_cents,
    currency: row.currency as OfferCurrencyValue,
    taxMode: row.tax_mode as TierOffer["taxMode"],
    taxCategory: row.tax_category as TierOffer["taxCategory"],
    imageUrl: row.image_url,
    successUrl: row.success_url,
    customFields: row.custom_fields ?? [],
    abandonedCartRecovery: row.abandoned_cart_recovery,
    payWhatYouWant: row.pay_what_you_want,
    suggestedPriceCents: row.suggested_price_cents,
    sortOrder: row.sort_order,
  };
}

/**
 * Converts a `tier_creem_products` row into the repository's mapping shape.
 *
 * The `mode` column is constrained to the two Creem environments by the
 * `chk_tier_creem_products_mode` check constraint, so the cast reflects what
 * the database already guarantees.
 */
function toCreemProductMapping(row: TierCreemProductMappingRow): TierCreemProductMapping {
  return {
    tierId: row.tier_id,
    billingPeriod: row.interval as BillingPeriodValue,
    mode: row.mode as CreemModeValue,
    creemProductId: row.creem_product_id,
  };
}

export class PostgresTierRepository implements TierRepository {
  #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async listTiers(): Promise<Tier[]> {
    const { rows } = await this.#pool.query<TierRow>("SELECT * FROM tiers ORDER BY sort_order ASC");
    return rows.map(toTier);
  }

  async createTier(data: TierCreateData): Promise<Tier> {
    const id = nanoid();
    const recommended = data.recommended ?? false;
    const sql = `INSERT INTO tiers (id, name, requests_per_minute, requests_per_day, attribution_required, price, price_yearly, color, icon, button_label, description, enabled, disable_reason, recommended, sort_order, features)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
       RETURNING *`;
    const values = [
      id,
      data.name,
      data.requestsPerMinute,
      data.requestsPerDay,
      data.attributionRequired ?? false,
      data.price ?? null,
      data.priceYearly ?? null,
      data.color ?? DEFAULT_TIER_COLOR,
      data.icon ?? null,
      data.buttonLabel ?? null,
      data.description ?? "",
      data.enabled ?? true,
      data.disableReason ?? "",
      recommended,
      data.sortOrder ?? 0,
      JSON.stringify(data.features ?? []),
    ];

    if (recommended) {
      return this.#writeAndClearOtherRecommendations(id, sql, values);
    }

    const { rows } = await this.#pool.query<TierRow>(sql, values);
    return toTier(rows[0]!);
  }

  /**
   * Runs a write that sets `recommended = true` on tier `id` (an INSERT or
   * UPDATE that returns the affected row) and, in the same transaction, clears
   * the flag on every other tier. This enforces the "at most one recommended"
   * invariant atomically, so concurrent writers can never leave two tiers
   * recommended.
   *
   * @param id - The tier being made recommended.
   * @param sql - The INSERT/UPDATE statement (must `RETURNING *`).
   * @param values - Parameters for `sql`.
   * @returns The written tier.
   */
  async #writeAndClearOtherRecommendations(id: string, sql: string, values: unknown[]): Promise<Tier> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<TierRow>(sql, values);
      if (rows.length === 0) {
        throw new Error(`Tier not found: ${id}`);
      }
      await client.query(
        "UPDATE tiers SET recommended = false, updated_at = now() WHERE recommended = true AND id <> $1",
        [id],
      );
      await client.query("COMMIT");
      return toTier(rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK").catch((rollbackError) =>
        log.deviation(
          {
            component: "TierRepository",
            errorCode: "MC-DB-0004",
            operation: "tier_transaction_rollback",
            outcome: "primary_error_rethrown_after_rollback_failure",
          },
          rollbackError,
        ),
      );
      throw error;
    } finally {
      client.release();
    }
  }

  async updateTier(id: string, data: TierUpdateData): Promise<Tier> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.requestsPerMinute !== undefined) {
      fields.push(`requests_per_minute = $${idx++}`);
      values.push(data.requestsPerMinute);
    }
    if (data.requestsPerDay !== undefined) {
      fields.push(`requests_per_day = $${idx++}`);
      values.push(data.requestsPerDay);
    }
    if (data.attributionRequired !== undefined) {
      fields.push(`attribution_required = $${idx++}`);
      values.push(data.attributionRequired);
    }
    if (data.price !== undefined) {
      fields.push(`price = $${idx++}`);
      values.push(data.price);
    }
    if (data.priceYearly !== undefined) {
      fields.push(`price_yearly = $${idx++}`);
      values.push(data.priceYearly);
    }
    if (data.color !== undefined) {
      fields.push(`color = $${idx++}`);
      values.push(data.color);
    }
    if (data.icon !== undefined) {
      fields.push(`icon = $${idx++}`);
      values.push(data.icon);
    }
    if (data.buttonLabel !== undefined) {
      fields.push(`button_label = $${idx++}`);
      values.push(data.buttonLabel);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(data.description);
    }
    if (data.enabled !== undefined) {
      fields.push(`enabled = $${idx++}`);
      values.push(data.enabled);
    }
    if (data.disableReason !== undefined) {
      fields.push(`disable_reason = $${idx++}`);
      values.push(data.disableReason);
    }
    if (data.sortOrder !== undefined) {
      fields.push(`sort_order = $${idx++}`);
      values.push(data.sortOrder);
    }
    if (data.recommended !== undefined) {
      fields.push(`recommended = $${idx++}`);
      values.push(data.recommended);
    }
    if (data.features !== undefined) {
      fields.push(`features = $${idx++}::jsonb`);
      values.push(JSON.stringify(data.features));
    }

    fields.push(`updated_at = now()`);

    if (fields.length === 0) {
      const { rows } = await this.#pool.query<TierRow>("SELECT * FROM tiers WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error(`Tier not found: ${id}`);
      return toTier(rows[0]!);
    }

    values.push(id);
    const sql = `UPDATE tiers SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;

    if (data.recommended === true) {
      return this.#writeAndClearOtherRecommendations(id, sql, values);
    }

    const { rows } = await this.#pool.query<TierRow>(sql, values);
    if (rows.length === 0) throw new Error(`Tier not found: ${id}`);
    return toTier(rows[0]!);
  }

  async deleteTier(id: string): Promise<void> {
    const { rowCount } = await this.#pool.query("DELETE FROM tiers WHERE id = $1", [id]);
    if (rowCount === 0) throw new Error(`Tier not found: ${id}`);
  }

  /**
   * Returns the `tier_creem_products` rows belonging to one Creem environment,
   * mapping each internal tier plus billing interval to that environment's
   * Creem product ID.
   *
   * The mapping lives here (not at Creem) because Creem products carry no
   * metadata field. Creem is the source of truth for prices and currency; this
   * table is the source of truth for which product ID belongs to which tier,
   * interval and environment.
   *
   * @param mode - The Creem environment whose rows are wanted.
   * @returns Array of the mapping rows for that environment.
   */
  async listCreemProductMappings(mode: CreemModeValue): Promise<TierCreemProductMapping[]> {
    const { rows } = await this.#pool.query<TierCreemProductMappingRow>(
      "SELECT tier_id, interval, mode, creem_product_id FROM tier_creem_products WHERE mode = $1",
      [mode],
    );
    return rows.map(toCreemProductMapping);
  }

  /**
   * Returns every `tier_creem_products` row, across both Creem environments,
   * for the admin surface that shows which environment already has a product.
   *
   * @returns Array of all tier-to-Creem-product mapping rows.
   */
  async listAllCreemProductMappings(): Promise<TierCreemProductMapping[]> {
    const { rows } = await this.#pool.query<TierCreemProductMappingRow>(
      "SELECT tier_id, interval, mode, creem_product_id FROM tier_creem_products ORDER BY tier_id, interval, mode",
    );
    return rows.map(toCreemProductMapping);
  }

  /**
   * Returns the mapping for one tier, interval and Creem environment.
   *
   * @param key - Which mapping is wanted.
   * @returns The mapping, or `null` when that combination has no product.
   */
  async findCreemProductMapping(key: TierCreemProductKey): Promise<TierCreemProductMapping | null> {
    const { rows } = await this.#pool.query<TierCreemProductMappingRow>(
      "SELECT tier_id, interval, mode, creem_product_id FROM tier_creem_products WHERE tier_id = $1 AND interval = $2 AND mode = $3",
      [key.tierId, key.billingPeriod, key.mode],
    );
    const row = rows[0];
    return row ? toCreemProductMapping(row) : null;
  }

  /**
   * Records a Creem product against a tier, interval and environment.
   *
   * The insert carries no conflict clause on purpose. A duplicate is a real
   * problem rather than something to absorb: it means a product exists at
   * Creem that this row would stop pointing at.
   *
   * @param mapping - The tier, interval, environment and product id.
   */
  async createCreemProductMapping(mapping: TierCreemProductMapping): Promise<void> {
    await this.#pool.query(
      "INSERT INTO tier_creem_products (id, tier_id, interval, mode, creem_product_id) VALUES ($1, $2, $3, $4, $5)",
      [nanoid(), mapping.tierId, mapping.billingPeriod, mapping.mode, mapping.creemProductId],
    );
  }

  /**
   * Removes the mapping for one tier, interval and Creem environment.
   *
   * @param key - Which mapping to remove.
   * @returns `true` when a row was removed, `false` when there was none.
   */
  async deleteCreemProductMapping(key: TierCreemProductKey): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      "DELETE FROM tier_creem_products WHERE tier_id = $1 AND interval = $2 AND mode = $3",
      [key.tierId, key.billingPeriod, key.mode],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Returns every offer of one plan, in the order it is shown.
   *
   * @param tierId - The plan.
   * @returns Its offers.
   */
  async listOffers(tierId: string): Promise<TierOffer[]> {
    const { rows } = await this.#pool.query<TierOfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM tier_offers WHERE tier_id = $1 ORDER BY sort_order, billing_period`,
      [tierId],
    );
    return rows.map(toOffer);
  }

  /**
   * Returns every offer of every plan.
   *
   * The pricing page needs the offers of a whole list at once, and one query
   * for all of them beats one per plan.
   *
   * @returns Every offer, grouped by plan through the sort order.
   */
  async listAllOffers(): Promise<TierOffer[]> {
    const { rows } = await this.#pool.query<TierOfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM tier_offers ORDER BY tier_id, sort_order, billing_period`,
    );
    return rows.map(toOffer);
  }

  /**
   * Adds an offer to a plan.
   *
   * @param data - What is being sold and on what terms.
   * @returns The stored offer, read back rather than assumed.
   */
  async createOffer(data: TierOfferCreateData): Promise<TierOffer> {
    const { rows } = await this.#pool.query<TierOfferRow>(
      `INSERT INTO tier_offers
         (id, tier_id, billing_period, price_cents, currency, tax_mode, tax_category, image_url, success_url,
          custom_fields, abandoned_cart_recovery, pay_what_you_want, suggested_price_cents, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${OFFER_COLUMNS}`,
      [
        nanoid(),
        data.tierId,
        data.billingPeriod,
        data.priceCents,
        data.currency,
        data.taxMode,
        data.taxCategory,
        data.imageUrl,
        data.successUrl,
        JSON.stringify(data.customFields),
        data.abandonedCartRecovery,
        data.payWhatYouWant,
        data.suggestedPriceCents,
        data.sortOrder,
      ],
    );
    return toOffer(rows[0]!);
  }

  /**
   * Changes an offer, leaving out fields the caller did not name.
   *
   * The set of writable columns is stated here rather than taken from the
   * body, so a request cannot reach a column nobody meant to expose.
   *
   * @param id - The offer to change.
   * @param data - The fields to change.
   * @returns The offer as it stands afterwards.
   */
  async updateOffer(id: string, data: TierOfferUpdateData): Promise<TierOffer> {
    const writable: [keyof TierOfferUpdateData, string][] = [
      ["billingPeriod", "billing_period"],
      ["priceCents", "price_cents"],
      ["currency", "currency"],
      ["taxMode", "tax_mode"],
      ["taxCategory", "tax_category"],
      ["imageUrl", "image_url"],
      ["successUrl", "success_url"],
      ["customFields", "custom_fields"],
      ["abandonedCartRecovery", "abandoned_cart_recovery"],
      ["payWhatYouWant", "pay_what_you_want"],
      ["suggestedPriceCents", "suggested_price_cents"],
      ["sortOrder", "sort_order"],
    ];

    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of writable) {
      const value = data[key];
      if (value === undefined) continue;
      fields.push(`${column} = $${values.length + 1}`);
      values.push(key === "customFields" ? JSON.stringify(value) : value);
    }

    if (fields.length === 0) {
      const { rows } = await this.#pool.query<TierOfferRow>(`SELECT ${OFFER_COLUMNS} FROM tier_offers WHERE id = $1`, [
        id,
      ]);
      if (rows.length === 0) throw new Error(`Offer not found: ${id}`);
      return toOffer(rows[0]!);
    }

    values.push(id);
    const { rows } = await this.#pool.query<TierOfferRow>(
      `UPDATE tier_offers SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING ${OFFER_COLUMNS}`,
      values,
    );
    if (rows.length === 0) throw new Error(`Offer not found: ${id}`);
    return toOffer(rows[0]!);
  }

  /**
   * Removes an offer.
   *
   * Any Creem product mapped to it goes with it through the database. The
   * products themselves are archived at Creem by the caller beforehand, since
   * a removed row cannot say what still has to be archived.
   *
   * @param id - The offer to remove.
   */
  async deleteOffer(id: string): Promise<void> {
    const { rowCount } = await this.#pool.query("DELETE FROM tier_offers WHERE id = $1", [id]);
    if (rowCount === 0) throw new Error(`Offer not found: ${id}`);
  }
}

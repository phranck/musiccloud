import { nanoid } from "nanoid";
import type { Pool } from "pg";
import {
  DEFAULT_TIER_COLOR,
  type Tier,
  type TierCreateData,
  type TierCreemProductMapping,
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
    createdAt: dateToMs(row.created_at),
    updatedAt: dateToMs(row.updated_at),
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
    const sql = `INSERT INTO tiers (id, name, requests_per_minute, requests_per_day, attribution_required, price, price_yearly, color, icon, button_label, description, enabled, disable_reason, recommended, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      await client.query("ROLLBACK").catch(() => {});
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
   * Returns all rows from the `tier_creem_products` table, which maps each
   * internal tier plus billing interval to the corresponding Creem product ID.
   *
   * The mapping lives here (not at Creem) because Creem products carry no
   * metadata field. Creem is the source of truth for prices and currency; this
   * table is the source of truth for which product ID belongs to which tier and
   * interval.
   *
   * @returns Array of all tier-to-Creem-product mapping rows.
   */
  async listCreemProductMappings(): Promise<TierCreemProductMapping[]> {
    const { rows } = await this.#pool.query<{ tier_id: string; interval: string; creem_product_id: string }>(
      "SELECT tier_id, interval, creem_product_id FROM tier_creem_products",
    );
    return rows.map((r) => ({ tierId: r.tier_id, interval: r.interval, creemProductId: r.creem_product_id }));
  }
}

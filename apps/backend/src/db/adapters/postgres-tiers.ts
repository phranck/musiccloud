import { nanoid } from "nanoid";
import type { Pool } from "pg";
import {
  DEFAULT_TIER_COLOR,
  type Tier,
  type TierCreateData,
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
    const { rows } = await this.#pool.query<TierRow>(
      `INSERT INTO tiers (id, name, requests_per_minute, requests_per_day, attribution_required, price, price_yearly, color, icon, button_label, description, enabled, disable_reason, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
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
        data.sortOrder ?? 0,
      ],
    );
    return toTier(rows[0]!);
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

    fields.push(`updated_at = now()`);

    if (fields.length === 0) {
      const { rows } = await this.#pool.query<TierRow>("SELECT * FROM tiers WHERE id = $1", [id]);
      if (rows.length === 0) throw new Error(`Tier not found: ${id}`);
      return toTier(rows[0]!);
    }

    values.push(id);
    const { rows } = await this.#pool.query<TierRow>(
      `UPDATE tiers SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (rows.length === 0) throw new Error(`Tier not found: ${id}`);
    return toTier(rows[0]!);
  }

  async deleteTier(id: string): Promise<void> {
    const { rowCount } = await this.#pool.query("DELETE FROM tiers WHERE id = $1", [id]);
    if (rowCount === 0) throw new Error(`Tier not found: ${id}`);
  }
}

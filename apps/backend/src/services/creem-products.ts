/**
 * @file The three write operations on a Creem product, in one place.
 *
 * `creem@1.5.3` covers 42 of the REST API's 55 operations. `products.create`
 * is in the SDK; `PATCH /v1/products/{id}` and `DELETE /v1/products/{id}` exist
 * in the API and not in the package, so they are called directly against the
 * same base URL with the same key. Keeping all three here means a later SDK
 * upgrade has one file to revisit rather than a search across the codebase.
 *
 * Deleting a product is not possible at Creem. The `DELETE` is a soft delete
 * that moves the product to `archived`, keeps its id forever and goes on
 * answering `products.get` with its price. That is why archiving and removing
 * our mapping row are two halves of one operation and never done separately.
 */

import { getCreemConfig } from "../lib/creem-config.js";
import { log } from "../lib/infra/logger.js";
import { getCreemBaseUrl, getCreemClient } from "./creem-client.js";

/** How long a direct call to Creem may take before it is abandoned. */
const CREEM_REQUEST_TIMEOUT_MS = 15_000;

/**
 * A Creem product as far as anything on our side needs to know it.
 *
 * Creem returns more, but the rest belongs to Creem: we hold the id so we can
 * address the product, and the price and currency so an operator can see what
 * the checkout will charge without opening the Creem dashboard.
 */
export interface CreemProduct {
  /** The Creem product id. Stable for the product's whole life, archived or not. */
  id: string;
  /** Price in the smallest currency unit, as Creem holds it. */
  price: number;
  /** ISO 4217 currency code, uppercase. */
  currency: string;
  /** `active` or `archived`. An archived product is still readable and not buyable. */
  status: string;
}

/** What a new Creem product needs to come into being. */
export interface CreemProductDraft {
  /** Shown on the checkout page and on the receipt. */
  name: string;
  /** Shown under the name on the checkout page. */
  description: string;
  /** Price in cents. Creem refuses a recurring product below one whole unit. */
  priceCents: number;
  /** ISO 4217 currency code, uppercase. */
  currency: string;
  /** Creem's own spelling of the billing period, such as `every-month`. */
  billingPeriod: string;
}

/**
 * Raised when a Creem product operation did not succeed.
 *
 * It carries the MC code the route answers with, so the mapping from a failed
 * Creem call to what the operator is told lives at the throw rather than being
 * re-derived by every caller.
 */
export class CreemProductError extends Error {
  /** The stable MC code for this failure. */
  readonly code: string;

  /**
   * @param code - The MC code the route should answer with.
   * @param message - What went wrong, for the log rather than for the user.
   * @param options - Standard error options, used to carry the cause.
   */
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CreemProductError";
    this.code = code;
  }
}

/**
 * Calls a Creem endpoint the SDK does not cover, with the same base URL and
 * key the SDK would have used.
 *
 * Redirects are not followed. The destination is fixed by `getCreemBaseUrl`
 * and the path is built here, so a redirect could only move the request
 * somewhere nobody chose, and the key travels on the request.
 *
 * @param method - The HTTP method.
 * @param path - The path below the base URL, starting with a slash.
 * @param body - The JSON body, or `undefined` for a request without one.
 * @returns The parsed response body, or `null` when the response carries none.
 * @throws When the request fails or Creem answers with a non-2xx status. The
 *   message carries the status and Creem's own text, which is safe to log and
 *   never contains the key.
 */
async function callCreemDirectly(method: string, path: string, body?: unknown): Promise<unknown> {
  const { apiKey } = getCreemConfig();
  const response = await fetch(`${getCreemBaseUrl()}${path}`, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(CREEM_REQUEST_TIMEOUT_MS),
    headers: {
      "x-api-key": apiKey,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Creem answered ${response.status} for ${method} ${path}: ${detail.slice(0, 500)}`);
  }

  const text = await response.text();
  return text.length === 0 ? null : JSON.parse(text);
}

/**
 * Creates a product at Creem and returns it.
 *
 * The caller owns the decision of what the product is called and what it
 * costs; this function owns getting it to Creem and reporting what came back.
 * It writes nothing to our database, because the mapping row and the product
 * are stored by the route that knows which tier and interval they belong to.
 *
 * @param draft - What the product should be.
 * @returns The created product, with the id Creem assigned.
 * @throws {CreemProductError} With `MC-BILL-0001` when Creem refuses or cannot
 *   be reached.
 */
export async function createCreemProduct(draft: CreemProductDraft): Promise<CreemProduct> {
  try {
    const product = await getCreemClient().products.create({
      name: draft.name,
      description: draft.description,
      price: draft.priceCents,
      currency: draft.currency as never,
      billingType: "recurring",
      billingPeriod: draft.billingPeriod as never,
    });
    return { id: product.id, price: product.price, currency: product.currency, status: product.status };
  } catch (error) {
    log.deviation(
      {
        component: "CreemProducts",
        errorCode: "MC-BILL-0001",
        operation: "creem_product_create",
        outcome: "creem_product_not_created",
        mode: getCreemConfig().mode,
      },
      error,
    );
    throw new CreemProductError("MC-BILL-0001", "Creem refused to create the product", { cause: error });
  }
}

/**
 * Changes a product's price at Creem, keeping its id.
 *
 * A reprice is a change to one field rather than a replacement, so the mapping
 * row stays valid and every existing subscription keeps pointing at the same
 * product. That is why this exists at all instead of archive-and-recreate.
 *
 * @param productId - The Creem product to change.
 * @param priceCents - The new price in cents.
 * @returns The product as Creem holds it afterwards.
 * @throws {CreemProductError} With `MC-BILL-0002` when Creem refuses or cannot
 *   be reached.
 */
export async function updateCreemProductPrice(productId: string, priceCents: number): Promise<CreemProduct> {
  try {
    const updated = (await callCreemDirectly("PATCH", `/v1/products/${encodeURIComponent(productId)}`, {
      price: priceCents,
    })) as { id: string; price: number; currency: string; status: string };
    return { id: updated.id, price: updated.price, currency: updated.currency, status: updated.status };
  } catch (error) {
    log.deviation(
      {
        component: "CreemProducts",
        errorCode: "MC-BILL-0002",
        operation: "creem_product_update",
        outcome: "creem_product_not_updated",
        mode: getCreemConfig().mode,
        creemProductId: productId,
      },
      error,
    );
    throw new CreemProductError("MC-BILL-0002", "Creem refused to update the product", { cause: error });
  }
}

/**
 * Archives a product at Creem.
 *
 * Creem has no delete. The product keeps its id, stays readable and stops
 * being buyable. Whoever calls this removes the mapping row immediately
 * afterwards, because a mapping pointing at an archived product shows an
 * unbuyable price on the pricing page, which is worse than an error because it
 * looks like it works.
 *
 * @param productId - The Creem product to archive.
 * @throws {CreemProductError} With `MC-BILL-0003` when Creem refuses or cannot
 *   be reached, in which case the mapping row must be left alone.
 */
export async function archiveCreemProduct(productId: string): Promise<void> {
  try {
    await callCreemDirectly("DELETE", `/v1/products/${encodeURIComponent(productId)}`);
  } catch (error) {
    log.deviation(
      {
        component: "CreemProducts",
        errorCode: "MC-BILL-0003",
        operation: "creem_product_archive",
        outcome: "creem_product_not_archived",
        mode: getCreemConfig().mode,
        creemProductId: productId,
      },
      error,
    );
    throw new CreemProductError("MC-BILL-0003", "Creem refused to archive the product", { cause: error });
  }
}

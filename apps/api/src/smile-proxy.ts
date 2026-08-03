import { SmileCustomerInfoSchema, SmilePointsProductSchema } from "@repo/shared";
import {
  SmilePointsProductResponseSchema,
  SmilePointsProductsSchema,
  SmilePointsPurchaseResponseSchema,
  SmilePointsTransactionsSchema
} from "./schemas.js";

class SmileApp{
  static api_base = process.env.SMILE_API_BASE_URL

  constructor() { }

  async getCustomer(clientId: string) {
    const url = `${SmileApp.api_base}/customers/${clientId}`;

    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.SMILE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // TODO: Fix this typing up later
    const data = await resp.json() as any;
    return SmileCustomerInfoSchema.parse(data.customer)
  }

  async getRewards() {
    const url = `${SmileApp.api_base}/points_products`;

    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.SMILE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // TODO: Fix this typing up later
    const data = await resp.json() as any;
    return SmilePointsProductsSchema.parse(data).points_products
  }

  /**
   * Reads a single points product. Used to re-read price and variable range at
   * redemption time rather than trusting what the client says they cost.
   */
  async getPointsProduct(productId: string) {
    const url = `${SmileApp.api_base}/points_products/${productId}`;

    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.SMILE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(
        `Smile points product read failed with status ${resp.status}: ${detail || '(empty body)'}`
      );
    }

    const data = await resp.json();
    return SmilePointsProductResponseSchema.parse(data).points_product;
  }

  /**
   * Spends points on a reward and returns the issued fulfilment, which carries
   * the coupon code — no follow-up call is needed to retrieve it.
   *
   * `pointsToSpend` must be supplied for `variable` products and omitted
   * entirely for `fixed` ones. Passing `undefined` here leaves the key out of
   * the JSON altogether, which is deliberate: sending `points_to_spend: null`
   * or `0` on a fixed product is not the same thing as not sending it.
   */
  async purchasePointsProduct(
    clientId: string,
    productId: number,
    pointsToSpend?: number
  ) {
    const url = `${SmileApp.api_base}/points_products/${productId}/purchase`;

    // Smile is INCONSISTENT about request body wrapping, so do not generalise
    // from one endpoint to another. Both of these are confirmed against the
    // live API:
    //
    //   POST /points_transactions          wrapped   { points_transaction: {...} }
    //   POST /points_products/{id}/purchase  NOT wrapped, fields at top level
    //
    // Wrapping this one produced `400 Parameter points_to_spend is required`,
    // because Smile reads nothing inside the wrapper.
    const body = {
      customer_id: Number(clientId),
      ...(pointsToSpend === undefined ? {} : { points_to_spend: pointsToSpend })
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMILE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(
        `Smile points product purchase failed with status ${resp.status}: ${detail || '(empty body)'}`
      );
    }

    const data = await resp.json();
    return SmilePointsPurchaseResponseSchema.parse(data).points_purchase;
  }

  /**
   * Reads a customer's points history, newest first (Smile sorts descending by
   * id by default).
   *
   * Returns the raw Smile records minus `internal_note`, which the schema
   * strips — see `SmilePointsTransactionSchema`. Callers must still map to the
   * client-facing shape before responding; nothing here is safe to spread
   * straight into a response body.
   */
  async listPointsTransactions(clientId: string, limit: number) {
    // Smile accepts 1–250 and defaults to 50; clamp rather than let it 4xx.
    const safeLimit = Math.min(250, Math.max(1, Math.trunc(limit)));

    const params = new URLSearchParams({
      customer_id: clientId,
      limit: String(safeLimit)
    });
    const url = `${SmileApp.api_base}/points_transactions?${params.toString()}`;

    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.SMILE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) {
      // Log Smile's explanation server-side only; the client sees the generic
      // error from the global handler.
      const detail = await resp.text().catch(() => '');
      throw new Error(
        `Smile points transaction list failed with status ${resp.status}: ${detail || '(empty body)'}`
      );
    }

    // TODO: Fix this typing up later
    const data = await resp.json() as any;
    return SmilePointsTransactionsSchema.parse(data).points_transactions;
  }

  /**
   * Adds or removes points. Smile rejects anything that would take the balance
   * negative, so this is safe to call without a pre-check.
   *
   * The response body is intentionally not parsed: its wrapper shape isn't
   * something we depend on, and the caller re-reads the customer for the
   * authoritative balance.
   */
  async createPointsTransaction(
    clientId: string,
    pointsChange: number,
    description: string
  ) {
    const url = `${SmileApp.api_base}/points_transactions`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMILE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      // Smile wraps request bodies in the resource name, the same way its
      // responses are wrapped. Sending these fields at the top level is
      // rejected with a 403, which is a misleading status for a body problem.
      body: JSON.stringify({
        points_transaction: {
          customer_id: Number(clientId),
          points_change: pointsChange,
          description
        }
      })
    });

    if (!resp.ok) {
      // Smile explains refusals in the body (missing scope, validation, etc).
      // Log it server-side — it never reaches the client, which only sees a
      // generic error from the global handler.
      const detail = await resp.text().catch(() => '');
      throw new Error(
        `Smile points transaction failed with status ${resp.status}: ${detail || '(empty body)'}`
      );
    }
  }
}

export const Smile = new SmileApp();

import { SmileCustomerInfoSchema, SmilePointsProductSchema } from "@repo/shared";
import { SmilePointsProductsSchema, SmilePointsTransactionsSchema } from "./schemas";

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

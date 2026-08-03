import { SmileCustomerInfoSchema, SmilePointsProductSchema } from "@repo/shared";
import { SmilePointsProductsSchema } from "./schemas";

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

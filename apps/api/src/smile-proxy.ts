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
}

export const Smile = new SmileApp();

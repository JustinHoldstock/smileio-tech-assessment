import { SmilePointsProductSchema } from "@repo/shared";
import { z } from "zod";

/** Shape returned by Smile.io /points_products */
export const SmilePointsProductsSchema = z.object({
  points_products: SmilePointsProductSchema.array()
});

export type SmilePointsProducts = z.infer<typeof SmilePointsProductsSchema>;

/** Shape returned by Smile.io /points_products/{id} */
export const SmilePointsProductResponseSchema = z.object({
  points_product: SmilePointsProductSchema
});

export type SmilePointsProductResponse = z.infer<
  typeof SmilePointsProductResponseSchema
>;

/**
 * Shape returned by Smile.io POST /points_products/{id}/purchase.
 *
 * Parsed leniently on purpose. By the time this response arrives the points
 * have already been spent, so a field we did not anticipate must not turn a
 * successful purchase into a 500 that leaves the customer poorer with nothing
 * to show for it. Only the fields we actually surface are required.
 */
export const SmilePointsPurchaseResponseSchema = z.object({
  points_purchase: z.object({
    id: z.number(),
    customer_id: z.number(),
    points_product_id: z.number(),
    points_spent: z.number(),
    reward_fulfillment: z.object({
      id: z.number(),
      name: z.string(),
      /** Null for fulfilment types that do not issue a redeemable code. */
      code: z.string().nullish(),
      fulfillment_status: z.string(),
      usage_instructions: z.string().nullish(),
      terms_and_conditions: z.string().nullish(),
      expires_at: z.string().nullish()
    })
  })
});

export type SmilePointsPurchaseResponse = z.infer<
  typeof SmilePointsPurchaseResponseSchema
>;

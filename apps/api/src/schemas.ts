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
/**
 * Shape returned by Smile.io /points_transactions, as we choose to read it.
 *
 * SECURITY: Smile also returns `internal_note` on every transaction. It is
 * merchant-only and must never reach a customer, so it is deliberately NOT
 * declared here — Zod strips undeclared keys, which means the field is gone
 * before any of our code can touch it. That is the first of two barriers; the
 * second is the explicit field-by-field mapping in the route handler. Do not
 * add `internal_note` to this schema.
 *
 * Server-only by design: this lives in `@repo/api` rather than `@repo/shared`
 * so the raw merchant-facing shape is never part of the client contract.
 */
export const SmilePointsTransactionSchema = z.object({
  id: z.number(),
  customer_id: z.number(),
  points_change: z.number(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

export type SmilePointsTransaction = z.infer<typeof SmilePointsTransactionSchema>;

/** Smile wraps list responses in the resource name, same as /points_products. */
export const SmilePointsTransactionsSchema = z.object({
  points_transactions: SmilePointsTransactionSchema.array()
});

export type SmilePointsTransactions = z.infer<typeof SmilePointsTransactionsSchema>;

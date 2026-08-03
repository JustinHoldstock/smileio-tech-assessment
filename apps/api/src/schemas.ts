import { SmilePointsProductSchema } from "@repo/shared";
import { z } from "zod";

/** Shape returned by Smile.io /points_products */
export const SmilePointsProductsSchema = z.object({
  points_products: SmilePointsProductSchema.array()
});

export type SmilePointsProducts = z.infer<typeof SmilePointsProductsSchema>;

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

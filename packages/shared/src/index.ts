/**
 * Shared API contract between `@repo/web` and `@repo/api`.
 *
 * Schemas are defined once here with Zod and the TypeScript types are inferred
 * from them, so the client and server cannot drift: the API validates outgoing
 * payloads against the same schema the client parses them with.
 */

import { z } from "zod";

/** Shape returned by every non-2xx API response. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/** `GET /api/health` — liveness probe, used to verify wiring end to end. */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Shape returned by Smile.io /customers/{id} */
export const SmileCustomerInfoSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string().nullable(),
  email: z.string(),
  state: z.string(),
  date_of_birth: z.string().nullable(),
  points_balance: z.number(),
  referral_url: z.string().nullable(),
  vip_tier_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
  // really would prefer if the API would return a Preferred Name :[
});

export type SmileCustomerInfo = z.infer<typeof SmileCustomerInfoSchema>;

/** Shape returned by Smile.io /points_products/{id} */
export const SmilePointsProductSchema = z.object({
  id: z.number(),
  exchange_type: z.enum(['fixed', 'variable']),
  exchange_description: z.string(),
  points_price: z.number().nullable(),
  variable_points_step: z.number(),
  variable_points_step_reward_value: z.number(),
  variable_points_min: z.number().nullable(),
  variable_points_max: z.number().nullable(),
  reward: z.object({
    id: z.number(),
    name: z.string(),
    description: z.string(),
    image_url: z.string().url(),
    created_at: z.string(),
    updated_at: z.string()
  }),
  created_at: z.string(),
  updated_at: z.string()
});

export type SmilePointsProduct = z.infer<typeof SmilePointsProductSchema>;

/**
 * `GET /api/transactions` — a single points transaction, as shown to the
 * customer.
 *
 * SECURITY: this is deliberately NOT the raw Smile shape. Smile's
 * `points_transaction` also carries `internal_note`, which is merchant-only and
 * must never reach a customer. That field is absent here on purpose, so it
 * cannot be sent even by accident — the server maps into this shape field by
 * field (see `apps/api/src/index.ts`), and this schema is the contract both
 * sides validate against. Do not add `internal_note` to it.
 *
 * `points_change` is signed as Smile reports it: negative for a redemption,
 * positive for points earned.
 */
export const PointsTransactionSchema = z.object({
  id: z.number(),
  points_change: z.number(),
  description: z.string().nullable(),
  created_at: z.string(),
});

export type PointsTransaction = z.infer<typeof PointsTransactionSchema>;

/**
 * `POST /api/challenge` — the math question currently outstanding for this
 * session. Deliberately does NOT carry the answer: the answer only ever exists
 * server-side, keyed by session, and is destroyed the moment it is graded.
 */
export const MathChallengeSchema = z.object({
  id: z.string().uuid(),
  left: z.number().int(),
  right: z.number().int(),
  operator: z.enum(["+", "-"]),
  expiresAt: z.string().datetime(),
});

export type MathChallenge = z.infer<typeof MathChallengeSchema>;

/**
 * `POST /api/challenge/answer` request body.
 *
 * Note there is no challenge id: the server already knows which question is
 * outstanding for the session, so there is nothing for a client to forge or
 * replay.
 */
export const ChallengeAnswerRequestSchema = z.object({
  answer: z.number().int(),
});

export type ChallengeAnswerRequest = z.infer<typeof ChallengeAnswerRequestSchema>;

/** `POST /api/challenge/answer` — both outcomes are legitimate 200 responses. */
export const ChallengeResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("correct"),
    pointsAwarded: z.number().int(),
    newBalance: z.number().int(),
  }),
  z.object({
    outcome: z.literal("incorrect"),
    /** Seconds the client must wait before a new question is issued. */
    retryAfterSeconds: z.number().int(),
  }),
]);

export type ChallengeResult = z.infer<typeof ChallengeResultSchema>;

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

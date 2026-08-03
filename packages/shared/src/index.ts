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

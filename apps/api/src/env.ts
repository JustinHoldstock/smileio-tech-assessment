/**
 * Validated environment configuration.
 *
 * Parsed once when this module is first imported, so a misconfigured
 * deployment fails immediately and loudly rather than at the point some
 * request happens to need a missing value.
 *
 * Nothing here is ever sent to the client: validation errors report the
 * variable name and the reason only, never the value.
 */

import { z } from "zod";

const EnvSchema = z.object({
  SMILE_API_KEY: z
    .string()
    .min(1, "required — the private API key from Smile Admin"),

  SMILE_API_BASE_URL: z.string().url().default("https://api.smile.io/v1"),

  /** Coerced to a number: Smile's API takes `customer_id` as an integer. */
  SMILE_CUSTOMER_ID: z.coerce
    .number({ invalid_type_error: "required — must be a numeric Smile customer id" })
    .int()
    .positive(),

  /**
   * Optional at parse time so the app still boots before Upstash is wired up.
   * Use `requireRedisConfig()` at the point of use, which fails with a message
   * that says what to do about it.
   */
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  /** Unset locally — the Vite dev proxy makes requests same-origin. */
  WEB_ORIGIN: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `See apps/api/.env.example for the full list.`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();

/** Redis config, narrowed to non-optional. Throws if Upstash isn't configured. */
export function requireRedisConfig(): { url: string; token: string } {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env;

  if (url === undefined || token === undefined) {
    throw new Error(
      "Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and " +
        "UPSTASH_REDIS_REST_TOKEN — see apps/api/.env.example.",
    );
  }

  return { url, token };
}

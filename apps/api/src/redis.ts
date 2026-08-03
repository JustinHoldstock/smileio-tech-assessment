import { Redis } from "@upstash/redis";
import { requireRedisConfig } from "./env";

let client: Redis | null = null;

/**
 * Lazily constructed so the rest of the API still boots when Upstash isn't
 * configured — only the challenge routes fail, and with a message that says
 * what's missing.
 */
export function redis(): Redis {
  if (client === null) {
    const { url, token } = requireRedisConfig();
    client = new Redis({ url, token });
  }

  return client;
}

/**
 * Short-lived lock around a redemption.
 *
 * Redeeming is check-then-act: the route reads the balance, decides the
 * redemption is affordable, then spends the points. Two requests arriving
 * together both read the pre-purchase balance, both pass the check, and both
 * spend — so a double-clicked button, a second tab, or a retried request can
 * issue two coupons for what the customer meant as one redemption.
 *
 * Smile has no idempotency key, so nothing upstream deduplicates this. The lock
 * has to live here, and it has to wrap the whole read-check-purchase window
 * rather than just the purchase.
 *
 * Deliberately NOT a general-purpose distributed lock. It holds for seconds,
 * and the TTL is the safety net for a function that dies mid-request.
 */

import { randomUUID } from "node:crypto";
import { redis } from "./redis.js";

/**
 * Long enough to cover three Smile round trips, short enough that a crashed
 * request cannot block the reward for a customer who genuinely wants to retry.
 */
const LOCK_TTL_SECONDS = 15;

const lockKey = (customerId: string, productId: string) =>
  `lock:redeem:${customerId}:${productId}`;

/**
 * Release only if we still hold the lock.
 *
 * Without the token comparison, a request slow enough to outlive its own TTL
 * would delete whichever lock a later request had since acquired, letting two
 * redemptions run concurrently after all — the exact thing this prevents.
 */
const RELEASE_IF_OWNED = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/**
 * Returns an ownership token, or null when a redemption for this reward is
 * already in flight.
 */
export async function acquireRedemptionLock(
  customerId: string,
  productId: string,
): Promise<string | null> {
  const token = randomUUID();

  const acquired = await redis().set(lockKey(customerId, productId), token, {
    nx: true,
    ex: LOCK_TTL_SECONDS,
  });

  return acquired === "OK" ? token : null;
}

export async function releaseRedemptionLock(
  customerId: string,
  productId: string,
  token: string,
): Promise<void> {
  await redis().eval(RELEASE_IF_OWNED, [lockKey(customerId, productId)], [token]);
}

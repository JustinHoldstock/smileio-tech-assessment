/**
 * The lock is what stops two concurrent requests both reading a pre-purchase
 * balance, both deciding the redemption is affordable, and both spending.
 * Smile has no idempotency key, so nothing upstream would catch it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeRedis } from "./testing/fake-redis.js";

const state = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock("./redis.js", () => ({ redis: () => state.client }));

const { acquireRedemptionLock, releaseRedemptionLock } = await import(
  "./redemption-lock.js"
);

const CUSTOMER = "cust-1";
const PRODUCT = "prod-1";

let redis: FakeRedis;

beforeEach(() => {
  redis = new FakeRedis();
  state.client = redis;
});

describe("acquiring", () => {
  it("grants the lock when nothing holds it", async () => {
    expect(await acquireRedemptionLock(CUSTOMER, PRODUCT)).not.toBeNull();
  });

  it("refuses a second holder while the first is in flight", async () => {
    await acquireRedemptionLock(CUSTOMER, PRODUCT);

    expect(await acquireRedemptionLock(CUSTOMER, PRODUCT)).toBeNull();
  });

  it("locks per reward, not across the whole account", async () => {
    await acquireRedemptionLock(CUSTOMER, "prod-1");

    // Redeeming a different reward concurrently is legitimate.
    expect(await acquireRedemptionLock(CUSTOMER, "prod-2")).not.toBeNull();
  });

  it("frees itself if a request dies without releasing", async () => {
    await acquireRedemptionLock(CUSTOMER, PRODUCT);

    redis.advanceSeconds(16);

    expect(await acquireRedemptionLock(CUSTOMER, PRODUCT)).not.toBeNull();
  });
});

describe("releasing", () => {
  it("lets the next request through", async () => {
    const token = await acquireRedemptionLock(CUSTOMER, PRODUCT);
    if (token === null) throw new Error("expected a token");

    await releaseRedemptionLock(CUSTOMER, PRODUCT, token);

    expect(await acquireRedemptionLock(CUSTOMER, PRODUCT)).not.toBeNull();
  });

  it("ignores a release from someone who does not hold the lock", async () => {
    await acquireRedemptionLock(CUSTOMER, PRODUCT);

    await releaseRedemptionLock(CUSTOMER, PRODUCT, "not-my-token");

    expect(await acquireRedemptionLock(CUSTOMER, PRODUCT)).toBeNull();
  });

  it("cannot free a lock a later request has since acquired", async () => {
    // The failure this guards against: a request outlives its own TTL, the
    // lock expires, someone else takes it, and then the slow request's
    // `finally` deletes a lock it no longer owns — putting two redemptions in
    // flight at once, which is the exact thing the lock exists to prevent.
    const slowToken = await acquireRedemptionLock(CUSTOMER, PRODUCT);
    if (slowToken === null) throw new Error("expected a token");

    redis.advanceSeconds(16);
    const newHolder = await acquireRedemptionLock(CUSTOMER, PRODUCT);
    expect(newHolder).not.toBeNull();

    await releaseRedemptionLock(CUSTOMER, PRODUCT, slowToken);

    // The new holder still holds it.
    expect(await acquireRedemptionLock(CUSTOMER, PRODUCT)).toBeNull();
  });
});

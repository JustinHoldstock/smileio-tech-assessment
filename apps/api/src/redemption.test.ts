/**
 * `planRedemption` is the server's own judgement about whether a redemption is
 * allowed. The client sends at most a points figure; everything else here comes
 * from what the server just read from Smile. These tests cover the cases where
 * a tampered or merely stale client would otherwise get away with something.
 */

import { describe, expect, it } from "vitest";

import type { SmilePointsProduct } from "@repo/shared";

import { planRedemption, variableCeiling, variableMinimum } from "./redemption.js";

const baseReward = {
  id: 1,
  name: "Order discount",
  description: "Applies to one-time purchases.",
  image_url: "https://example.test/reward.png",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const fixed = (points_price: number | null): SmilePointsProduct => ({
  id: 10,
  exchange_type: "fixed",
  exchange_description: `${points_price} points`,
  points_price,
  variable_points_step: 0,
  variable_points_step_reward_value: 0,
  variable_points_min: null,
  variable_points_max: null,
  reward: baseReward,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

const variable = (
  overrides: Partial<SmilePointsProduct> = {},
): SmilePointsProduct => ({
  id: 20,
  exchange_type: "variable",
  exchange_description: "100 Points = $1",
  points_price: null,
  variable_points_step: 100,
  variable_points_step_reward_value: 1,
  variable_points_min: null,
  variable_points_max: null,
  reward: baseReward,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("fixed rewards", () => {
  it("charges the price Smile reports", () => {
    const check = planRedemption(fixed(250), 300, undefined);

    expect(check).toEqual({
      status: "ok",
      plan: { pointsToSpend: 250, variableSpend: undefined },
    });
  });

  it("omits points_to_spend entirely, which Smile requires for fixed products", () => {
    const check = planRedemption(fixed(250), 300, undefined);
    if (check.status !== "ok") throw new Error("expected ok");

    // Not null, not zero — absent, so the key is left out of the request body.
    expect(check.plan.variableSpend).toBeUndefined();
  });

  it("refuses when the balance falls short", () => {
    const check = planRedemption(fixed(250), 249, undefined);

    expect(check).toMatchObject({ status: "rejected", code: "insufficient_points" });
  });

  it("refuses a client that tries to choose its own price", () => {
    const check = planRedemption(fixed(250), 5000, 1);

    expect(check).toMatchObject({ status: "rejected", code: "invalid_request" });
  });

  it("refuses a reward with no usable price", () => {
    expect(planRedemption(fixed(null), 500, undefined)).toMatchObject({
      status: "rejected",
      code: "reward_unavailable",
    });
    expect(planRedemption(fixed(0), 500, undefined)).toMatchObject({
      status: "rejected",
      code: "reward_unavailable",
    });
  });
});

describe("variable rewards", () => {
  it("requires an amount", () => {
    expect(planRedemption(variable(), 500, undefined)).toMatchObject({
      status: "rejected",
      code: "invalid_request",
    });
  });

  it("accepts a valid amount on a step boundary", () => {
    const check = planRedemption(variable(), 500, 300);

    expect(check).toEqual({
      status: "ok",
      plan: { pointsToSpend: 300, variableSpend: 300 },
    });
  });

  it("refuses an amount below the minimum", () => {
    expect(
      planRedemption(variable({ variable_points_min: 200 }), 500, 100),
    ).toMatchObject({ status: "rejected", code: "invalid_request" });
  });

  it("refuses an amount above the maximum, even when affordable", () => {
    expect(
      planRedemption(variable({ variable_points_max: 300 }), 9000, 400),
    ).toMatchObject({ status: "rejected", code: "invalid_request" });
  });

  it("refuses an amount off the step boundary", () => {
    expect(planRedemption(variable(), 500, 150)).toMatchObject({
      status: "rejected",
      code: "invalid_request",
    });
  });

  it("refuses more than the customer holds", () => {
    expect(planRedemption(variable(), 100, 200)).toMatchObject({
      status: "rejected",
      code: "insufficient_points",
    });
  });

  it("reports the balance problem, not the increments, when both would fail", () => {
    // A valid-but-unaffordable amount should not be explained as a step error.
    expect(planRedemption(variable(), 100, 300)).toMatchObject({
      code: "insufficient_points",
    });
  });
});

describe("variable range helpers", () => {
  it("falls back to one step when Smile reports no explicit minimum", () => {
    expect(variableMinimum(variable())).toBe(100);
    expect(variableMinimum(variable({ variable_points_min: 250 }))).toBe(250);
  });

  it("snaps the ceiling down onto a step boundary measured from the minimum", () => {
    expect(variableCeiling(variable({ variable_points_min: 150 }), 500)).toBe(450);
  });

  it("returns null when even the minimum is unaffordable", () => {
    expect(variableCeiling(variable(), 99)).toBeNull();
  });

  it("never offers a value the server would then refuse", () => {
    // The UI slider runs from `variableMinimum` to `variableCeiling`; every
    // value it can produce must be accepted. A mismatch here would show a
    // customer an amount and then reject it.
    const product = variable({ variable_points_min: 150, variable_points_max: 900 });

    for (let balance = 0; balance <= 1200; balance += 50) {
      const ceiling = variableCeiling(product, balance);
      if (ceiling === null) continue;

      for (
        let points = variableMinimum(product);
        points <= ceiling;
        points += product.variable_points_step
      ) {
        expect(planRedemption(product, balance, points).status).toBe("ok");
      }
    }
  });
});

/**
 * Redemption rules.
 *
 * Kept as a pure function over values the *server* read from Smile. The client
 * sends at most a `pointsToSpend` figure; price, balance, and the variable
 * range are never taken from the request, so the worst a tampered client can do
 * is ask for an amount that gets rejected here.
 */

import type { SmilePointsProduct } from "@repo/shared";

/** A redemption that passed every check and is safe to send to Smile. */
export interface RedemptionPlan {
  /** What this will cost the customer. */
  pointsToSpend: number;
  /**
   * Passed straight to `purchasePointsProduct`. `undefined` for fixed products
   * so the field is omitted from the request body entirely.
   */
  variableSpend: number | undefined;
}

export type RedemptionCheck =
  | { status: "ok"; plan: RedemptionPlan }
  | {
      status: "rejected";
      /** Maps to the `error.code` in the API response. */
      code: string;
      /** Safe to show a customer: no internals, no ids. */
      message: string;
      /** HTTP status for the rejection. */
      httpStatus: 400 | 409;
    };

const reject = (
  code: string,
  message: string,
  httpStatus: 400 | 409 = 400,
): RedemptionCheck => ({ status: "rejected", code, message, httpStatus });

/**
 * The lowest spend Smile will accept for a variable product. Smile leaves
 * `variable_points_min` null when there is no explicit floor, in which case one
 * step is the smallest meaningful purchase.
 */
export function variableMinimum(product: SmilePointsProduct): number {
  return product.variable_points_min ?? product.variable_points_step;
}

/**
 * The highest spend that is both allowed and affordable, snapped down onto a
 * step boundary measured from the minimum.
 *
 * Anchoring the boundary at the minimum rather than at zero matches how an HTML
 * range input snaps (`min + k * step`), which keeps the slider in the UI and
 * this validation in exact agreement — a mismatch there would show the customer
 * a value the server then refuses.
 *
 * Returns null when the customer cannot afford even the minimum.
 */
export function variableCeiling(
  product: SmilePointsProduct,
  balance: number,
): number | null {
  const min = variableMinimum(product);
  const step = product.variable_points_step;

  if (step <= 0 || balance < min) return null;

  const allowed = product.variable_points_max ?? balance;
  const affordable = Math.min(allowed, balance);

  if (affordable < min) return null;

  return min + Math.floor((affordable - min) / step) * step;
}

/**
 * Validates a redemption request against the product and balance as Smile
 * currently reports them.
 */
export function planRedemption(
  product: SmilePointsProduct,
  balance: number,
  requestedPoints: number | undefined,
): RedemptionCheck {
  if (product.exchange_type === "fixed") {
    if (requestedPoints !== undefined) {
      return reject(
        "invalid_request",
        "This reward has a fixed price, so an amount cannot be chosen.",
      );
    }

    const price = product.points_price;

    if (price === null || price <= 0) {
      return reject(
        "reward_unavailable",
        "This reward is not currently available to redeem.",
        409,
      );
    }

    if (balance < price) {
      return reject(
        "insufficient_points",
        `This reward costs ${price} points and your balance is ${balance}.`,
        409,
      );
    }

    return { status: "ok", plan: { pointsToSpend: price, variableSpend: undefined } };
  }

  // Variable from here on.
  const step = product.variable_points_step;

  if (step <= 0) {
    return reject(
      "reward_unavailable",
      "This reward is not currently available to redeem.",
      409,
    );
  }

  if (requestedPoints === undefined) {
    return reject(
      "invalid_request",
      "Choose how many points to spend on this reward.",
    );
  }

  const min = variableMinimum(product);

  if (requestedPoints < min) {
    return reject(
      "invalid_request",
      `The smallest redemption for this reward is ${min} points.`,
    );
  }

  const max = product.variable_points_max;

  if (max !== null && requestedPoints > max) {
    return reject(
      "invalid_request",
      `The largest redemption for this reward is ${max} points.`,
    );
  }

  if ((requestedPoints - min) % step !== 0) {
    return reject(
      "invalid_request",
      `Points must be chosen in increments of ${step}, starting from ${min}.`,
    );
  }

  // Affordability last: a customer who picked a valid-but-unaffordable amount
  // gets told about the balance, not about the increments.
  if (balance < requestedPoints) {
    return reject(
      "insufficient_points",
      `That would spend ${requestedPoints} points and your balance is ${balance}.`,
      409,
    );
  }

  return {
    status: "ok",
    plan: { pointsToSpend: requestedPoints, variableSpend: requestedPoints },
  };
}

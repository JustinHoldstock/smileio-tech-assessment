import type { SmilePointsProduct } from "@repo/shared";

/**
 * The cheapest way into a reward: its fixed price, or for a variable reward the
 * smallest spend it will accept.
 *
 * Shared deliberately. The card uses it to gate the Redeem button and the
 * listing uses it to count what is within reach — if those two disagreed, the
 * summary would promise rewards the cards refuse.
 */
export const cheapestPrice = (product: SmilePointsProduct): number =>
  product.exchange_type === "fixed"
    ? (product.points_price ?? 0)
    : (product.variable_points_min ?? product.variable_points_step);

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  type RedeemRewardResult,
  RedeemRewardResultSchema,
  type SmilePointsProduct
} from '@repo/shared';

import { ApiError, postJson } from '../../api';
import styles from './redeem-modal.module.css';

interface RedeemModalParams {
  product: SmilePointsProduct;
  /** Balance as last read from the API. A hint for the UI — the server re-reads it. */
  balance: number;
  /** Dismiss without redeeming, or close after a successful redemption. */
  onClose: () => void;
  /** Called once points have moved, so the balance can be re-read. */
  onRedeemed: () => void;
}

/**
 * The spend range the slider offers.
 *
 * Mirrors `variableMinimum` / `variableCeiling` in `apps/api/src/redemption.ts`
 * — deliberately, so the slider can never offer a value the server will refuse.
 * The server remains the authority; this only keeps the UI honest.
 */
function variableRange(product: SmilePointsProduct, balance: number) {
  const step = product.variable_points_step;
  const min = product.variable_points_min ?? step;

  if (step <= 0 || balance < min) return { min, step, ceiling: null };

  // No configured maximum means the balance is the only ceiling.
  const affordable = Math.min(product.variable_points_max ?? balance, balance);

  if (affordable < min) return { min, step, ceiling: null };

  // Snap down onto a step boundary measured from the minimum, matching how a
  // range input itself snaps (`min + k * step`).
  return {
    min,
    step,
    ceiling: min + Math.floor((affordable - min) / step) * step
  };
}

export const RedeemModal = ({
  product,
  balance,
  onClose,
  onRedeemed
}: RedeemModalParams) => {
  const isFixed = product.exchange_type === 'fixed';
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const { min, step, ceiling } = useMemo(
    () => variableRange(product, balance),
    [product, balance]
  );

  const [points, setPoints] = useState(min);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RedeemRewardResult | null>(null);

  const fixedPrice = product.points_price ?? 0;
  const cost = isFixed ? fixedPrice : points;
  const canAfford = isFixed
    ? fixedPrice > 0 && balance >= fixedPrice
    : ceiling !== null;
  const resultingBalance = balance - cost;

  // Closing mid-flight would hide a redemption that is still going to happen.
  const requestClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  // Move focus into the dialog so keyboard and screen-reader users land here
  // rather than continuing from the Redeem button behind the backdrop.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestClose]);

  const handleConfirm = async () => {
    if (submitting || result !== null || !canAfford) return;

    setSubmitting(true);
    setError(null);

    try {
      const data = await postJson<RedeemRewardResult>(
        `/api/rewards/${product.id}/redeem`,
        RedeemRewardResultSchema.parse,
        // `pointsToSpend` is meaningful only for variable products, and the
        // server rejects it on fixed ones.
        isFixed ? {} : { pointsToSpend: points }
      );

      setResult(data);
      onRedeemed();
    } catch (cause) {
      // A 409 means the server's view of the balance or the reward disagrees
      // with ours, so what we are showing is stale — re-read it.
      if (cause instanceof ApiError && cause.status === 409) onRedeemed();

      // Only our own API's messages are written for a customer to read. A
      // network failure or a Zod parse error would otherwise put "Failed to
      // fetch", or an internals dump, in front of them.
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'We could not complete this redemption. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const labelStyle = { display: 'block', marginBottom: '4px' };

  /*
   * Portalled to <body> rather than rendered in place.
   *
   * The modal is opened from inside a reward card, and that card applies a
   * `transform` on hover. A transformed ancestor becomes the containing block
   * for `position: fixed` descendants, so an in-place modal centres itself on
   * the *card* and visibly jumps as the hover transform comes and goes. A
   * portal takes it out of that subtree entirely, which also sidesteps any
   * stacking-context fights with the fixed balance tracker.
   */
  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(event) => {
        // Only a click on the backdrop itself dismisses — not one that bubbled
        // up from inside the dialog.
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <h2 id={headingId} className={styles.title}>
          {result === null ? `Redeem ${product.reward.name}` : 'Reward redeemed'}
        </h2>

        {result !== null ? (
          <div role="status">
            <p style={{ marginTop: 0 }}>{result.coupon.name}</p>

            {result.coupon.code !== null ? (
              <>
                <p style={{ marginBottom: '4px' }}>Your code:</p>
                <code className={styles.code}>{result.coupon.code}</code>
              </>
            ) : (
              <p>This reward has been issued to your account — no code needed.</p>
            )}

            {result.coupon.usageInstructions !== null && (
              <p>{result.coupon.usageInstructions}</p>
            )}

            <p>
              {result.coupon.expiresAt !== null
                ? `Expires ${new Date(result.coupon.expiresAt).toLocaleDateString()}`
                : 'No expiry date.'}
            </p>

            <p>
              Spent {result.pointsSpent} points. New balance:{' '}
              {result.newBalance} points.
            </p>

            {result.coupon.termsAndConditions !== null && (
              <details style={{ marginBottom: '12px' }}>
                <summary>Terms and conditions</summary>
                <p>{result.coupon.termsAndConditions}</p>
              </details>
            )}

            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>{product.reward.description}</p>

            {isFixed ? (
              // Fixed rewards are redeemed one at a time, so there is nothing to
              // choose — the modal confirms the single redemption and its cost.
              <p>
                <strong>Cost: {fixedPrice} points</strong>
              </p>
            ) : ceiling !== null ? (
              <div style={{ marginBottom: '12px' }}>
                {ceiling === min ? (
                  // The balance affords exactly one valid spend, so a slider
                  // would be a control that cannot move — and one reading
                  // "100" to "100" reads like something is broken. State the
                  // amount instead.
                  <p style={labelStyle}>
                    Points to spend: <strong>{points}</strong>
                  </p>
                ) : (
                  <>
                    <label htmlFor={`${headingId}-slider`} style={labelStyle}>
                      Points to spend: <strong>{points}</strong>
                    </label>
                    <input
                      id={`${headingId}-slider`}
                      type="range"
                      min={min}
                      max={ceiling}
                      step={step}
                      value={points}
                      disabled={submitting}
                      onChange={(event) => setPoints(Number(event.target.value))}
                      style={{ width: '100%' }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.85rem'
                      }}
                    >
                      <span>{min}</span>
                      <span>{ceiling}</span>
                    </div>
                  </>
                )}
                <p style={{ marginBottom: 0 }}>{product.exchange_description}</p>
              </div>
            ) : (
              <p>
                You need {min - balance} more points before you can redeem this
                reward.
              </p>
            )}

            <div className={styles.summary}>
              <span>Current balance</span>
              <span className={styles.summaryValue}>
                {balance.toLocaleString()} points
              </span>
            </div>
            <div className={styles.summary}>
              <span>Balance after redeeming</span>
              <span className={styles.summaryValue}>
                {resultingBalance.toLocaleString()} points
              </span>
            </div>

            {!canAfford && isFixed && (
              <p>You do not have enough points for this reward.</p>
            )}

            {error !== null && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => void handleConfirm()}
                disabled={submitting || !canAfford}
              >
                {submitting ? 'Redeeming…' : `Confirm (${cost} points)`}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={requestClose}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

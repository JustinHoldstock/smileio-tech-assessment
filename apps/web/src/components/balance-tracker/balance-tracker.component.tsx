import { Skeleton } from '../skeleton/skeleton.component';
import styles from './balance-tracker.module.css';

interface BalanceTrackerParams {
  balance: number | null | undefined;
  loading: boolean;
  error: string | null | undefined;
}

export const BalanceTracker = ({
  balance,
  loading,
  error
}: BalanceTrackerParams) => {
  const hasBalance = balance !== null && balance !== undefined;
  // Only the very first load has nothing to show. A refetch keeps the last
  // known number on screen and dims it, rather than flashing a placeholder.
  const firstLoad = loading && !hasBalance;

  return (
    <div
      className={`${styles.tracker} ${loading && hasBalance ? styles.stale : ''}`}
      /*
       * Announce changes: earning or spending points updates this without the
       * user having moved focus anywhere near it.
       */
      aria-live="polite"
    >
      <span className={styles.label}>Balance</span>

      {firstLoad ? (
        <Skeleton width="3.5rem" height="1.05rem" radius="999px" />
      ) : error !== null && error !== undefined && !hasBalance ? (
        <span className={styles.unavailable} title={error}>
          unavailable
        </span>
      ) : (
        <>
          <span className={styles.value}>
            {hasBalance ? balance.toLocaleString() : '—'}
          </span>
          <span className={styles.unit}>points</span>
        </>
      )}
    </div>
  );
};

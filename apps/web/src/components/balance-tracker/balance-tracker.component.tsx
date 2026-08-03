import styles from './balance-tracker.module.css';

interface BalanceTrackerParams {
  balance: number | null | undefined;
  /** True while a refetch is in flight; the last known value stays on screen. */
  refreshing: boolean;
}

export const BalanceTracker = ({ balance, refreshing }: BalanceTrackerParams) => (
  <div
    className={`${styles.tracker} ${refreshing ? styles.stale : ''}`}
    /*
     * Announce changes: earning or spending points updates this without the
     * user having moved focus anywhere near it.
     */
    aria-live="polite"
  >
    <span className={styles.label}>Balance</span>
    <span className={styles.value}>
      {balance === null || balance === undefined ? '—' : balance.toLocaleString()}
    </span>
    <span className={styles.unit}>points</span>
  </div>
);

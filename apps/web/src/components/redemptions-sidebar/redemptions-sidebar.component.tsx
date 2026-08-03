import { type PointsTransaction, PointsTransactionSchema } from '@repo/shared';

import { useRequest } from '../../request';
import { Skeleton } from '../skeleton/skeleton.component';
import styles from './redemptions-sidebar.module.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

const SKELETON_COUNT = 3;

/**
 * `points_change` arrives signed the way Smile records it — negative for a
 * redemption. Customers think in terms of what they spent, so show the
 * magnitude and let the label carry the meaning.
 */
const formatPointsSpent = (pointsChange: number) =>
  `${Math.abs(pointsChange).toLocaleString()} points`;

/** Turn Smile's ISO timestamp into something a person would actually read. */
const formatDate = (isoDate: string) => {
  const date = new Date(isoDate);

  // Never render "Invalid Date" if Smile ever hands back something unexpected.
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const Redemption = ({ redemption }: { redemption: PointsTransaction }) => (
  <li className={styles.item}>
    <div className={styles.description}>
      {redemption.description ?? 'Reward redeemed'}
    </div>
    <div className={styles.meta}>
      <span className={styles.spent}>
        {formatPointsSpent(redemption.points_change)}
      </span>
      <span>{formatDate(redemption.created_at)}</span>
    </div>
  </li>
);

export const RedemptionsSidebar = () => {
  const { data: redemptions, loading, error } = useRequest<PointsTransaction[]>(
    `${API_BASE_URL}/api/transactions`,
    PointsTransactionSchema.array().parse
  );

  const hasRedemptions =
    redemptions !== null && redemptions !== undefined && redemptions.length > 0;

  return (
    <aside className={styles.sidebar} aria-labelledby="redemptions-heading">
      <h2 className={styles.title} id="redemptions-heading">
        Past redemptions
      </h2>

      {loading && (
        <div
          className={styles.placeholders}
          aria-busy="true"
          aria-label="Loading redemptions"
        >
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <Skeleton key={index} height="3.6rem" radius="10px" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className={styles.error} role="alert">
          Could not load your redemptions.
        </p>
      )}

      {!loading && !error && !hasRedemptions && (
        <p className={styles.state}>No redemptions yet</p>
      )}

      {!loading && !error && hasRedemptions && (
        <ul className={styles.list}>
          {redemptions.map((redemption) => (
            <Redemption key={redemption.id} redemption={redemption} />
          ))}
        </ul>
      )}
    </aside>
  );
};

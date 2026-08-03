import { type PointsTransaction, PointsTransactionSchema } from '@repo/shared';
import { useRequest } from '../../request';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

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
  <li style={{ padding: '10px 0', borderBottom: 'solid 1px lightgrey' }}>
    <div style={{ overflowWrap: 'anywhere' }}>
      {redemption.description ?? 'Reward redeemed'}
    </div>
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        justifyContent: 'space-between',
        fontSize: '0.85rem',
        color: 'grey',
        marginTop: '2px'
      }}
    >
      <span>{formatPointsSpent(redemption.points_change)}</span>
      <span>{formatDate(redemption.created_at)}</span>
    </div>
  </li>
);

export const RedemptionsSidebar = () => {
  const { data: redemptions, loading, error } = useRequest<PointsTransaction[]>(
    `${API_BASE_URL}/api/transactions`,
    PointsTransactionSchema.array().parse
  );

  return (
    <aside
      style={{
        // `0 1 18rem` rather than allowing growth: on a wide screen the sidebar
        // stays a fixed-ish column, and on a narrow one the flex row wraps it
        // below the main content instead of squeezing either column.
        flex: '0 1 18rem',
        minWidth: 0,
        // Extra top padding clears the fixed balance tracker, which sits in the
        // same corner as this column's heading on a wide screen.
        padding: '4.75rem 1.5rem 3rem',
        boxSizing: 'border-box'
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Past redemptions</h2>

      {loading && <p style={{ color: 'grey' }}>Loading redemptions…</p>}

      {!loading && error && (
        <p data-status="error">Could not load your redemptions.</p>
      )}

      {!loading && !error && redemptions?.length === 0 && (
        <p style={{ color: 'grey' }}>No redemptions yet</p>
      )}

      {!loading && !error && redemptions !== null && redemptions !== undefined && redemptions.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {redemptions.map((redemption) => (
            <Redemption key={redemption.id} redemption={redemption} />
          ))}
        </ul>
      )}
    </aside>
  );
};

import { type SmilePointsProduct, SmilePointsProductSchema } from '@repo/shared';

import { useRequest } from '../../request';
import { cheapestPrice } from '../../rewards';
import { PointsProduct } from '../points-product/points-product.component';
import { Skeleton } from '../skeleton/skeleton.component';
import styles from './products-list.module.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface ProductsListParams {
  /**
   * Passed in rather than fetched here: the balance has several consumers on
   * this page (the tracker, the greeting, every card), so it stays a single
   * request owned by App. The reward catalogue has exactly one consumer, which
   * is why that one lives here.
   */
  balance: number;
  /** Called once points have moved, so the balance can be re-read. */
  onRedeemed: () => void;
}

const SKELETON_COUNT = 4;

export const ProductsList = ({ balance, onRedeemed }: ProductsListParams) => {
  const {
    data: products,
    loading,
    error
  } = useRequest<SmilePointsProduct[]>(
    `${API_BASE_URL}/api/rewards`,
    SmilePointsProductSchema.array().parse
  );

  const affordable =
    products?.filter((product) => balance >= cheapestPrice(product)).length ?? 0;

  return (
    <section className={styles.section} aria-labelledby="rewards-heading">
      <div className={styles.header}>
        <h2 className={styles.title} id="rewards-heading">
          Rewards
        </h2>
        {!loading && !error && products !== null && products !== undefined && products.length > 0 && (
          <span className={styles.summary}>
            {affordable} of {products.length} within reach
          </span>
        )}
      </div>

      {loading && (
        <div className={styles.grid} aria-busy="true" aria-label="Loading rewards">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <Skeleton key={index} height="11rem" radius="var(--radius)" />
          ))}
        </div>
      )}

      {!loading && (error || products === null || products === undefined) && (
        <p className={styles.state} role="alert">
          We couldn&rsquo;t load the rewards just now.
        </p>
      )}

      {!loading && !error && products?.length === 0 && (
        <p className={styles.state}>No rewards are available yet.</p>
      )}

      {!loading && !error && products !== null && products !== undefined && products.length > 0 && (
        <div className={styles.grid}>
          {products.map((product) => (
            <PointsProduct
              key={product.id}
              product={product}
              balance={balance}
              onRedeemed={onRedeemed}
            />
          ))}
        </div>
      )}
    </section>
  );
};

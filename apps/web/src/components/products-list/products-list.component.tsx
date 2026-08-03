import type { SmilePointsProduct } from '@repo/shared';

import { cheapestPrice } from '../../rewards';
import { PointsProduct } from '../points-product/points-product.component';
import styles from './products-list.module.css';

interface ProductsListParams {
  products: SmilePointsProduct[] | null | undefined;
  balance: number;
  loading: boolean;
  /** Called once points have moved, so the balance can be re-read. */
  onRedeemed: () => void;
}

const SKELETON_COUNT = 4;

export const ProductsList = ({
  products,
  balance,
  loading,
  onRedeemed
}: ProductsListParams) => {
  const affordable =
    products?.filter((product) => balance >= cheapestPrice(product)).length ?? 0;

  return (
    <section className={styles.section} aria-labelledby="rewards-heading">
      <div className={styles.header}>
        <h2 className={styles.title} id="rewards-heading">
          Rewards
        </h2>
        {!loading && products !== null && products !== undefined && products.length > 0 && (
          <span className={styles.summary}>
            {affordable} of {products.length} within reach
          </span>
        )}
      </div>

      {loading && (
        <div className={styles.grid} aria-busy="true" aria-label="Loading rewards">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <div className={styles.skeleton} key={index} />
          ))}
        </div>
      )}

      {!loading && (products === null || products === undefined) && (
        <p className={styles.state}>We couldn&rsquo;t load the rewards just now.</p>
      )}

      {!loading && products?.length === 0 && (
        <p className={styles.state}>No rewards are available yet.</p>
      )}

      {!loading && products !== null && products !== undefined && products.length > 0 && (
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

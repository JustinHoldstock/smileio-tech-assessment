import { useState } from 'react';

import type { SmilePointsProduct } from '@repo/shared';

import { cheapestPrice } from '../../rewards';
import { RedeemModal } from '../redeem-modal/redeem-modal.component';
import styles from './points-product.module.css';

interface PointsProductParams {
  product: SmilePointsProduct;
  balance: number;
  /** Called once points have moved, so the balance can be re-read. */
  onRedeemed: () => void;
}

export const PointsProduct = ({ product, balance, onRedeemed }: PointsProductParams) => {
  const [modalOpen, setModalOpen] = useState(false);

  const isFixed = product.exchange_type === 'fixed';
  const price = cheapestPrice(product);
  const canAfford = balance >= price;
  const shortfall = Math.max(0, price - balance);
  const progress = price > 0 ? Math.min(1, balance / price) : 1;

  return (
    <article className={`${styles.card} ${canAfford ? styles.affordable : ''}`}>
      <div className={styles.head}>
        {/*
          Decorative: the reward name sits right beside it, so alt text here
          would just make a screen reader say everything twice.
        */}
        <img
          className={styles.thumb}
          src={product.reward.image_url}
          alt=""
          width={52}
          height={52}
        />
        <div className={styles.heading}>
          <h3 className={styles.name}>{product.reward.name}</h3>
          {product.reward.description && (
            <p className={styles.description}>{product.reward.description}</p>
          )}
        </div>
      </div>

      <span className={`${styles.cost} ${canAfford ? styles.ready : ''}`}>
        {isFixed
          ? `${price.toLocaleString()} points`
          : product.exchange_description}
      </span>

      {/* Keeps footers aligned across a row of cards with uneven descriptions. */}
      <div className={styles.spacer} />

      {!canAfford && (
        <div className={styles.progress}>
          <div
            className={styles.track}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={price}
            aria-valuenow={Math.min(balance, price)}
            aria-label={`Progress towards ${product.reward.name}`}
          >
            <div className={styles.fill} style={{ width: `${progress * 100}%` }} />
          </div>
          <span className={styles.remaining}>
            {shortfall.toLocaleString()} points to go
          </span>
        </div>
      )}

      <button
        type="button"
        className={styles.button}
        disabled={!canAfford}
        onClick={() => setModalOpen(true)}
      >
        {canAfford ? 'Redeem' : 'Not enough points'}
      </button>

      {/*
        Rendered from here rather than from App so that opening a reward stays a
        concern of that reward's card — App only needs to hand down the callback
        that refreshes the balance.
      */}
      {modalOpen && (
        <RedeemModal
          product={product}
          balance={balance}
          onClose={() => setModalOpen(false)}
          onRedeemed={onRedeemed}
        />
      )}
    </article>
  );
};

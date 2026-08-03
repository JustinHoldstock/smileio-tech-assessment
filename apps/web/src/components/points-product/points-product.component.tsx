import { useState } from 'react';

import type { SmilePointsProduct } from '@repo/shared';

import { RedeemModal } from '../redeem-modal/redeem-modal.component';

interface PointsProductParams {
  product: SmilePointsProduct;
  balance: number;
  /** Called once points have moved, so the balance can be re-read. */
  onRedeemed: () => void;
}

export const PointsProduct = ({ product, balance, onRedeemed }: PointsProductParams) => {
  const [modalOpen, setModalOpen] = useState(false);

  const isFixed = product.exchange_type === 'fixed';
  // The cheapest way to redeem: the fixed price, or for a variable reward its
  // minimum spend. Keeps this gate consistent with what the modal will accept —
  // a card that says "affordable" must not open a modal that says otherwise.
  const price = isFixed
    ? (product.points_price ?? 0)
    : (product.variable_points_min ?? product.variable_points_step);
  const canAfford = balance >= price;

  return <div style={{ border: 'solid grey', borderRadius: '8px', padding: '8px' }}>
    <div>
      <h2 style={{marginTop: '2px', marginBottom: '2px'}}>{product.reward.name}</h2>
      <a>{product.reward.description}</a>
      <p>
        Cost: {isFixed ? `${product.points_price} points` : product.exchange_description}
      </p>
    </div>
    <div style={{ marginBottom: '12px' }}>
      <img src={product.reward.image_url} height={64} width={64} />
    </div>
    <div>
      <button disabled={!canAfford} onClick={() => setModalOpen(true)}>Redeem</button>
      {!canAfford && <a style={{ color: 'green', marginLeft: '6px' }}>{`Only ${price - balance} points to go! (Current balance ${balance} points)`}</a>}
    </div>
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
  </div>
}

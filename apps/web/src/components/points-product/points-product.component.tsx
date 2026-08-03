import type { SmilePointsProduct } from '@repo/shared';

interface PointsProductParams {
  product: SmilePointsProduct;
  balance: number;
}

export const PointsProduct = ({ product, balance }: PointsProductParams) => {
  const isFixed = product.exchange_type === 'fixed';
  const price = isFixed
    ? (product.points_price ?? 0)
    : (product.variable_points_step ?? 0);
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
      <button disabled={!canAfford}>Redeem</button>
      {!canAfford && <a style={{ color: 'green', marginLeft: '6px' }}>{`Only ${price - balance} points to go! (Current balance ${balance} points)`}</a>}
    </div>
  </div>
}

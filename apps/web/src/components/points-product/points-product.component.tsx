import React from 'react';

import type { SmilePointsProduct } from '@repo/shared';

interface PointsProductParams {
  product: SmilePointsProduct;
}

export const PointsProduct = ({ product }: PointsProductParams) => {
  const isFixed = product.exchange_type === 'fixed';

  return <div style={{ border: 'solid grey', borderRadius: '8px', padding: '8px' }}>
    <h2>{product.reward.name}</h2>
    <p>{isFixed ? `${product.points_price} points` : product.exchange_description}</p>
    <img src={product.reward.image_url} height={64} width={64} />
    <p>{product.reward.description}</p>
  </div>
}

import { type SmileCustomerInfo, SmileCustomerInfoSchema, type SmilePointsProduct, SmilePointsProductSchema } from "@repo/shared";
import { useRequest } from "./request";
import { useEffect } from "react";
import { PointsProduct } from "./components/points-product/points-product.component";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * Scaffold placeholder. Verifies that the frontend can reach the backend and
 * that the shared Zod contract parses the response on both sides.
 */
export function App() {
  const {
    data: customerInfo,
    error: customerInfoError,
    loading: customerInfoLoading,
    abortController: customerInfoAbortController
  } = useRequest<SmileCustomerInfo>(`${API_BASE_URL}/api/customer`, SmileCustomerInfoSchema.parse);

  const {
    data: rewards,
    // error: rewardsError,
    loading: rewardsLoading,
    abortController: rewardsAbortController
  } = useRequest<SmilePointsProduct[]>(`${API_BASE_URL}/api/rewards`, SmilePointsProductSchema.array().parse);

  useEffect(() => {
    return () => {
      // For now
      customerInfoAbortController?.abort();
      rewardsAbortController?.abort()
    }
  })

  // Temp, for now
  if (customerInfoLoading) {
    return <main>
      <h1>Loading...</h1>
    </main>;
  }

  if (customerInfoError) {
    return <main>
      <h1>Error!</h1>
      <p>{customerInfoError}</p>
    </main>
  }

  return (
    <main>
      <h1>Rewards</h1>
      <p>Hey {customerInfo?.first_name}!</p>
      <p>Current balance: {customerInfo?.points_balance}</p>
      <div>
        {rewardsLoading ? 'Rewards loading...' : null}
        {!rewardsLoading ? rewards?.map((product) => <PointsProduct product={product} />) : null}
      </div>
    </main>
  );
}

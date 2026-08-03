import { type SmileCustomerInfo, SmileCustomerInfoSchema, type SmilePointsProduct, SmilePointsProductSchema } from "@repo/shared";
import { useRequest } from "./request";
import { useCallback, useEffect, useState } from "react";
import { PointsProduct } from "./components/points-product/points-product.component";
import { MathChallengeCard } from "./components/math-challenge/math-challenge.component";
import { RedemptionsSidebar } from "./components/redemptions-sidebar/redemptions-sidebar.component";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * Two columns on a wide screen, stacked on a narrow one. `flexWrap` does the
 * whole job: once the two columns' bases no longer fit, the sidebar drops below
 * the main content rather than either column overflowing the viewport.
 */
const pageStyle = { display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "center" } as const;

/**
 * `border-box` matters here: `main` carries generous padding from styles.css,
 * and without it the flex-assigned width would be content-only and the padding
 * would push the page into horizontal scroll on narrow screens.
 */
const mainColumnStyle = { flex: "1 1 22rem", minWidth: 0, boxSizing: "border-box" } as const;

/**
 * Scaffold placeholder. Verifies that the frontend can reach the backend and
 * that the shared Zod contract parses the response on both sides.
 */
export function App() {
  const {
    data: customerInfo,
    error: customerInfoError,
    loading: customerInfoLoading,
    abortController: customerInfoAbortController,
    refetch: refetchCustomerInfo
  } = useRequest<SmileCustomerInfo>(`${API_BASE_URL}/api/customer`, SmileCustomerInfoSchema.parse);

  const {
    data: rewards,
    // error: rewardsError,
    loading: rewardsLoading,
    abortController: rewardsAbortController
  } = useRequest<SmilePointsProduct[]>(`${API_BASE_URL}/api/rewards`, SmilePointsProductSchema.array().parse);

  const [redemptionVersion, setRedemptionVersion] = useState(0);

  /**
   * A redemption moves the balance AND adds a transaction, so both the customer
   * and the sidebar are now stale. `useRequest` only fetches on mount, so the
   * sidebar is remounted via its `key` rather than given a refetch it does not
   * expose.
   */
  const handleRedeemed = useCallback(() => {
    refetchCustomerInfo();
    setRedemptionVersion((version) => version + 1);
  }, [refetchCustomerInfo]);

  useEffect(() => {
    return () => {
      // For now. We can clean this up later
      customerInfoAbortController?.abort();
      rewardsAbortController?.abort()
    }
  })

  // Temp, for now. Only blank the page on the FIRST load — refetching after a
  // points award must not unmount the challenge card and lose its state.
  if (customerInfoLoading && !customerInfo) {
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
    <div style={pageStyle}>
      <main style={mainColumnStyle}>
        <h1>Rewards</h1>
        <p>Hey {customerInfo?.first_name}!</p>
        <p>Current balance: {customerInfo?.points_balance}</p>
        <MathChallengeCard onAwarded={refetchCustomerInfo} />
        <div>
          {rewardsLoading && 'Rewards loading...'}
          {!rewardsLoading && rewards?.map((product) => <PointsProduct key={product.id} product={product} balance={customerInfo?.points_balance || 0} onRedeemed={handleRedeemed} />)}
        </div>
      </main>
      <RedemptionsSidebar key={redemptionVersion} />
    </div>
  );
}

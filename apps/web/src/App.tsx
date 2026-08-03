import { type SmileCustomerInfo, SmileCustomerInfoSchema } from "@repo/shared";
import { useRequest } from "./request";
import { useCallback, useEffect, useState } from "react";
import { ProductsList } from "./components/products-list/products-list.component";
import { BalanceTracker } from "./components/balance-tracker/balance-tracker.component";
import { MathChallengeCard } from "./components/math-challenge/math-challenge.component";
import { RedemptionsSidebar } from "./components/redemptions-sidebar/redemptions-sidebar.component";
import { Skeleton } from "./components/skeleton/skeleton.component";

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
    // abortController: customerInfoAbortController,
    refetch: refetchCustomerInfo
  } = useRequest<SmileCustomerInfo>(`${API_BASE_URL}/api/customer`, SmileCustomerInfoSchema.parse);

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
      // customerInfoAbortController?.abort();
    }
  })

  /*
   * No page-level loading or error return.
   *
   * A single gate meant one slow or failing request blanked everything — the
   * rewards could be ready while the customer call was still in flight, and a
   * customer error hid a perfectly healthy sidebar. Each component now renders
   * its own skeleton and its own failure, so the page fills in progressively
   * and one broken endpoint costs you only that section.
   */
  const greetingLoading = customerInfoLoading && !customerInfo;

  return (
    <div style={pageStyle}>
      <BalanceTracker
        balance={customerInfo?.points_balance}
        loading={customerInfoLoading}
        error={customerInfoError}
      />
      <main style={mainColumnStyle}>
        <h1>Smile Rewards</h1>

        {greetingLoading && <Skeleton width="9rem" height="1.1rem" />}

        {!greetingLoading && customerInfoError && (
          <p role="alert" data-status="error">
            We couldn&rsquo;t load your account details.
          </p>
        )}

        {!greetingLoading && !customerInfoError && (
          <p>Hey {customerInfo?.first_name}!</p>
        )}

        <MathChallengeCard onAwarded={refetchCustomerInfo} />
        <ProductsList
          balance={customerInfo?.points_balance ?? 0}
          onRedeemed={handleRedeemed}
        />
      </main>
      <RedemptionsSidebar key={redemptionVersion} />
    </div>
  );
}

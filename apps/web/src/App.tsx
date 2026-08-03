import { type SmileCustomerInfo, SmileCustomerInfoSchema } from "@repo/shared";
import { useRequest } from "./request";
import { useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * Scaffold placeholder. Verifies that the frontend can reach the backend and
 * that the shared Zod contract parses the response on both sides.
 */
export function App() {
  const { data: customerInfo, error: customerInfoError, loading: customerInfoLoading, abortController: customerInfoAbortController } = useRequest<SmileCustomerInfo>(`${API_BASE_URL}/api/customer`, SmileCustomerInfoSchema.parse);

  useEffect(() => {
    return () => customerInfoAbortController?.abort();
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
    </main>
  );
}

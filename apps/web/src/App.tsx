import { useEffect, useState } from "react";
import { HealthResponseSchema, type HealthResponse } from "@repo/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * Scaffold placeholder. Verifies that the frontend can reach the backend and
 * that the shared Zod contract parses the response on both sides.
 */
export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        setHealth(HealthResponseSchema.parse(await response.json()));
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Unknown error");
      }
    }

    void checkHealth();

    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Rewards</h1>
      <p>Scaffold — no features implemented yet.</p>
      <p>
        API status:{" "}
        {error !== null ? (
          <span data-status="error">unreachable ({error})</span>
        ) : health !== null ? (
          <span data-status="ok">{health.status}</span>
        ) : (
          <span data-status="pending">checking…</span>
        )}
      </p>
    </main>
  );
}

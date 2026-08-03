import { useCallback, useEffect, useMemo, useState } from "react"

export const useRequest = <T>(url: string, parser: (json: Object) => T) => {
  const [data, setData] = useState<T | null>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>();
  const [abortController, setAbortController] = useState<AbortController | null>();

  const refetch = useCallback(async () => {
    setLoading(true);
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const { data } = await response.json();

      setError(null);
      setData(parser(data));
      setAbortController(null);
      setLoading(false);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Unknown error");
      setAbortController(null);
      setData(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();

    return abortController?.abort();
  }, [])

  return useMemo(() => ({
    data,
    loading,
    error,
    refetch,
    abortController
  }), [
    data,
    loading,
    error,
    refetch,
    abortController
  ])
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/** Carries the HTTP status, so callers can treat 410 and 429 as flow rather than failure. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * POST helper for the mutating endpoints.
 *
 * `useRequest` covers GET-on-mount; this covers everything that changes state.
 * The parser is applied to the `data` payload so a response that does not match
 * the shared contract fails here rather than somewhere further downstream.
 */
export async function postJson<T>(
  path: string,
  parse: (value: unknown) => T,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    // The session cookie is what ties a request to its outstanding challenge.
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      json?.error?.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return parse(json?.data);
}

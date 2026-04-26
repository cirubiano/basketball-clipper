/**
 * Core HTTP client for the Basketball Clipper API.
 *
 * BASE_URL resolution (checked in order):
 *   1. NEXT_PUBLIC_API_URL  — set by Next.js at build time
 *   2. EXPO_PUBLIC_API_URL  — set by Expo at bundle time
 *   3. http://localhost:8000 — fallback for local dev / Jest
 *
 * The WS base URL is derived automatically from BASE_URL so a single env var
 * covers both REST and WebSocket (http → ws, https → wss).
 */

// ── URL resolution ────────────────────────────────────────────────────────────

// Allow process.env access without requiring @types/node in every consumer
declare const process: { env: Record<string, string | undefined> } | undefined;

function resolveBaseUrl(): string {
  // `process` may be undefined in some browser/Expo environments
  if (typeof process !== "undefined") {
    return (
      process.env["NEXT_PUBLIC_API_URL"] ??
      process.env["EXPO_PUBLIC_API_URL"] ??
      "http://localhost:8000"
    );
  }
  return "http://localhost:8000";
}

export const BASE_URL: string = resolveBaseUrl();

/**
 * Derives the WebSocket base URL from BASE_URL.
 * "http://..."  → "ws://..."
 * "https://..." → "wss://..."
 */
export const WS_BASE_URL: string = BASE_URL.replace(/^http/, "ws");

// ── Error type ────────────────────────────────────────────────────────────────

/**
 * Thrown by `apiRequest` whenever the server responds with a non-2xx status.
 * Carries the numeric HTTP status code so callers can branch on 401, 404, etc.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    const detail =
      typeof body === "object" &&
      body !== null &&
      "detail" in body
        ? String((body as Record<string, unknown>)["detail"])
        : `HTTP ${status}`;
    super(detail);
    this.name = "ApiError";
  }
}

// ── Request options ───────────────────────────────────────────────────────────

export interface RequestOptions extends RequestInit {
  /**
   * Bearer token to include in the Authorization header.
   * Pass the value stored after login — no "Bearer " prefix needed.
   */
  token?: string;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

/**
 * Makes an authenticated fetch request and deserialises the JSON response.
 *
 * - Automatically sets `Content-Type: application/json` for non-FormData bodies.
 * - Attaches the Bearer token when provided.
 * - Throws `ApiError` on any non-2xx status.
 * - Returns `undefined` (cast to T) for 204 No Content responses.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { token, headers: extraHeaders, body, ...rest } = options;

  const headers: Record<string, string> = {
    ...(extraHeaders as Record<string, string>),
  };

  // Let the browser set Content-Type (with multipart boundary) for FormData
  if (!(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    body,
    headers,
  });

  if (!response.ok) {
    // Try to parse the FastAPI error body ({"detail": "..."}) for a
    // human-readable message; fall back to the raw text if it isn't JSON.
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text().catch(() => null);
    }
    throw new ApiError(response.status, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

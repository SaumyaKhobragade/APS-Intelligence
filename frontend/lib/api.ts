/**
 * Frontend API base URL resolution and normalization.
 *
 * Production Architecture (Same-Origin Strategy):
 * In production, the browser sends requests to same-origin `/api/v1`.
 * Nginx reverse-proxies all `/api/` traffic to the local FastAPI backend at `127.0.0.1:8000`.
 * This avoids hardcoding internal localhost/127.0.0.1 IP addresses in the client bundle,
 * prevents cross-origin requests, and eliminates CORS preflight overhead.
 *
 * Environment Variables (Build-time):
 * - `NEXT_PUBLIC_API_BASE_URL`: Optional explicit base URL (e.g. `/api/v1` or `https://aps.example.com/api/v1`).
 * - `NEXT_PUBLIC_API_URL`: Supported backward-compatible alias.
 * - In production mode (`NODE_ENV === "production"`), defaults to same-origin relative `/api/v1`.
 * - In development mode, defaults to `http://localhost:8000/api/v1`.
 *
 * Server-side / SSR Internal Calls:
 * - `INTERNAL_API_URL`: Optional runtime environment variable for Node.js server-side requests (e.g. `http://127.0.0.1:8000/api/v1`).
 *
 * NOTE: Never pass secrets or API keys to NEXT_PUBLIC_* variables as they are inlined into client JS bundles during build!
 */

export function resolveDefaultApiBaseUrl(
  env: { NEXT_PUBLIC_API_BASE_URL?: string; NEXT_PUBLIC_API_URL?: string; NODE_ENV?: string } = process.env
): string {
  const explicit = env.NEXT_PUBLIC_API_BASE_URL || env.NEXT_PUBLIC_API_URL;
  if (explicit && explicit.trim()) {
    return normalizeApiBaseUrl(explicit);
  }
  if (env.NODE_ENV === "production") {
    return "/api/v1";
  }
  return "http://localhost:8000/api/v1";
}

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "http://localhost:8000/api/v1";
  }
  const stripped = trimmed.replace(/\/+$/, "");
  if (/\/api\/v1$/i.test(stripped)) {
    return stripped;
  }
  if (stripped === "/api") {
    return "/api/v1";
  }
  return `${stripped}/api/v1`;
}

export const API_BASE_URL = resolveDefaultApiBaseUrl();

export function apiUrl(path: string, baseUrl: string = API_BASE_URL): string {
  const cleanPath = path.replace(/^\/+/, "");
  if (!baseUrl) {
    return `/${cleanPath}`;
  }
  return `${baseUrl.replace(/\/+$/, "")}/${cleanPath}`;
}

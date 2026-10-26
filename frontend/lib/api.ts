const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export function normalizeApiBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) return "http://localhost:8000/api/v1";
  return /\/api\/v1$/i.test(normalized) ? normalized : `${normalized}/api/v1`;
}

export const API_BASE_URL = normalizeApiBaseUrl(configuredApiBaseUrl);

export function apiUrl(path: string): string {
  return `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const API_BASE_URL = apiBaseUrl.replace(/\/$/, "");

export function apiUrl(path: string) {
  return `${API_BASE_URL}/${path.replace(/^\//, "")}`;
}

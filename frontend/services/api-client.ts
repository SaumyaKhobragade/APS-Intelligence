import { apiUrl } from "@/lib/api";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`APS Intelligence API request failed with ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

import { apiUrl } from "@/lib/api";

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status: number, payload?: Partial<ApiErrorPayload>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload?.code ?? (status === 408 ? "timeout" : "http_error");
    this.details = payload?.details;
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;

function isJsonResponse(response: Response): boolean {
  return response.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

async function parseError(response: Response): Promise<ApiErrorPayload | undefined> {
  if (!isJsonResponse(response)) return undefined;
  try {
    const payload = (await response.json()) as { error?: ApiErrorPayload };
    return payload.error;
  } catch {
    return undefined;
  }
}

function requestHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  headers.set("Accept", headers.get("Accept") ?? "application/json");
  if (init?.body && (typeof init.body === "string" || (typeof init.body === "object" && !(init.body instanceof FormData) && !(init.body instanceof Blob))) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

export async function apiFetch<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...requestInit } = init;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl(path), {
      ...requestInit,
      headers: requestHeaders(requestInit),
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload = await parseError(response);
      throw new ApiError(payload?.message ?? `APS Intelligence API request failed with status ${response.status}.`, response.status, payload);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The APS Intelligence API request timed out. Try again.", 408, { code: "timeout" });
    }
    throw new ApiError("The APS Intelligence API could not be reached. Check the backend URL and try again.", 0, { code: "network_error" });
  } finally {
    window.clearTimeout(timeout);
  }
}

function filenameFromHeader(value: string | null): string | undefined {
  const match = value?.match(/filename="?([^";]+)"?/i);
  if (!match) return undefined;
  return match[1].replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function apiDownload(path: string, fallbackFilename: string): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl(path), { headers: { Accept: "*/*" }, signal: controller.signal });
    if (!response.ok) {
      const payload = await parseError(response);
      throw new ApiError(payload?.message ?? `Download failed with status ${response.status}.`, response.status, payload);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameFromHeader(response.headers.get("content-disposition")) ?? fallbackFilename.replace(/[^A-Za-z0-9._-]/g, "_");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new ApiError("The download request timed out. Try again.", 408, { code: "timeout" });
    throw new ApiError("The download could not be completed. Check the backend connection and try again.", 0, { code: "network_error" });
  } finally {
    window.clearTimeout(timeout);
  }
}

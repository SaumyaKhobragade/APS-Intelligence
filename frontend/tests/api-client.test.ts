import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiUrl, normalizeApiBaseUrl, resolveDefaultApiBaseUrl } from "@/lib/api";
import { apiDownload, apiFetch } from "@/services/api-client";

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("shared API boundary", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("normalizes configured roots to the versioned API prefix", () => {
    expect(normalizeApiBaseUrl(" http://localhost:8000/ ")).toBe("http://localhost:8000/api/v1");
    expect(normalizeApiBaseUrl("http://localhost:8000/api/v1/")).toBe("http://localhost:8000/api/v1");
    expect(normalizeApiBaseUrl("")).toBe("http://localhost:8000/api/v1");
  });

  it("resolves default API base URL based on environment and aliases", () => {
    // Production default: same-origin relative /api/v1
    expect(resolveDefaultApiBaseUrl({ NODE_ENV: "production" })).toBe("/api/v1");
    // Development default: localhost FastAPI
    expect(resolveDefaultApiBaseUrl({ NODE_ENV: "development" })).toBe("http://localhost:8000/api/v1");
    // Explicit NEXT_PUBLIC_API_URL alias override
    expect(resolveDefaultApiBaseUrl({ NEXT_PUBLIC_API_URL: "https://aps.example.com" })).toBe("https://aps.example.com/api/v1");
    // Explicit NEXT_PUBLIC_API_BASE_URL override
    expect(resolveDefaultApiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: "/api" })).toBe("/api/v1");
  });

  it("constructs correct apiUrl with relative and absolute bases", () => {
    expect(apiUrl("/health", "/api/v1")).toBe("/api/v1/health");
    expect(apiUrl("predictions", "/api/v1")).toBe("/api/v1/predictions");
    expect(apiUrl("/analytics/dashboard", "https://api.example.com/api/v1")).toBe("https://api.example.com/api/v1/analytics/dashboard");
  });

  it("parses successful JSON and adds JSON request headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch<{ ok: boolean }>("/health", { method: "POST", body: JSON.stringify({ ping: true }) })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/health",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("preserves structured backend errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "not_ready", message: "No approved model." } }, { status: 409 })),);

    const result = apiFetch("/predictions");
    await expect(result).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      code: "not_ready",
      message: "No approved model.",
    });
  });

  it("maps aborts and network failures to actionable API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    await expect(apiFetch("/slow")).rejects.toMatchObject({ status: 408, code: "timeout" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(apiFetch("/offline")).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it("returns undefined for an empty successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiFetch<void>("/empty")).resolves.toBeUndefined();
  });

  it("downloads the response using a safe server filename", async () => {
    const click = vi.fn();
    const appendChild = vi.fn();
    const remove = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("id,name\n1,APS", {
      headers: { "content-disposition": 'attachment; filename="history export.csv"' },
    })));
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:history"), revokeObjectURL: vi.fn() });
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue({ click, remove, href: "", download: "" }),
      body: { appendChild },
    });

    await expect(apiDownload("/exports/history.csv", "fallback.csv")).resolves.toBeUndefined();
    expect(appendChild).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });

  it("returns structured errors for failed downloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "missing", message: "Export unavailable." } }, { status: 404 })));
    await expect(apiDownload("/exports/missing.csv", "fallback.csv")).rejects.toMatchObject({ status: 404, code: "missing" });
  });
});

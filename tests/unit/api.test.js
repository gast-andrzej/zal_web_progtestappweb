import { afterEach, describe, expect, it, vi } from "vitest";

import { api, errorMessage } from "../../frontend/src/api.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe("frontend API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a CSRF token before posting credentials and reloads it after login", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf-before-login" }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true, user: { username: "test" } }))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf-after-login" }));
    vi.stubGlobal("fetch", fetch);

    await expect(api.session()).resolves.toEqual({ authenticated: false });

    const login = await api.login("test", "safe-password");
    expect(login.authenticated).toBe(true);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/session/",
      expect.anything(),
    );
    const [loginPath, loginOptions] = fetch.mock.calls[2];
    expect(loginPath).toBe("/api/session/");
    expect(loginOptions.method).toBe("POST");
    expect(loginOptions.credentials).toBe("same-origin");
    expect(loginOptions.headers.get("X-CSRFToken")).toBe("csrf-before-login");
    expect(loginOptions.body).toBe(JSON.stringify({ username: "test", password: "safe-password" }));
  });

  it("includes CSRF on writes and presents server validation errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf-token" }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ errors: { email: [{ message: "Podaj poprawny adres e-mail." }] } }, 400));
    vi.stubGlobal("fetch", fetch);
    await api.session();

    try {
      await api.createClient({ name: "Test", email: "niepoprawny" });
      throw new Error("Expected API request to reject");
    } catch (error) {
      expect(errorMessage(error)).toBe("Podaj poprawny adres e-mail.");
      expect(error.status).toBe(400);
    }
    expect(fetch.mock.calls[2][1].headers.get("X-CSRFToken")).toBe("csrf-token");
  });

  it("routes all read and write operations to the document API", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf-token" }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ client: { id: 1 } }, 201))
      .mockResolvedValueOnce(jsonResponse({ template: { id: 2 } }, 201))
      .mockResolvedValueOnce(jsonResponse({ document: { id: 3 } }, 201));
    vi.stubGlobal("fetch", fetch);
    await api.session();

    await expect(api.createClient({ name: "Klient" })).resolves.toEqual({ client: { id: 1 } });
    await expect(api.createTemplate({ name: "Szablon" })).resolves.toEqual({ template: { id: 2 } });
    await expect(api.generateDocument({ title: "Umowa" })).resolves.toEqual({ document: { id: 3 } });

    expect(fetch.mock.calls.slice(2).map(([path]) => path)).toEqual([
      "/api/clients/",
      "/api/templates/",
      "/api/documents/",
    ]);
    for (const [, options] of fetch.mock.calls.slice(2)) {
      expect(options.method).toBe("POST");
      expect(options.headers.get("X-CSRFToken")).toBe("csrf-token");
    }
  });

  it("loads dashboard and list endpoints and refreshes CSRF after logout", async () => {
    const noContent = { ok: true, status: 204, json: vi.fn() };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "before-logout" }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ dashboard: true }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(noContent)
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "after-logout" }));
    vi.stubGlobal("fetch", fetch);
    await api.session();

    await expect(api.dashboard()).resolves.toEqual({ dashboard: true });
    await expect(api.clients()).resolves.toEqual({ results: [] });
    await expect(api.templates()).resolves.toEqual({ results: [] });
    await expect(api.documents()).resolves.toEqual({ results: [] });
    await expect(api.logout()).resolves.toBeNull();

    expect(noContent.json).not.toHaveBeenCalled();
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/csrf/",
      "/api/session/",
      "/api/dashboard/",
      "/api/clients/",
      "/api/templates/",
      "/api/documents/",
      "/api/session/logout/",
      "/api/csrf/",
    ]);
    expect(fetch.mock.calls[6][1].headers.get("X-CSRFToken")).toBe("before-logout");
  });

  it("preserves server error details and status", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "Odmowa dostępu." }, 401));
    vi.stubGlobal("fetch", fetch);

    try {
      await api.dashboard();
      throw new Error("Expected API request to reject");
    } catch (error) {
      expect(error.message).toBe("Odmowa dostępu.");
      expect(error.status).toBe(401);
      expect(error.errors).toBeNull();
    }
  });

  it("returns a useful message for API and network errors", () => {
    expect(errorMessage(new Error("Brak połączenia"))).toBe("Brak połączenia");
    expect(errorMessage(null)).toBe("Wystąpił nieoczekiwany błąd.");
    expect(errorMessage({ errors: { first: [{ message: "Pierwszy błąd" }], second: [{ message: "Drugi błąd" }] } }))
      .toBe("Pierwszy błąd Drugi błąd");
  });
});

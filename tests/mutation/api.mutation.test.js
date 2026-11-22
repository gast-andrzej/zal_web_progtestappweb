import { afterEach, describe, expect, it, vi } from "vitest";

import { api, errorMessage, loadCsrfToken } from "../../frontend/src/api.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

const operations = [
  { name: "dashboard omits CSRF and JSON content headers from reads", method: "dashboard", path: "/api/dashboard/", payload: {}, primeCsrf: true },
  { name: "login posts credentials and refreshes CSRF", method: "login", path: "/api/session/", body: { username: "tester", password: "test-password" }, payload: { authenticated: true, user: { username: "tester" } }, login: true },
  { name: "client list returns no records", method: "clients", path: "/api/clients/", payload: { results: [] }, primeCsrf: true },
  { name: "client list returns client records", method: "clients", path: "/api/clients/", payload: { results: [{ id: 1, name: "Klient" }] }, primeCsrf: true },
  { name: "template list returns no records", method: "templates", path: "/api/templates/", payload: { results: [] }, primeCsrf: true },
  { name: "template list returns agreement templates", method: "templates", path: "/api/templates/", payload: { results: [{ document_type: "agreement" }] }, primeCsrf: true },
  { name: "document list returns no records", method: "documents", path: "/api/documents/", payload: { results: [] }, primeCsrf: true },
  { name: "document list returns generated documents", method: "documents", path: "/api/documents/", payload: { results: [{ id: 3, title: "Oferta" }] }, primeCsrf: true },
  { name: "CSRF token is loaded from the API", method: "csrf", path: "/api/csrf/", payload: { csrfToken: "csrf-unit-token" }, expected: "csrf-unit-token" },
  { name: "session returns anonymous state", method: "session", path: "/api/session/", payload: { authenticated: false }, csrf: true },
  { name: "session returns authenticated user", method: "session", path: "/api/session/", payload: { authenticated: true, user: { username: "tester" } }, csrf: true },
  { name: "client creation sends a name", method: "createClient", path: "/api/clients/", body: { name: "Nowy klient" }, payload: { client: { id: 1 } }, write: true },
  { name: "client creation sends optional contact fields", method: "createClient", path: "/api/clients/", body: { name: "Kontakt", email: "kontakt@example.com", phone: "123456789" }, payload: { client: { id: 2 } }, write: true },
  { name: "client creation preserves Polish characters", method: "createClient", path: "/api/clients/", body: { name: "Zażółć gęślą jaźń" }, payload: { client: { id: 3 } }, write: true },
  { name: "agreement template creation uses POST", method: "createTemplate", path: "/api/templates/", body: { name: "Umowa", document_type: "agreement" }, payload: { template: { id: 1 } }, write: true },
  { name: "offer template creation uses POST", method: "createTemplate", path: "/api/templates/", body: { name: "Oferta", document_type: "offer" }, payload: { template: { id: 2 } }, write: true },
  { name: "invoice template creation uses POST", method: "createTemplate", path: "/api/templates/", body: { name: "Faktura", document_type: "invoice" }, payload: { template: { id: 3 } }, write: true },
  { name: "template creation preserves custom placeholders", method: "createTemplate", path: "/api/templates/", body: { content: "{{ kwota }}" }, payload: { template: { fields: ["kwota"] } }, write: true },
  { name: "document generation sends its title", method: "generateDocument", path: "/api/documents/", body: { title: "Umowa" }, payload: { document: { id: 1 } }, write: true },
  { name: "document generation sends selected client and template", method: "generateDocument", path: "/api/documents/", body: { client: 2, template: 3, title: "Umowa klienta" }, payload: { document: { id: 2 } }, write: true },
  { name: "document generation preserves custom values", method: "generateDocument", path: "/api/documents/", body: { title: "Faktura", kwota: "1 000 zł" }, payload: { document: { content: "1 000 zł" } }, write: true },
  { name: "document generation supports Unicode content", method: "generateDocument", path: "/api/documents/", body: { title: "Zażółć" }, payload: { document: { title: "Zażółć" } }, write: true },
  { name: "logout handles an empty response and refreshes CSRF", method: "logout", path: "/api/session/logout/", payload: null, logout: true, noContent: true, expected: null },
];

describe("mutation checks for the frontend API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(operations)("$name", async ({ method, path, body, payload, write, csrf, primeCsrf, login, logout, noContent, expected }) => {
    const responses = [];
    let noContentResponse;
    if (login) {
      responses.push(jsonResponse({ csrfToken: "csrf-test-token" }));
      responses.push(jsonResponse({ authenticated: false }));
      responses.push(jsonResponse(payload));
      responses.push(jsonResponse({ csrfToken: "csrf-after-login" }));
    } else if (csrf || primeCsrf || write || logout) {
      responses.push(jsonResponse({ csrfToken: "csrf-test-token" }));
      if (logout) {
        responses.push(jsonResponse({ authenticated: true }));
        noContentResponse = noContent
          ? { ok: true, status: 204, json: vi.fn() }
          : jsonResponse(payload);
        responses.push(noContentResponse);
        responses.push(jsonResponse({ csrfToken: "csrf-after-logout" }));
      } else if (write) {
        responses.push(jsonResponse(payload, 201));
      } else if (csrf || primeCsrf) {
        responses.push(jsonResponse(payload));
      }
    } else {
      responses.push(jsonResponse(payload));
    }

    const fetch = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()));
    vi.stubGlobal("fetch", fetch);

    let result;
    if (method === "csrf") {
      result = await loadCsrfToken();
    } else if (method === "session") {
      result = await api.session();
    } else {
      if (logout || login) await api.session();
      else if (write || primeCsrf) await loadCsrfToken();
      if (login) result = await api.login(body.username, body.password);
      else if (body === undefined) result = await api[method]();
      else result = await api[method](body);
    }

    expect(result).toEqual(expected === undefined ? payload : expected);
    const targetCall = fetch.mock.calls.filter(([requestedPath]) => requestedPath === path).at(-1);
    expect(targetCall).toBeDefined();
    expect(targetCall[1].credentials).toBe("same-origin");
    if (write || logout || login) {
      expect(targetCall[1].method).toBe("POST");
      expect(targetCall[1].headers.get("X-CSRFToken")).toBe("csrf-test-token");
    } else {
      expect(targetCall[1].method).toBe("GET");
      expect(targetCall[1].headers.has("X-CSRFToken")).toBe(false);
    }
    if (body !== undefined) {
      expect(targetCall[1].body).toBe(JSON.stringify(body));
      expect(targetCall[1].headers.get("Content-Type")).toBe("application/json");
    } else {
      expect(targetCall[1].body).toBeUndefined();
      expect(targetCall[1].headers.has("Content-Type")).toBe(false);
    }
    if (noContent) expect(noContentResponse.json).not.toHaveBeenCalled();
  });

  it("preserves the HTTP status on API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Odmowa" }, 401)));
    await expect(api.dashboard()).rejects.toMatchObject({ message: "Odmowa", status: 401 });
  });

  it("preserves field errors returned by the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ errors: { email: [{ message: "Niepoprawny e-mail" }] } }, 400),
    ));
    await expect(api.clients()).rejects.toMatchObject({
      status: 400,
      errors: { email: [{ message: "Niepoprawny e-mail" }] },
    });
  });

  it("uses the fallback message when the server omits error details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(api.dashboard()).rejects.toMatchObject({
      message: "Wystąpił błąd podczas komunikacji z serwerem.",
    });
  });

  it("rejects when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network offline")));
    await expect(api.dashboard()).rejects.toThrow("Network offline");
  });

  it("uses the fallback message when an error response contains null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, 500)));
    await expect(api.dashboard()).rejects.toMatchObject({
      message: "Wystąpił błąd podczas komunikacji z serwerem.",
      errors: null,
    });
    expect(errorMessage(new Error("Błąd sieci"))).toBe("Błąd sieci");
    expect(errorMessage(null)).toBe("Wystąpił nieoczekiwany błąd.");
  });

  it("does not send an empty CSRF header before a token is loaded", async () => {
    vi.resetModules();
    const { api: freshApi } = await import("../../frontend/src/api.js");
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ client: { id: 1 } }, 201));
    vi.stubGlobal("fetch", fetch);
    await freshApi.createClient({ name: "Klient" });
    const [, options] = fetch.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.headers.has("X-CSRFToken")).toBe(false);
  });

  it("formats multiple validation messages in field order", () => {
    expect(errorMessage({
      errors: {
        name: [{ message: "Brak nazwy" }],
        email: [{ message: "Niepoprawny e-mail" }],
      },
    })).toBe("Brak nazwy Niepoprawny e-mail");
  });
});

let csrfToken = "";

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (options.method && options.method !== "GET" && csrfToken) {
    headers.set("X-CSRFToken", csrfToken);
  }

  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers,
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(payload?.detail || "Wystąpił błąd podczas komunikacji z serwerem.");
    error.status = response.status;
    error.errors = payload?.errors || null;
    throw error;
  }
  return payload;
}

export async function loadCsrfToken() {
  const payload = await request("/api/csrf/", { method: "GET" });
  csrfToken = payload.csrfToken;
  return csrfToken;
}

export const api = {
  async session() {
    await loadCsrfToken();
    return request("/api/session/", { method: "GET" });
  },
  login(username, password) {
    return request("/api/session/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }).then(async (session) => {
      await loadCsrfToken();
      return session;
    });
  },
  async logout() {
    const result = await request("/api/session/logout/", { method: "POST" });
    await loadCsrfToken();
    return result;
  },
  dashboard: () => request("/api/dashboard/", { method: "GET" }),
  clients: () => request("/api/clients/", { method: "GET" }),
  createClient: (data) =>
    request("/api/clients/", { method: "POST", body: JSON.stringify(data) }),
  templates: () => request("/api/templates/", { method: "GET" }),
  createTemplate: (data) =>
    request("/api/templates/", { method: "POST", body: JSON.stringify(data) }),
  documents: () => request("/api/documents/", { method: "GET" }),
  generateDocument: (data) =>
    request("/api/documents/", { method: "POST", body: JSON.stringify(data) }),
};

export function errorMessage(error) {
  if (error?.errors) {
    return Object.values(error.errors)
      .flat()
      .map((entry) => entry.message)
      .join(" ");
  }
  return error?.message || "Wystąpił nieoczekiwany błąd.";
}

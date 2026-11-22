import { createRequire } from "node:module";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { expect, test } = require("@playwright/test");

async function openLogin(page) {
  await page.goto("/");
}

async function requestApi(page, path, { method = "GET", body, rawBody, csrf = false } = {}) {
  return page.evaluate(async ({ path, method, body, rawBody, csrf }) => {
    const headers = {};
    if (body !== undefined || rawBody !== undefined) headers["Content-Type"] = "application/json";
    if (csrf) {
      const csrfResponse = await fetch("/api/csrf/");
      headers["X-CSRFToken"] = (await csrfResponse.json()).csrfToken;
    }
    const response = await fetch(path, {
      method,
      headers,
      body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, payload: await response.json() };
  }, { path, method, body, rawBody, csrf });
}

test("login page shows the company documents heading", async ({ page }) => {
  await openLogin(page);
  await expect(page.getByRole("heading", { name: /Dokumenty Firmowe/i })).toBeVisible();
});

test("login page explains the purpose of authentication", async ({ page }) => {
  await openLogin(page);
  await expect(page.getByText("Zaloguj się, aby zarządzać dokumentami i klientami.")).toBeVisible();
});

test("login page labels the username field", async ({ page }) => {
  await openLogin(page);
  await expect(page.getByLabel("Nazwa użytkownika")).toBeVisible();
});

test("login page labels the password field", async ({ page }) => {
  await openLogin(page);
  await expect(page.getByLabel("Hasło")).toBeVisible();
});

test("password input masks the entered value", async ({ page }) => {
  await openLogin(page);
  await expect(page.getByLabel("Hasło")).toHaveAttribute("type", "password");
});

test("credentials fields have browser autocomplete hints", async ({ page }) => {
  await openLogin(page);
  await expect(page.getByLabel("Nazwa użytkownika")).toHaveAttribute("autocomplete", "username");
  await expect(page.getByLabel("Hasło")).toHaveAttribute("autocomplete", "current-password");
});

test("username is a required field", async ({ page }) => {
  await openLogin(page);
  await expect(page.getByLabel("Nazwa użytkownika")).toHaveAttribute("required", "");
});

test("password is a required field", async ({ page }) => {
  await openLogin(page);
  await expect(page.getByLabel("Hasło")).toHaveAttribute("required", "");
});

test("login action is available before submitting", async ({ page }) => {
  await openLogin(page);
  await expect(page.getByRole("button", { name: "Zaloguj się" })).toBeEnabled();
});

test("anonymous users do not see the authenticated navigation", async ({ page }) => {
  await openLogin(page);
  await expect(page.getByRole("navigation", { name: "Nawigacja główna" })).toHaveCount(0);
});

test("CSRF endpoint returns a usable token", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/csrf/");
  expect(result.status).toBe(200);
  expect(result.payload.csrfToken).toBeTruthy();
});

test("session endpoint reports an anonymous visitor", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/session/");
  expect(result.status).toBe(200);
  expect(result.payload.authenticated).toBe(false);
});

test("dashboard API requires authentication", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/dashboard/");
  expect(result.status).toBe(401);
  expect(result.payload.detail).toContain("Zaloguj się");
});

test("clients API requires authentication", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/clients/");
  expect(result.status).toBe(401);
  expect(result.payload.detail).toContain("Zaloguj się");
});

test("templates API requires authentication", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/templates/");
  expect(result.status).toBe(401);
  expect(result.payload.detail).toContain("Zaloguj się");
});

test("documents API requires authentication", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/documents/");
  expect(result.status).toBe(401);
  expect(result.payload.detail).toContain("Zaloguj się");
});

test("logout API requires an authenticated session", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/session/logout/", { method: "POST", csrf: true });
  expect(result.status).toBe(401);
});

test("login API rejects a request without a CSRF header", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/session/", {
    method: "POST",
    body: { username: "tester", password: "incorrect-password" },
  });
  expect(result.status).toBe(403);
  expect(result.payload.detail).toContain("Sesja formularza wygasła");
});

test("login API rejects malformed JSON", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/session/", {
    method: "POST",
    rawBody: "{",
    csrf: true,
  });
  expect(result.status).toBe(400);
  expect(result.payload.detail).toBe("Nieprawidłowy format JSON.");
});

test("login API rejects a JSON array", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/session/", {
    method: "POST",
    body: ["tester", "password"],
    csrf: true,
  });
  expect(result.status).toBe(400);
  expect(result.payload.detail).toBe("Żądanie musi zawierać obiekt JSON.");
});

test("login API requires a username", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/session/", {
    method: "POST",
    body: { password: "password" },
    csrf: true,
  });
  expect(result.status).toBe(400);
  expect(result.payload.detail).toBe("Podaj nazwę użytkownika i hasło.");
});

test("login API requires a password", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/session/", {
    method: "POST",
    body: { username: "tester" },
    csrf: true,
  });
  expect(result.status).toBe(400);
  expect(result.payload.detail).toBe("Podaj nazwę użytkownika i hasło.");
});

test("login API rejects non-string credentials", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/session/", {
    method: "POST",
    body: { username: 42, password: "password" },
    csrf: true,
  });
  expect(result.status).toBe(400);
  expect(result.payload.detail).toBe("Podaj nazwę użytkownika i hasło.");
});

test("login API rejects an unknown account", async ({ page }) => {
  await openLogin(page);
  const result = await requestApi(page, "/api/session/", {
    method: "POST",
    body: { username: "e2e-unknown-account", password: "incorrect-password" },
    csrf: true,
  });
  expect(result.status).toBe(400);
  expect(result.payload.detail).toBe("Nieprawidłowa nazwa użytkownika lub hasło.");
});

test("login UI displays a clear error for invalid credentials", async ({ page }) => {
  await openLogin(page);
  await page.getByLabel("Nazwa użytkownika").fill("nieistniejacy-uzytkownik");
  await page.getByLabel("Hasło").fill("nieprawidlowe-haslo");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("alert")).toContainText("Nieprawidłowa nazwa użytkownika lub hasło.");
});

test("failed login keeps the user on the login screen", async ({ page }) => {
  await openLogin(page);
  await page.getByLabel("Nazwa użytkownika").fill("nieistniejacy-uzytkownik");
  await page.getByLabel("Hasło").fill("nieprawidlowe-haslo");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByLabel("Nazwa użytkownika")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zaloguj się" })).toBeVisible();
});

test("failed login preserves the entered username", async ({ page }) => {
  await openLogin(page);
  await page.getByLabel("Nazwa użytkownika").fill("tester-e2e");
  await page.getByLabel("Hasło").fill("wrong-password");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByLabel("Nazwa użytkownika")).toHaveValue("tester-e2e");
});

test("failed login preserves the entered password", async ({ page }) => {
  await openLogin(page);
  await page.getByLabel("Nazwa użytkownika").fill("tester-e2e");
  await page.getByLabel("Hasło").fill("wrong-password");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByLabel("Hasło")).toHaveValue("wrong-password");
});

test("failed login does not authenticate the browser session", async ({ page }) => {
  await openLogin(page);
  await page.getByLabel("Nazwa użytkownika").fill("tester-e2e");
  await page.getByLabel("Hasło").fill("wrong-password");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  const result = await requestApi(page, "/api/session/");
  expect(result.payload.authenticated).toBe(false);
});

test("reloading the page keeps an anonymous user on the login screen", async ({ page }) => {
  await openLogin(page);
  await page.reload();
  await expect(page.getByLabel("Nazwa użytkownika")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Dokumenty Firmowe/i })).toBeVisible();
});

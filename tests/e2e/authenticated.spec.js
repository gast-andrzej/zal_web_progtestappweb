import { createRequire } from "node:module";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { expect, test } = require("@playwright/test");

async function login(page) {
  await page.goto("/");
  await page.getByLabel("Nazwa użytkownika").fill("e2e-admin");
  await page.getByLabel("Hasło").fill("E2e-Test-123!");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("navigation", { name: "Nawigacja główna" })).toBeVisible();
}

test("authenticated login opens the dashboard", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: /Dzień dobry, e2e-admin/i })).toBeVisible();
  await expect(page.getByText("Wygenerowane dokumenty")).toBeVisible();
});

test("main navigation opens the clients page", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "Nawigacja główna" }).getByRole("button", { name: "Klienci" }).click();
  await expect(page.getByRole("heading", { name: "Klienci" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dodaj klienta" })).toBeVisible();
});

test("a client can be created through the UI", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "Nawigacja główna" }).getByRole("button", { name: "Klienci" }).click();
  await page.getByLabel("Nazwa / imię i nazwisko").fill("E2E Firma Dodana");
  await page.getByLabel("Adres").fill("ul. E2E 12");
  await page.getByLabel("NIP").fill("1112223334");
  await page.getByLabel("E-mail").fill("e2e-added@example.com");
  await page.getByLabel("Telefon").fill("123456789");
  await page.getByRole("button", { name: "Zapisz klienta" }).click();
  await expect(page.getByText("Klient został zapisany.", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Firma Dodana" }).first()).toBeVisible();
});

test("created client details are shown in the table", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "Nawigacja główna" }).getByRole("button", { name: "Klienci" }).click();
  await page.getByLabel("Nazwa / imię i nazwisko").fill("E2E Firma Szczegoly");
  await page.getByLabel("NIP").fill("5556667778");
  await page.getByLabel("E-mail").fill("szczegoly@example.com");
  await page.getByRole("button", { name: "Zapisz klienta" }).click();
  await expect(page.getByRole("cell", { name: "5556667778" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "szczegoly@example.com" }).first()).toBeVisible();
});

test("templates page is accessible from navigation", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "Nawigacja główna" }).getByRole("button", { name: "Szablony" }).click();
  await expect(page.getByRole("heading", { name: "Utwórz szablon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dostępne szablony" })).toBeVisible();
});

test("a template can be created through the UI", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "Nawigacja główna" }).getByRole("button", { name: "Szablony" }).click();
  await page.getByLabel("Nazwa szablonu").fill("Szablon E2E");
  await page.getByLabel("Rodzaj dokumentu").selectOption("offer");
  await page.getByLabel("Treść").fill("Oferta dla {{ client_name }} na okres {{ okres }}.");
  await page.getByRole("button", { name: "Zapisz szablon" }).click();
  await expect(page.getByText("Szablon został zapisany.", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Szablon E2E" }).first()).toBeVisible();
});

test("created template is marked as active", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "Nawigacja główna" }).getByRole("button", { name: "Szablony" }).click();
  await page.getByLabel("Nazwa szablonu").fill("Aktywny szablon E2E");
  await page.getByLabel("Rodzaj dokumentu").selectOption("agreement");
  await page.getByLabel("Treść").fill("Umowa na {{ okres }}.");
  await page.getByLabel("Szablon aktywny").check();
  await page.getByRole("button", { name: "Zapisz szablon" }).click();
  const row = page.getByRole("row").filter({ hasText: "Aktywny szablon E2E" }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText("Aktywny", { exact: true }).first()).toBeVisible();
});

test("document generation page shows template and client fields", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "Nawigacja główna" }).getByRole("button", { name: "Generuj dokument" }).click();
  await expect(page.getByLabel("Szablon")).toBeVisible();
  await expect(page.getByLabel("Klient")).toBeVisible();
  await expect(page.getByLabel("Tytuł dokumentu")).toBeVisible();
});

test("documents archive is accessible after login", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "Nawigacja główna" }).getByRole("button", { name: "Dokumenty" }).click();
  await expect(page.getByRole("heading", { name: "Wygenerowane dokumenty" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wszystkie wygenerowane dokumenty" })).toBeVisible();
});

test("logout returns the browser to the login screen", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page.getByLabel("Nazwa użytkownika")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Dokumenty Firmowe/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Nawigacja główna" })).toHaveCount(0);
});

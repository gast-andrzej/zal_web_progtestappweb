import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../../frontend/src/App.vue";
import { api } from "../../frontend/src/api.js";

vi.mock("../../frontend/src/api.js", () => ({
  api: {
    session: vi.fn(),
    login: vi.fn(),
    dashboard: vi.fn(),
    clients: vi.fn(),
    templates: vi.fn(),
    documents: vi.fn(),
    createClient: vi.fn(),
    createTemplate: vi.fn(),
    generateDocument: vi.fn(),
    logout: vi.fn(),
  },
  errorMessage: (error) => error?.message || "Błąd",
}));

const wrappers = [];

async function mountAuthenticatedApp(overrides = {}) {
  api.session.mockResolvedValue({
    authenticated: true,
    user: { id: 1, username: "dawid", name: "Dawid Testowy" },
  });
  api.dashboard.mockResolvedValue(overrides.dashboard || {
    document_count: 0,
    client_count: (overrides.clients || []).length,
    template_count: (overrides.templates || []).length,
    recent_documents: [],
  });
  api.clients.mockResolvedValue({ results: overrides.clients || [] });
  api.templates.mockResolvedValue({ results: overrides.templates || [] });
  api.documents.mockResolvedValue({ results: overrides.documents || [] });
  api.createClient.mockResolvedValue({ client: { id: 1, name: "Klient" } });
  api.createTemplate.mockResolvedValue({ template: { id: 1, name: "Szablon" } });
  api.generateDocument.mockResolvedValue({
    document: { document_number: "DOK/20261122/UNIT01" },
  });
  api.logout.mockResolvedValue({ authenticated: false });

  const wrapper = mount(App);
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("Dawid - 10 testów jednostkowych Vue", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount(); });

  it("1. wyświetla ekran uruchamiania podczas pobierania sesji", () => {
    api.session.mockReturnValue(new Promise(() => {}));
    const wrapper = mount(App);
    wrappers.push(wrapper);
    expect(wrapper.get('[role="status"]').text()).toContain("Uruchamiam panel");
  });

  it("2. pokazuje dane zalogowanego użytkownika po starcie", async () => {
    const wrapper = await mountAuthenticatedApp();
    expect(wrapper.text()).toContain("Dawid Testowy");
    expect(api.dashboard).toHaveBeenCalledOnce();
  });

  it("3. przechodzi do strony klientów z menu", async () => {
    const wrapper = await mountAuthenticatedApp();
    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Dane klientów dostępne podczas generowania dokumentów");
  });

  it("4. obsługuje błąd nawigacji i pokazuje alert", async () => {
    const wrapper = await mountAuthenticatedApp();
    api.clients.mockRejectedValueOnce(new Error("Klienci niedostępni"));
    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Klienci niedostępni");
  });

  it("5. resetuje pola formularza klienta po zapisaniu", async () => {
    const wrapper = await mountAuthenticatedApp();
    let submittedClient;
    api.createClient.mockImplementation((data) => {
      submittedClient = { ...data };
      return Promise.resolve({ client: { id: 1, name: "Firma Testowa" } });
    });
    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await wrapper.get("#client-name").setValue("Firma Testowa");
    await wrapper.get("#client-email").setValue("firma@example.com");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(submittedClient).toMatchObject({
      name: "Firma Testowa",
      email: "firma@example.com",
    });
    expect(wrapper.get("#client-name").element.value).toBe("");
  });

  it("6. wyświetla komunikat o sukcesie tworzenia szablonu", async () => {
    const wrapper = await mountAuthenticatedApp();
    await wrapper.get(".main-nav").findAll("button")[3].trigger("click");
    await wrapper.get("#template-name").setValue("Faktura testowa");
    await wrapper.get("#template-content").setValue("Faktura dla {{ klient }}");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Szablon został zapisany.");
  });

  it("7. ukrywa nieaktywny szablon na liście generowania", async () => {
    const templates = [
      { id: 1, name: "Aktywna", document_type: "agreement", is_active: true, fields: [] },
      { id: 2, name: "Nieaktywna", document_type: "offer", is_active: false, fields: [] },
    ];
    const wrapper = await mountAuthenticatedApp({
      clients: [{ id: 1, name: "Klient" }],
      templates,
    });
    await wrapper.get(".main-nav").findAll("button")[4].trigger("click");
    await flushPromises();
    expect(wrapper.get("#document-template").text()).toContain("Aktywna");
    expect(wrapper.get("#document-template").text()).not.toContain("Nieaktywna");
  });

  it("8. tworzy sugerowany tytuł z nazwy szablonu", async () => {
    const template = { id: 7, name: "Umowa najmu", document_type: "agreement", is_active: true, fields: ["okres"] };
    const wrapper = await mountAuthenticatedApp({
      clients: [{ id: 1, name: "Klient" }],
      templates: [template],
    });
    await wrapper.get(".main-nav").findAll("button")[4].trigger("click");
    await wrapper.get("#document-template").setValue("7");
    expect(wrapper.get("#document-title").element.value).toBe("Umowa najmu");
  });

  it("9. przekazuje dane formularza generowania do API", async () => {
    const template = { id: 3, name: "Faktura", document_type: "invoice", is_active: true, fields: ["kwota"] };
    const wrapper = await mountAuthenticatedApp({
      clients: [{ id: 2, name: "Klient Fakturowy" }],
      templates: [template],
    });
    await wrapper.get(".main-nav").findAll("button")[4].trigger("click");
    await wrapper.get("#document-template").setValue("3");
    await wrapper.get("#document-client").setValue("2");
    await wrapper.get("#document-title").setValue("Faktura miesięczna");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(api.generateDocument).toHaveBeenCalledWith(expect.objectContaining({
      template: "3",
      client: 2,
      title: "Faktura miesięczna",
    }));
  });

  it("10. wylogowuje użytkownika i wraca do formularza logowania", async () => {
    const wrapper = await mountAuthenticatedApp();
    await wrapper.get(".account-area button").trigger("click");
    await flushPromises();
    expect(api.logout).toHaveBeenCalledOnce();
    expect(wrapper.get("#login-username").exists()).toBe(true);
  });
});

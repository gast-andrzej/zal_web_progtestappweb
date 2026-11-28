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
    user: { id: 2, username: "ola", name: "Ola Testowa" },
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
    document: { document_number: "DOK/20261128/OLA01" },
  });
  api.logout.mockResolvedValue({ authenticated: false });

  const wrapper = mount(App);
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("Ola - 10 testów jednostkowych Vue", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount(); });

  it("1. wysyła login i hasło podczas logowania użytkownika", async () => {
    api.session.mockResolvedValue({ authenticated: false });
    api.login.mockResolvedValue({
      authenticated: true,
      user: { id: 2, username: "ola", name: "Ola Testowa" },
    });
    api.dashboard.mockResolvedValue({
      document_count: 0,
      client_count: 0,
      template_count: 0,
      recent_documents: [],
    });

    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();

    await wrapper.get("#login-username").setValue("ola");
    await wrapper.get("#login-password").setValue("haslo123");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(api.login).toHaveBeenCalledWith("ola", "haslo123");
    expect(wrapper.text()).toContain("Ola Testowa");
  });

  it("2. wyświetla komunikat błędu przy nieudanym logowaniu", async () => {
    api.session.mockResolvedValue({ authenticated: false });
    api.login.mockRejectedValueOnce(new Error("Nieprawidłowy login lub hasło"));

    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();

    await wrapper.get("#login-username").setValue("ola");
    await wrapper.get("#login-password").setValue("zlehaslo");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Nieprawidłowy login lub hasło");
  });

  it("3. wyświetla liczniki klientów i szablonów na pulpicie", async () => {
    const wrapper = await mountAuthenticatedApp({
      dashboard: {
        document_count: 5,
        client_count: 12,
        template_count: 4,
        recent_documents: [],
      },
    });

    expect(wrapper.text()).toContain("12");
    expect(wrapper.text()).toContain("4");
  });

  it("4. wyświetla komunikat gdy na pulpicie nie ma ostatnich dokumentów", async () => {
    const wrapper = await mountAuthenticatedApp();
    expect(wrapper.text()).toContain("Archiwum jest puste");
  });

  it("5. wyświetla NIP i telefon klienta na liście klientów", async () => {
    const wrapper = await mountAuthenticatedApp({
      clients: [
        {
          id: 10,
          name: "Studio Projektowe Ola",
          address: "ul. Długa 5, Gdańsk",
          tax_id: "5831234567",
          email: "kontakt@studio.pl",
          phone: "500600700",
        },
      ],
    });

    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("5831234567");
    expect(wrapper.text()).toContain("500600700");
  });

  it("6. zapisuje klienta wraz z adresem, NIP-em i telefonem", async () => {
    const wrapper = await mountAuthenticatedApp();
    let sentData;
    api.createClient.mockImplementation((data) => {
      sentData = { ...data };
      return Promise.resolve({ client: { id: 11, ...data } });
    });

    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await wrapper.get("#client-name").setValue("Alfa Sp. z o.o.");
    await wrapper.get("#client-address").setValue("ul. Morska 10");
    await wrapper.get("#client-tax").setValue("1234567890");
    await wrapper.get("#client-email").setValue("biuro@alfa.pl");
    await wrapper.get("#client-phone").setValue("600700800");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(sentData).toMatchObject({
      name: "Alfa Sp. z o.o.",
      address: "ul. Morska 10",
      tax_id: "1234567890",
      email: "biuro@alfa.pl",
      phone: "600700800",
    });
  });

  it("7. wyświetla etykietę typu szablonu na liście szablonów", async () => {
    const wrapper = await mountAuthenticatedApp({
      templates: [
        {
          id: 5,
          name: "Protokół odbioru",
          document_type: "protocol",
          document_type_label: "Protokół",
          is_active: true,
          fields: [],
        },
      ],
    });

    await wrapper.get(".main-nav").findAll("button")[3].trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Protokół odbioru");
    expect(wrapper.text()).toContain("Protokół");
  });

  it("8. pokazuje błąd gdy nie uda się pobrać listy szablonów", async () => {
    const wrapper = await mountAuthenticatedApp();
    api.templates.mockRejectedValueOnce(new Error("Nie udało się pobrać szablonów"));

    await wrapper.get(".main-nav").findAll("button")[3].trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Nie udało się pobrać szablonów");
  });

  it("9. pozwala wybrać inny typ dokumentu w formularzu szablonu", async () => {
    const wrapper = await mountAuthenticatedApp();
    let submittedTemplate;
    api.createTemplate.mockImplementation((data) => {
      submittedTemplate = { ...data };
      return Promise.resolve({ template: { id: 9, ...data } });
    });

    await wrapper.get(".main-nav").findAll("button")[3].trigger("click");
    await wrapper.get("#template-name").setValue("Oferta handlowa");
    await wrapper.get("#template-type").setValue("offer");
    await wrapper.get("#template-content").setValue("Treść oferty");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(submittedTemplate).toMatchObject({
      name: "Oferta handlowa",
      document_type: "offer",
      content: "Treść oferty",
    });
  });

  it("10. pokazuje błąd gdy nie uda się pobrać archiwum dokumentów", async () => {
    const wrapper = await mountAuthenticatedApp();
    api.documents.mockRejectedValueOnce(new Error("Błąd ładowania archiwum"));

    await wrapper.get(".main-nav").findAll("button")[1].trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Błąd ładowania archiwum");
  });
});
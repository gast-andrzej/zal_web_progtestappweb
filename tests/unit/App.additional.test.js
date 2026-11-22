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
const testClient = { id: 1, name: "Klient testowy", email: "klient@example.com" };
const testTemplate = {
  id: 1,
  name: "Umowa testowa",
  document_type: "agreement",
  document_type_label: "Umowa",
  is_active: true,
  fields: ["client_name", "kwota"],
};

async function mountAuthenticatedApp({ clients = [], templates = [], documents = [], dashboard } = {}) {
  api.session.mockResolvedValue({
    authenticated: true,
    user: { id: 1, username: "tester", name: "Test User" },
  });
  api.dashboard.mockResolvedValue(dashboard || {
    document_count: 2,
    client_count: clients.length,
    template_count: templates.filter((template) => template.is_active).length,
    recent_documents: [],
  });
  api.clients.mockResolvedValue({ results: clients });
  api.templates.mockResolvedValue({ results: templates });
  api.documents.mockResolvedValue({ results: documents });
  api.createClient.mockResolvedValue({ client: testClient });
  api.createTemplate.mockResolvedValue({ template: testTemplate });
  api.generateDocument.mockResolvedValue({
    document: { document_number: "DOK/20261017/TEST0001" },
  });
  api.logout.mockResolvedValue({ authenticated: false });

  const wrapper = mount(App);
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("Vue document app additional unit cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  });

  it("displays the dashboard document total", async () => {
    const wrapper = await mountAuthenticatedApp();
    expect(wrapper.text()).toContain("Wygenerowane dokumenty");
    expect(wrapper.text()).toContain("2");
  });

  it("shows a recent document on the dashboard", async () => {
    const wrapper = await mountAuthenticatedApp({
      dashboard: {
        document_count: 1,
        client_count: 1,
        template_count: 1,
        recent_documents: [{
          id: 1,
          document_number: "DOK/20261017/0001",
          title: "Oferta testowa",
          client: { name: testClient.name },
          template: { document_type_label: "Oferta" },
          created_at: "2026-10-17T10:00:00Z",
          downloads: {},
        }],
      },
    });
    expect(wrapper.text()).toContain("Oferta testowa");
    expect(wrapper.text()).toContain("DOK/20261017/0001");
  });

  it("shows a dashboard loading error", async () => {
    api.session.mockResolvedValue({
      authenticated: true,
      user: { id: 1, username: "tester", name: "Test User" },
    });
    api.dashboard.mockRejectedValue(new Error("Pulpit jest niedostępny"));
    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Pulpit jest niedostępny");
  });

  it("shows the empty state when the client list is empty", async () => {
    const wrapper = await mountAuthenticatedApp();
    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Brak klientów");
  });

  it("lists client contact information", async () => {
    const wrapper = await mountAuthenticatedApp({ clients: [testClient] });
    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("klient@example.com");
    expect(wrapper.text()).toContain("Klient testowy");
  });

  it("surfaces errors when loading clients", async () => {
    const wrapper = await mountAuthenticatedApp();
    api.clients.mockRejectedValueOnce(new Error("Błąd pobierania klientów"));
    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Błąd pobierania klientów");
  });

  it("surfaces client validation errors", async () => {
    const wrapper = await mountAuthenticatedApp();
    api.createClient.mockRejectedValueOnce(new Error("Nieprawidłowy e-mail"));
    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await wrapper.get("#client-name").setValue("Klient");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Nieprawidłowy e-mail");
  });

  it("clears the client name after saving successfully", async () => {
    const wrapper = await mountAuthenticatedApp();
    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await wrapper.get("#client-name").setValue("Nowy klient");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("#client-name").element.value).toBe("");
  });

  it("shows the empty state when there are no templates", async () => {
    const wrapper = await mountAuthenticatedApp();
    await wrapper.get(".main-nav").findAll("button")[3].trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Brak szablonów");
  });

  it("shows inactive templates with their inactive badge", async () => {
    const wrapper = await mountAuthenticatedApp({
      templates: [{ ...testTemplate, is_active: false }],
    });
    await wrapper.get(".main-nav").findAll("button")[3].trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Nieaktywny");
  });

  it("submits a new agreement template", async () => {
    const wrapper = await mountAuthenticatedApp();
    let submittedTemplate;
    api.createTemplate.mockImplementation((data) => {
      submittedTemplate = { ...data };
      return Promise.resolve({ template: testTemplate });
    });
    await wrapper.get(".main-nav").findAll("button")[3].trigger("click");
    await wrapper.get("#template-name").setValue("Nowa umowa");
    await wrapper.get("#template-content").setValue("Treść umowy");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(submittedTemplate).toMatchObject({
      name: "Nowa umowa",
      document_type: "agreement",
      content: "Treść umowy",
    });
    expect(wrapper.text()).toContain("Szablon został zapisany.");
  });

  it("shows errors when template creation fails", async () => {
    const wrapper = await mountAuthenticatedApp();
    api.createTemplate.mockRejectedValueOnce(new Error("Błąd zapisu szablonu"));
    await wrapper.get(".main-nav").findAll("button")[3].trigger("click");
    await wrapper.get("#template-name").setValue("Szablon");
    await wrapper.get("#template-content").setValue("Treść");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Błąd zapisu szablonu");
  });

  it("prompts for a template before document generation", async () => {
    const wrapper = await mountAuthenticatedApp();
    await wrapper.get(".main-nav").findAll("button")[4].trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Brak aktywnych szablonów");
  });

  it("prompts for a client before document generation", async () => {
    const wrapper = await mountAuthenticatedApp({ templates: [testTemplate] });
    await wrapper.get(".main-nav").findAll("button")[4].trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Najpierw dodaj klienta");
  });

  it("excludes inactive templates from document generation choices", async () => {
    const wrapper = await mountAuthenticatedApp({
      clients: [testClient],
      templates: [testTemplate, { ...testTemplate, id: 2, name: "Nieaktywna", is_active: false }],
    });
    await wrapper.get(".main-nav").findAll("button")[4].trigger("click");
    await flushPromises();
    expect(wrapper.get("#document-template").text()).toContain("Umowa testowa");
    expect(wrapper.get("#document-template").text()).not.toContain("Nieaktywna");
  });

  it("shows custom fields and a suggested title for the selected template", async () => {
    const wrapper = await mountAuthenticatedApp({ clients: [testClient], templates: [testTemplate] });
    await wrapper.get(".main-nav").findAll("button")[4].trigger("click");
    await flushPromises();
    await wrapper.get("#document-template").setValue("1");
    expect(wrapper.get("#document-title").element.value).toBe("Umowa testowa");
    expect(wrapper.find("#custom-kwota").exists()).toBe(true);
  });

  it("generates a document and opens the archive after success", async () => {
    const wrapper = await mountAuthenticatedApp({ clients: [testClient], templates: [testTemplate] });
    await wrapper.get(".main-nav").findAll("button")[4].trigger("click");
    await flushPromises();
    await wrapper.get("#document-template").setValue("1");
    await wrapper.get("#document-client").setValue("1");
    await wrapper.get("#document-title").setValue("Umowa klienta");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(api.generateDocument).toHaveBeenCalledWith(expect.objectContaining({
      template: "1",
      client: 1,
      title: "Umowa klienta",
    }));
    expect(wrapper.text()).toContain("DOK/20261017/TEST0001");
    expect(wrapper.text()).toContain("Archiwum");
  });

  it("shows errors when document generation fails", async () => {
    const wrapper = await mountAuthenticatedApp({ clients: [testClient], templates: [testTemplate] });
    api.generateDocument.mockRejectedValueOnce(new Error("Błąd generowania"));
    await wrapper.get(".main-nav").findAll("button")[4].trigger("click");
    await flushPromises();
    await wrapper.get("#document-template").setValue("1");
    await wrapper.get("#document-client").setValue("1");
    await wrapper.get("#document-title").setValue("Umowa");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Błąd generowania");
  });

  it("shows the empty archive state", async () => {
    const wrapper = await mountAuthenticatedApp();
    await wrapper.get(".main-nav").findAll("button")[1].trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Archiwum jest puste");
  });

  it("renders both download links in the archive", async () => {
    const documents = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      document_number: `DOK/20261017/000${index + 1}`,
      title: `Dokument ${index + 1}`,
      client: { name: testClient.name },
      template: { document_type_label: "Umowa" },
      created_at: "2026-10-17T10:00:00Z",
      downloads: { docx: `/dokumenty/${index + 1}/docx/`, pdf: `/dokumenty/${index + 1}/pdf/` },
    }));
    const wrapper = await mountAuthenticatedApp({
      documents,
    });
    await wrapper.get(".main-nav").findAll("button")[1].trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Wszystkie wygenerowane dokumenty");
    expect(wrapper.text()).toContain("Dokument 1");
    expect(wrapper.text()).toContain("Dokument 8");
    expect(wrapper.findAll(".table-wrap tbody tr")).toHaveLength(documents.length);
    expect(wrapper.get('a[href="/dokumenty/1/docx/"]').text()).toBe("DOCX");
    expect(wrapper.get('a[href="/dokumenty/1/pdf/"]').text()).toBe("PDF");
  });

  it("returns to the login form after logout", async () => {
    const wrapper = await mountAuthenticatedApp();
    await wrapper.get(".account-area button").trigger("click");
    await flushPromises();
    expect(wrapper.get("#login-username").exists()).toBe(true);
    expect(api.logout).toHaveBeenCalledOnce();
  });
});

import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("Vue document app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a login form for an anonymous session", async () => {
    api.session.mockResolvedValue({ authenticated: false });
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.get("h1").text()).toContain("Dokumenty");
    expect(wrapper.get("#login-username").exists()).toBe(true);
    expect(wrapper.get("#login-password").exists()).toBe(true);
    wrapper.unmount();
  });

  it("loads the document dashboard for an authenticated user", async () => {
    api.session.mockResolvedValue({
      authenticated: true,
      user: { id: 1, username: "test", name: "Test User" },
    });
    api.dashboard.mockResolvedValue({
      document_count: 2,
      client_count: 3,
      template_count: 1,
      recent_documents: [
        {
          id: 42,
          document_number: "DOK/20261018/ABC123",
          title: "Umowa testowa",
          client: { name: "Klient testowy" },
          template: { document_type_label: "Umowa" },
          created_at: "2026-10-18T10:00:00Z",
          downloads: {
            docx: "/dokumenty/42/pobierz/docx/",
            pdf: "/dokumenty/42/pobierz/pdf/",
          },
        },
      ],
    });
    const wrapper = mount(App);
    await flushPromises();

    expect(api.dashboard).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain("Dzień dobry, Test User");
    expect(wrapper.text()).toContain("Wygenerowane dokumenty");
    expect(wrapper.get('a[href="/dokumenty/42/pobierz/docx/"]').text()).toBe("DOCX");
    expect(wrapper.get('a[href="/dokumenty/42/pobierz/pdf/"]').text()).toBe("PDF");
    wrapper.unmount();
  });

  it("saves a new client from the Vue client form", async () => {
    api.session.mockResolvedValue({
      authenticated: true,
      user: { id: 1, username: "test", name: "Test User" },
    });
    api.dashboard.mockResolvedValue({
      document_count: 0,
      client_count: 0,
      template_count: 0,
      recent_documents: [],
    });
    api.clients
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({
        results: [{ id: 1, name: "Nowy klient", address: "", tax_id: "", email: "", phone: "" }],
      });
    let submittedClient;
    api.createClient.mockImplementation((data) => {
      submittedClient = { ...data };
      return Promise.resolve({ client: { id: 1, name: "Nowy klient" } });
    });
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.get(".main-nav").findAll("button")[2].trigger("click");
    await wrapper.get("#client-name").setValue("Nowy klient");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(submittedClient).toMatchObject({ name: "Nowy klient" });
    expect(wrapper.text()).toContain("Klient został zapisany.");
    expect(wrapper.text()).toContain("Nowy klient");
    wrapper.unmount();
  });
});

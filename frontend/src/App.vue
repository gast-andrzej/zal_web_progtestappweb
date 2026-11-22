<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import { api, errorMessage } from "./api";

const session = ref(null);
const activePage = ref("dashboard");
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const notice = ref("");
const dashboard = ref(null);
const clients = ref([]);
const templates = ref([]);
const documents = ref([]);
const loginForm = reactive({ username: "", password: "" });
const clientForm = reactive({ name: "", address: "", tax_id: "", email: "", phone: "" });
const templateForm = reactive({ name: "", document_type: "agreement", content: "", is_active: true });
const documentForm = reactive({ template: "", client: "", title: "" });

const pageTitles = {
  dashboard: ["Pulpit", "Przegląd dokumentów i aktywności firmy."],
  documents: ["Dokumenty", "Archiwum wygenerowanych dokumentów."],
  clients: ["Klienci", "Zarządzaj danymi klientów."],
  templates: ["Szablony", "Przygotuj szablony umów, ofert i faktur."],
  generate: ["Generuj dokument", "Uzupełnij dane i pobierz gotowy dokument."],
};

const activeTemplates = computed(() => templates.value.filter((template) => template.is_active));
const selectedTemplate = computed(() =>
  templates.value.find((template) => String(template.id) === String(documentForm.template)),
);

function resetMessages() {
  error.value = "";
  notice.value = "";
}

async function refreshDashboard() {
  dashboard.value = await api.dashboard();
}

async function refreshClients() {
  clients.value = (await api.clients()).results;
}

async function refreshTemplates() {
  templates.value = (await api.templates()).results;
}

async function refreshDocuments() {
  documents.value = (await api.documents()).results;
}

async function loadPage(page) {
  resetMessages();
  activePage.value = page;
  try {
    if (page === "dashboard") await refreshDashboard();
    if (page === "clients") await refreshClients();
    if (page === "templates") await refreshTemplates();
    if (page === "documents") await refreshDocuments();
    if (page === "generate") {
      await Promise.all([refreshClients(), refreshTemplates()]);
    }
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}

async function submitLogin() {
  saving.value = true;
  resetMessages();
  try {
    session.value = await api.login(loginForm.username, loginForm.password);
    loginForm.password = "";
    await loadPage("dashboard");
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    saving.value = false;
  }
}

async function submitLogout() {
  try {
    await api.logout();
    session.value = { authenticated: false };
    activePage.value = "dashboard";
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}

async function submitClient() {
  saving.value = true;
  resetMessages();
  try {
    await api.createClient(clientForm);
    Object.assign(clientForm, { name: "", address: "", tax_id: "", email: "", phone: "" });
    await refreshClients();
    notice.value = "Klient został zapisany.";
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    saving.value = false;
  }
}

async function submitTemplate() {
  saving.value = true;
  resetMessages();
  try {
    await api.createTemplate(templateForm);
    Object.assign(templateForm, {
      name: "",
      document_type: "agreement",
      content: "",
      is_active: true,
    });
    await refreshTemplates();
    notice.value = "Szablon został zapisany.";
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    saving.value = false;
  }
}

async function submitDocument() {
  saving.value = true;
  resetMessages();
  try {
    const result = await api.generateDocument(documentForm);
    await refreshDocuments();
    await refreshDashboard();
    notice.value = `Dokument ${result.document.document_number} został wygenerowany.`;
    activePage.value = "documents";
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    saving.value = false;
  }
}

function startGeneration(templateId = "") {
  documentForm.template = templateId ? String(templateId) : "";
  documentForm.client = "";
  documentForm.title = "";
  void loadPage("generate");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(new Date(value));
}

function downloadUrl(document, type) {
  return document.downloads[type];
}

onMounted(async () => {
  try {
    session.value = await api.session();
    if (session.value.authenticated) await loadPage("dashboard");
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div v-if="loading" class="startup-screen" role="status">Uruchamiam panel dokumentów…</div>

  <main v-else-if="!session?.authenticated" class="login-shell">
    <section class="login-card">
      <p class="eyebrow">PANEL FIRMOWY</p>
      <h1>Dokumenty <span>Firmowe</span></h1>
      <p class="muted">Zaloguj się, aby zarządzać dokumentami i klientami.</p>
      <form class="form-stack" @submit.prevent="submitLogin">
        <label for="login-username">Nazwa użytkownika</label>
        <input id="login-username" v-model="loginForm.username" autocomplete="username" required />
        <label for="login-password">Hasło</label>
        <input
          id="login-password"
          v-model="loginForm.password"
          type="password"
          autocomplete="current-password"
          required
        />
        <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
        <button class="button primary full-width" :disabled="saving">
          {{ saving ? "Logowanie…" : "Zaloguj się" }}
        </button>
      </form>
    </section>
  </main>

  <div v-else class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" @click.prevent="loadPage('dashboard')">
        Dokumenty<span>Firmowe</span>
      </a>
      <nav class="main-nav" aria-label="Nawigacja główna">
        <button
          v-for="(title, page) in pageTitles"
          :key="page"
          class="nav-link"
          :class="{ selected: activePage === page }"
          @click="page === 'generate' ? startGeneration() : loadPage(page)"
        >
          {{ title[0] }}
        </button>
      </nav>
      <div class="account-area">
        <span class="user-name">{{ session.user.name }}</span>
        <button class="button secondary small-button" @click="submitLogout">Wyloguj</button>
      </div>
    </header>

    <main class="container">
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="alert alert-success" role="status">{{ notice }}</p>

      <template v-if="activePage === 'dashboard'">
        <section class="page-heading">
          <div>
            <p class="eyebrow">CENTRUM DOKUMENTÓW</p>
            <h1>Dzień dobry, {{ session.user.name }}</h1>
            <p class="muted">{{ pageTitles.dashboard[1] }}</p>
          </div>
          <button class="button primary" @click="startGeneration()">+ Nowy dokument</button>
        </section>
        <section v-if="dashboard" class="stats">
          <article class="stat-card"><span>Wygenerowane dokumenty</span><strong>{{ dashboard.document_count }}</strong></article>
          <article class="stat-card"><span>Klienci</span><strong>{{ dashboard.client_count }}</strong></article>
          <article class="stat-card"><span>Aktywne szablony</span><strong>{{ dashboard.template_count }}</strong></article>
        </section>
        <section class="panel">
          <div class="section-heading">
            <div><h2>Ostatnie dokumenty</h2><p class="muted">Najnowsze dokumenty i pliki do pobrania.</p></div>
            <button class="text-button" @click="loadPage('documents')">Zobacz wszystkie →</button>
          </div>
          <DocumentTable :documents="dashboard?.recent_documents || []" show-downloads @generate="startGeneration" />
        </section>
      </template>

      <template v-else-if="activePage === 'clients'">
        <PageHeading eyebrow="BAZA KONTAKTÓW" title="Klienci" description="Dane klientów dostępne podczas generowania dokumentów." />
        <div class="content-grid">
          <section class="panel form-panel">
            <h2>Dodaj klienta</h2>
            <form class="form-stack" @submit.prevent="submitClient">
              <label for="client-name">Nazwa / imię i nazwisko</label>
              <input id="client-name" v-model="clientForm.name" required maxlength="200" />
              <label for="client-address">Adres</label>
              <input id="client-address" v-model="clientForm.address" />
              <label for="client-tax">NIP</label>
              <input id="client-tax" v-model="clientForm.tax_id" />
              <label for="client-email">E-mail</label>
              <input id="client-email" v-model="clientForm.email" type="email" />
              <label for="client-phone">Telefon</label>
              <input id="client-phone" v-model="clientForm.phone" />
              <button class="button primary" :disabled="saving">{{ saving ? "Zapisywanie…" : "Zapisz klienta" }}</button>
            </form>
          </section>
          <section class="panel table-panel">
            <div class="section-heading"><div><h2>Twoi klienci</h2><p class="muted">{{ clients.length }} rekordów</p></div></div>
            <div v-if="clients.length" class="table-wrap">
              <table><thead><tr><th>Nazwa</th><th>NIP</th><th>E-mail</th><th>Telefon</th></tr></thead>
                <tbody><tr v-for="client in clients" :key="client.id">
                  <td>{{ client.name }}</td><td>{{ client.tax_id || "—" }}</td><td>{{ client.email || "—" }}</td><td>{{ client.phone || "—" }}</td>
                </tr></tbody>
              </table>
            </div>
            <EmptyState v-else title="Brak klientów" description="Dodaj klienta, aby użyć jego danych w dokumencie." />
          </section>
        </div>
      </template>

      <template v-else-if="activePage === 'templates'">
        <PageHeading eyebrow="AUTOMATYZACJA" title="Szablony dokumentów" description="Szablony umów, ofert i faktur z polami do automatycznego uzupełnienia." />
        <div class="content-grid">
          <section class="panel form-panel">
            <h2>Utwórz szablon</h2>
            <form class="form-stack" @submit.prevent="submitTemplate">
              <label for="template-name">Nazwa szablonu</label>
              <input id="template-name" v-model="templateForm.name" required maxlength="150" />
              <label for="template-type">Rodzaj dokumentu</label>
              <select id="template-type" v-model="templateForm.document_type">
                <option value="agreement">Umowa</option><option value="offer">Oferta</option><option value="invoice">Faktura</option>
              </select>
              <label for="template-content">Treść</label>
              <textarea id="template-content" v-model="templateForm.content" rows="10" required />
              <label class="checkbox-row"><input v-model="templateForm.is_active" type="checkbox" /> Szablon aktywny</label>
              <button class="button primary" :disabled="saving">{{ saving ? "Zapisywanie…" : "Zapisz szablon" }}</button>
              <p class="muted hint-text">Używaj pól w formacie <code>&#123;&#123; nazwa_pola &#125;&#125;</code>. Dane firmy i klienta są automatyczne.</p>
            </form>
          </section>
          <section class="panel table-panel">
            <div class="section-heading"><div><h2>Dostępne szablony</h2><p class="muted">{{ templates.length }} rekordów</p></div></div>
            <div v-if="templates.length" class="table-wrap">
              <table><thead><tr><th>Nazwa</th><th>Rodzaj</th><th>Status</th></tr></thead>
                <tbody><tr v-for="template in templates" :key="template.id">
                  <td>{{ template.name }}</td><td>{{ template.document_type_label }}</td>
                  <td><span class="badge" :class="template.is_active ? 'active' : 'inactive'">{{ template.is_active ? "Aktywny" : "Nieaktywny" }}</span></td>
                </tr></tbody>
              </table>
            </div>
            <EmptyState v-else title="Brak szablonów" description="Dodaj szablon, aby zacząć generować dokumenty." />
          </section>
        </div>
      </template>

      <template v-else-if="activePage === 'generate'">
        <PageHeading eyebrow="NOWY DOKUMENT" title="Generuj dokument" description="Wybierz szablon i klienta. Przygotujemy pliki DOCX oraz PDF." />
        <section class="panel form-panel generation-panel">
          <EmptyState v-if="!activeTemplates.length" title="Brak aktywnych szablonów" description="Najpierw dodaj aktywny szablon w sekcji Szablony." />
          <EmptyState v-else-if="!clients.length" title="Brak klientów" description="Najpierw dodaj klienta w sekcji Klienci." />
          <form v-else class="form-stack" @submit.prevent="submitDocument">
            <label for="document-template">Szablon</label>
            <select id="document-template" v-model="documentForm.template" required @change="documentForm.title = selectedTemplate?.name || ''">
              <option value="" disabled>Wybierz szablon</option>
              <option v-for="template in activeTemplates" :key="template.id" :value="String(template.id)">{{ template.name }} · {{ template.document_type_label }}</option>
            </select>
            <label for="document-client">Klient</label>
            <select id="document-client" v-model="documentForm.client" required>
              <option value="" disabled>Wybierz klienta</option>
              <option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option>
            </select>
            <label for="document-title">Tytuł dokumentu</label>
            <input id="document-title" v-model="documentForm.title" required maxlength="200" />
            <template v-if="selectedTemplate">
              <template v-for="field in selectedTemplate.fields.filter((name) => !['company_name','company_address','company_tax_id','company_email','company_phone','client_name','client_address','client_tax_id','client_email','client_phone','document_number','document_date','title'].includes(name))" :key="field">
                <label :for="`custom-${field}`">{{ field.replaceAll("_", " ") }}</label>
                <input :id="`custom-${field}`" v-model="documentForm[field]" :placeholder="`Wartość dla pola ${field}`" />
              </template>
            </template>
            <div class="form-actions">
              <button class="button primary" :disabled="saving">{{ saving ? "Generowanie…" : "Wygeneruj DOCX i PDF" }}</button>
            </div>
          </form>
        </section>
      </template>

      <template v-else-if="activePage === 'documents'">
        <PageHeading eyebrow="ARCHIWUM" title="Wygenerowane dokumenty" description="Historia dokumentów i pliki gotowe do pobrania." />
        <section class="panel">
          <div class="section-heading"><div><h2>Wszystkie wygenerowane dokumenty</h2><p class="muted">{{ documents.length }} dokumentów</p></div><button class="button primary" @click="startGeneration()">+ Nowy dokument</button></div>
          <div v-if="documents.length" class="table-wrap">
            <table>
              <thead><tr><th>Numer</th><th>Tytuł</th><th>Klient</th><th>Rodzaj</th><th>Data</th><th>Pliki</th></tr></thead>
              <tbody>
                <tr v-for="document in documents" :key="document.id">
                  <td class="number-cell">{{ document.document_number }}</td>
                  <td>{{ document.title }}</td>
                  <td>{{ document.client.name }}</td>
                  <td>{{ document.template.document_type_label }}</td>
                  <td>{{ formatDate(document.created_at) }}</td>
                  <td class="download-cell"><a :href="document.downloads.docx">DOCX</a><a :href="document.downloads.pdf">PDF</a></td>
                </tr>
              </tbody>
            </table>
          </div>
          <EmptyState v-else title="Archiwum jest puste" description="Wygeneruj pierwszy dokument, aby zobaczyć go tutaj.">
            <button class="button primary" @click="startGeneration">Rozpocznij</button>
          </EmptyState>
        </section>
      </template>
    </main>
  </div>
</template>

<script>
const EmptyState = {
  props: { title: String, description: String },
  template: `<div class="empty-state"><h3>{{ title }}</h3><p>{{ description }}</p><slot /></div>`,
};

const DocumentTable = {
  props: { documents: { type: Array, default: () => [] }, showDownloads: Boolean },
  emits: ["generate"],
  components: { EmptyState },
  methods: {
    formatDate(value) {
      return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(new Date(value));
    },
  },
  template: `
    <div v-if="documents.length" class="table-wrap">
      <table>
        <thead><tr><th>Numer</th><th>Tytuł</th><th>Klient</th><th>Rodzaj</th><th>Data</th><th v-if="showDownloads">Pliki</th></tr></thead>
        <tbody><tr v-for="document in documents" :key="document.id">
          <td class="number-cell">{{ document.document_number }}</td>
          <td>{{ document.title }}</td><td>{{ document.client.name }}</td><td>{{ document.template.document_type_label }}</td><td>{{ formatDate(document.created_at) }}</td>
          <td v-if="showDownloads" class="download-cell"><a :href="document.downloads.docx">DOCX</a><a :href="document.downloads.pdf">PDF</a></td>
        </tr></tbody>
      </table>
    </div>
    <EmptyState v-else title="Archiwum jest puste" description="Wygeneruj pierwszy dokument, aby zobaczyć go tutaj.">
      <button v-if="showDownloads" class="button primary" @click="$emit('generate')">Rozpocznij</button>
    </EmptyState>`,
};

const PageHeading = {
  props: { eyebrow: String, title: String, description: String },
  template: `<section class="page-heading"><div><p class="eyebrow">{{ eyebrow }}</p><h1>{{ title }}</h1><p class="muted">{{ description }}</p></div></section>`,
};

export default { components: { DocumentTable, PageHeading, EmptyState } };
</script>

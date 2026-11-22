import json
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from documents.models import Client, DocumentTemplate, GeneratedDocument


class DawidIntegrationTests(TestCase):
    def setUp(self):
        self.media_dir = TemporaryDirectory()
        self.media_settings = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.media_settings.enable()
        self.user = get_user_model().objects.create_user(
            username="dawid-integration",
            password="safe-integration-password",
        )
        self.client.force_login(self.user)

    def tearDown(self):
        self.media_settings.disable()
        self.media_dir.cleanup()

    def json_request(self, method, url, data=None):
        return getattr(self.client, method)(
            url,
            data=json.dumps(data if data is not None else {}),
            content_type="application/json",
        )

    def test_1_dashboard_contains_real_database_counts(self):
        Client.objects.create(name="Klient pulpitowy")
        DocumentTemplate.objects.create(
            name="Szablon pulpitowy",
            document_type=DocumentTemplate.DocumentType.OFFER,
            content="Oferta",
            is_active=True,
        )

        response = self.client.get(reverse("api_dashboard"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["client_count"], 1)
        self.assertEqual(response.json()["template_count"], 1)
        self.assertEqual(response.json()["document_count"], 0)

    def test_2_anonymous_dashboard_is_protected(self):
        self.client.logout()

        response = self.client.get(reverse("api_dashboard"))

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Zaloguj się, aby kontynuować.")

    def test_3_client_creation_persists_all_contact_fields(self):
        response = self.json_request(
            "post",
            reverse("api_clients"),
            {
                "name": "Spółka Dawida",
                "address": "Gdańsk",
                "tax_id": "PL9876543210",
                "email": "dawid@example.com",
                "phone": "123456789",
            },
        )

        self.assertEqual(response.status_code, 201)
        saved = Client.objects.get(name="Spółka Dawida")
        self.assertEqual(saved.address, "Gdańsk")
        self.assertEqual(saved.email, "dawid@example.com")
        self.assertEqual(saved.phone, "123456789")

    def test_4_client_list_is_sorted_by_name(self):
        Client.objects.create(name="Zygmunt")
        Client.objects.create(name="Anna")

        response = self.client.get(reverse("api_clients"))

        self.assertEqual(response.status_code, 200)
        names = [item["name"] for item in response.json()["results"]]
        self.assertEqual(names, ["Anna", "Zygmunt"])

    def test_5_template_creation_extracts_custom_fields(self):
        response = self.json_request(
            "post",
            reverse("api_templates"),
            {
                "name": "Umowa zintegrowana",
                "document_type": DocumentTemplate.DocumentType.AGREEMENT,
                "content": "Klient {{client_name}} okres {{ okres }} kwota {{kwota}} okres {{ okres }}",
                "is_active": True,
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["template"]["fields"], ["client_name", "kwota", "okres"])
        self.assertTrue(DocumentTemplate.objects.filter(name="Umowa zintegrowana").exists())

    def test_6_inactive_template_is_excluded_from_generation(self):
        inactive = DocumentTemplate.objects.create(
            name="Nieaktywny szablon",
            document_type=DocumentTemplate.DocumentType.INVOICE,
            content="Faktura",
            is_active=False,
        )
        client = Client.objects.create(name="Klient dokumentu")

        response = self.json_request(
            "post",
            reverse("api_documents"),
            {"template": inactive.pk, "client": client.pk, "title": "Test"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertFalse(GeneratedDocument.objects.exists())

    def test_7_document_api_creates_history_and_download_links(self):
        client = Client.objects.create(name="Klient API integracji")
        template = DocumentTemplate.objects.create(
            name="Oferta integracyjna",
            document_type=DocumentTemplate.DocumentType.OFFER,
            content="Oferta dla {{ client_name }} na {{ okres }}",
            is_active=True,
        )

        response = self.json_request(
            "post",
            reverse("api_documents"),
            {
                "template": template.pk,
                "client": client.pk,
                "title": "Oferta z testu",
                "okres": "30 dni",
            },
        )

        self.assertEqual(response.status_code, 201)
        document = GeneratedDocument.objects.get()
        self.assertIn("30 dni", document.content_snapshot)
        data = response.json()["document"]
        self.assertEqual(data["id"], document.pk)
        self.assertTrue(data["downloads"]["docx"].endswith("/pobierz/docx/"))
        self.assertTrue(data["downloads"]["pdf"].endswith("/pobierz/pdf/"))

    def test_8_document_detail_returns_saved_document(self):
        client = Client.objects.create(name="Klient szczegółów")
        template = DocumentTemplate.objects.create(
            name="Umowa szczegółów",
            document_type=DocumentTemplate.DocumentType.AGREEMENT,
            content="Treść umowy",
        )
        document = GeneratedDocument.objects.create(
            template=template,
            client=client,
            document_number="DOK/20261122/INT0001",
            title="Umowa integracyjna",
            content_snapshot="Treść umowy",
            docx_file="documents/docx/test.docx",
            pdf_file="documents/pdf/test.pdf",
            created_by=self.user,
        )

        response = self.client.get(reverse("api_document_detail", args=[document.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["document"]["title"], "Umowa integracyjna")
        self.assertEqual(response.json()["document"]["client"]["name"], "Klient szczegółów")

    def test_9_missing_document_detail_returns_404(self):
        response = self.client.get(reverse("api_document_detail", args=[999999]))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Nie znaleziono dokumentu.")

    def test_10_template_api_rejects_unknown_document_type(self):
        response = self.json_request(
            "post",
            reverse("api_templates"),
            {
                "name": "Nieprawidłowy szablon",
                "document_type": "unknown-type",
                "content": "Treść",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("document_type", response.json()["errors"])
        self.assertFalse(DocumentTemplate.objects.filter(name="Nieprawidłowy szablon").exists())
